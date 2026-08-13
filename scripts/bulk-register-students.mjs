import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'

const DEFAULT_EMAIL_FILE = path.resolve('scripts/student-emails.txt')
const emailFile = path.resolve(process.argv[2] || DEFAULT_EMAIL_FILE)
const outputFile = path.resolve('bulk-student-registration-results.csv')
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const DEFAULT_SHARED_STUDENT_PASSWORD = 'Password@123'
const fixedPassword = process.env.DEFAULT_STUDENT_PASSWORD || DEFAULT_SHARED_STUDENT_PASSWORD
const dryRun = ['1', 'true', 'yes'].includes(String(process.env.DRY_RUN || '').toLowerCase())

function fail(message) {
  console.error(`\nERROR: ${message}\n`)
  process.exit(1)
}

function extractEmails(text) {
  const matches = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || []
  const seen = new Set()
  const emails = []
  for (const raw of matches) {
    const email = raw.trim().toLowerCase()
    if (!seen.has(email)) {
      seen.add(email)
      emails.push(email)
    }
  }
  return emails
}

function fullNameFromEmail(email) {
  const local = email.split('@')[0] || ''
  return local
    .replace(/[._-]+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ') || email
}

function generatePassword() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%'
  const bytes = crypto.randomBytes(16)
  let password = ''
  for (const byte of bytes) password += alphabet[byte % alphabet.length]
  return `${password}Aa1!`.slice(0, 18)
}

function csvEscape(value) {
  const text = value == null ? '' : String(value)
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`
  return text
}

async function listAuthUsersByEmail(supabase) {
  const map = new Map()
  let page = 1
  const perPage = 1000

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage })
    if (error) throw error
    const users = data?.users || []
    for (const user of users) {
      if (user.email) map.set(user.email.toLowerCase(), user)
    }
    if (users.length < perPage) break
    page += 1
  }

  return map
}

async function main() {
  if (!supabaseUrl) fail('Set SUPABASE_URL or VITE_SUPABASE_URL before running this command.')
  if (!serviceRoleKey) fail('Set SUPABASE_SERVICE_ROLE_KEY before running this command. Never expose it in frontend code.')

  const source = await fs.readFile(emailFile, 'utf8').catch((error) => fail(`Could not read email file: ${emailFile}\n${error.message}`))
  const emails = extractEmails(source)
  if (!emails.length) fail(`No valid emails found in ${emailFile}`)

  console.log(`Found ${emails.length} unique email(s) in ${path.relative(process.cwd(), emailFile)}.`)
  if (dryRun) console.log('DRY_RUN is enabled. No Supabase records will be changed.')

  let supabase = null
  if (!dryRun) {
    const { createClient } = await import('@supabase/supabase-js')
    supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })
  }

  const existingAuthUsers = dryRun ? new Map() : await listAuthUsersByEmail(supabase)
  const results = []

  for (const email of emails) {
    const fullName = fullNameFromEmail(email)
    const tempPassword = fixedPassword || generatePassword()
    let authUser = existingAuthUsers.get(email) || null
    let authStatus = authUser ? 'auth_existing' : 'auth_created'
    let profileStatus = 'profile_skipped'
    let errorMessage = ''

    try {
      if (!dryRun && !authUser) {
        const { data, error } = await supabase.auth.admin.createUser({
          email,
          password: tempPassword,
          email_confirm: true,
          user_metadata: {
            full_name: fullName,
            role: 'student',
            status: 'Active',
          },
        })

        if (error) throw error
        authUser = data?.user || null
      }

      if (!dryRun) {
        const { data: existingProfile, error: profileLookupError } = await supabase
          .from('profiles')
          .select('id,email,full_name,role,status')
          .ilike('email', email)
          .maybeSingle()

        if (profileLookupError) throw profileLookupError

        const profilePayload = {
          email,
          full_name: existingProfile?.full_name || fullName,
          role: 'student',
          status: 'Active',
          updated_at: new Date().toISOString(),
        }

        if (existingProfile?.id) {
          const { error: updateError } = await supabase
            .from('profiles')
            .update(profilePayload)
            .eq('id', existingProfile.id)
          if (updateError) throw updateError
          profileStatus = 'profile_updated'
        } else {
          const insertPayload = {
            id: authUser?.id || crypto.randomUUID(),
            ...profilePayload,
          }
          const { error: insertError } = await supabase.from('profiles').insert(insertPayload)
          if (insertError) throw insertError
          profileStatus = 'profile_created'
        }
      } else {
        authStatus = 'dry_run'
        profileStatus = 'dry_run'
      }

      console.log(`OK  ${email}  ${authStatus}, ${profileStatus}`)
      results.push({
        email,
        full_name: fullName,
        role: 'student',
        status: 'Active',
        auth_status: authStatus,
        profile_status: profileStatus,
        temporary_password: authStatus === 'auth_created' || dryRun ? tempPassword : '',
        error: '',
      })
    } catch (error) {
      errorMessage = error?.message || String(error)
      console.log(`ERR ${email}  ${errorMessage}`)
      results.push({
        email,
        full_name: fullName,
        role: 'student',
        status: 'Active',
        auth_status: authStatus,
        profile_status: profileStatus,
        temporary_password: '',
        error: errorMessage,
      })
    }
  }

  const headers = ['email', 'full_name', 'role', 'status', 'auth_status', 'profile_status', 'temporary_password', 'error']
  const csv = [headers.join(','), ...results.map((row) => headers.map((key) => csvEscape(row[key])).join(','))].join('\n')
  await fs.writeFile(outputFile, `${csv}\n`, 'utf8')

  const created = results.filter((r) => r.auth_status === 'auth_created').length
  const existing = results.filter((r) => r.auth_status === 'auth_existing').length
  const failed = results.filter((r) => r.error).length

  console.log('\nFinished.')
  console.log(`Auth users created: ${created}`)
  console.log(`Auth users already existing: ${existing}`)
  console.log(`Failed: ${failed}`)
  console.log(`Report written to: ${path.relative(process.cwd(), outputFile)}`)
  if (created > 0) {
    console.log('Newly created student accounts use the shared temporary password. Ask students to change it after first login.')
  }
}

main().catch((error) => fail(error?.message || String(error)))

import 'dotenv/config'
import xlsx from 'xlsx'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const DEFAULT_PASSWORD = process.env.DEFAULT_STUDENT_PASSWORD || 'Password@123'

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.import')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})

const filePath = process.argv[2] || 'students.xlsx'

function clean(value) {
  return String(value || '').trim()
}

function cleanEmail(value) {
  return String(value || '').trim().toLowerCase()
}

function getValue(row, keys) {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null && String(row[key]).trim() !== '') {
      return row[key]
    }
  }
  return ''
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

async function main() {
  const workbook = xlsx.readFile(filePath)
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  const rows = xlsx.utils.sheet_to_json(sheet)

  console.log(`Found ${rows.length} rows in ${filePath}`)

  let created = 0
  let skipped = 0
  let failed = 0

  for (const row of rows) {
    const fullName = clean(
      getValue(row, [
        'full_name',
        'Full_name',
        'FULL_NAME',
        'Full Name',
        'full name',
        'name',
        'Name',
        'FullName',
      ])
    )

    const email = cleanEmail(
      getValue(row, [
        'email',
        'Email',
        'EMAIL',
        'E-mail',
        'e-mail',
      ])
    )

    if (!fullName || !email) {
      console.log('Skipped row: missing name or email', row)
      skipped++
      continue
    }

    if (!isValidEmail(email)) {
      console.log(`Skipped invalid email: ${fullName} <${email}>`)
      skipped++
      continue
    }

    try {
      const { data, error } = await supabase.auth.admin.createUser({
        email,
        password: DEFAULT_PASSWORD,
        email_confirm: true,
        user_metadata: {
          full_name: fullName,
          role: 'student',
        },
      })

      if (error) {
        console.log(`Skipped/failed ${email}: ${error.message}`)
        skipped++
        continue
      }

      const userId = data.user?.id

      if (!userId) {
        console.log(`Failed ${email}: no user id returned`)
        failed++
        continue
      }

      const { error: profileError } = await supabase
        .from('profiles')
        .upsert(
          {
            id: userId,
            email,
            full_name: fullName,
            role: 'student',
          },
          { onConflict: 'id' }
        )

      if (profileError) {
        console.log(`User created but profile failed for ${email}: ${profileError.message}`)
        failed++
        continue
      }

      console.log(`Created student: ${fullName} <${email}>`)
      created++
    } catch (err) {
      console.log(`Failed ${email}: ${err.message}`)
      failed++
    }
  }

  console.log('Finished.')
  console.log(`Created: ${created}`)
  console.log(`Skipped: ${skipped}`)
  console.log(`Failed: ${failed}`)
  console.log(`Default password: ${DEFAULT_PASSWORD}`)
}

main()

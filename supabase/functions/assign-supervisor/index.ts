// Supabase Edge Function: assign-supervisor
// Deploy with: npx supabase functions deploy assign-supervisor --no-verify-jwt
// This function verifies the logged-in admin, saves/removes the supervisor assignment,
// then sends supervisor/student emails through Resend without exposing email API keys.

type AnyRecord = Record<string, any>

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-application-name, x-supabase-api-version, accept, origin, referer',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function jsonResponse(payload: AnyRecord, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function normalize(value: unknown) {
  return String(value ?? '').trim().toLowerCase()
}

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function isApprovedActiveStatus(value: unknown) {
  const status = normalize(value || 'active')
  return !status || ['active', 'approved', 'accepted'].includes(status)
}

function isAdminRole(value: unknown) {
  return ['admin', 'admin/editor', 'administrator'].includes(normalize(value))
}

function getFromEmail() {
  return (
    Deno.env.get('FROM_EMAIL') ||
    Deno.env.get('INVITE_FROM_EMAIL') ||
    Deno.env.get('PLATFORM_FROM_EMAIL') ||
    Deno.env.get('RESEND_FROM_EMAIL') ||
    ''
  )
}

function getFromName() {
  return Deno.env.get('FROM_NAME') || Deno.env.get('PLATFORM_FROM_NAME') || 'Pharmacy Research Platform'
}

function makeFromHeader(fromEmail: string) {
  const fromName = getFromName()
  if (!fromName) return fromEmail
  return `${fromName} <${fromEmail}>`
}

function getSiteUrl(fallback = '') {
  return Deno.env.get('SITE_URL') || Deno.env.get('PUBLIC_SITE_URL') || Deno.env.get('VERCEL_URL') || fallback || ''
}

function getAbsoluteSiteUrl(value: string) {
  if (!value) return ''
  if (/^https?:\/\//i.test(value)) return value
  return `https://${value}`
}

function dateTime(value: unknown) {
  if (!value) return 'Not available'
  const parsed = new Date(String(value))
  if (Number.isNaN(parsed.getTime())) return String(value)
  return parsed.toLocaleString('en', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function dashboardLink(appUrl: string, role: 'student' | 'supervisor' | 'admin', params: Record<string, string>) {
  if (!appUrl) return ''
  try {
    const url = new URL(appUrl)
    url.searchParams.set('role', role)
    Object.entries(params).forEach(([key, value]) => {
      if (value) url.searchParams.set(key, value)
    })
    return url.toString()
  } catch (_error) {
    return appUrl
  }
}

async function restFetch(supabaseUrl: string, serviceRoleKey: string, path: string, options: RequestInit = {}) {
  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(options.headers || {}),
    },
  })
  const text = await response.text().catch(() => '')
  const payload = text ? JSON.parse(text) : null
  if (!response.ok) {
    console.error('Supabase REST error:', response.status, payload)
    throw new Error(payload?.message || payload?.error || `Supabase request failed: ${response.status}`)
  }
  return payload
}

async function getAuthedUser(req: Request, supabaseUrl: string, serviceRoleKey: string) {
  const authHeader = req.headers.get('Authorization') || ''
  const accessToken = authHeader.replace('Bearer ', '')
  if (!accessToken) throw new Error('Missing authorization token.')

  const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      apikey: serviceRoleKey,
    },
  })
  const payload = await userResponse.json().catch(() => null)
  if (!userResponse.ok) {
    console.error('Auth user lookup failed:', userResponse.status, payload)
    throw new Error('Invalid or expired user session.')
  }
  return payload
}

async function getProfileByEmail(supabaseUrl: string, serviceRoleKey: string, email: string) {
  if (!email) return null
  const profiles = await restFetch(
    supabaseUrl,
    serviceRoleKey,
    `profiles?email=ilike.${encodeURIComponent(email)}&select=*`
  )
  return profiles?.[0] || null
}

async function getProfileById(supabaseUrl: string, serviceRoleKey: string, id: string) {
  if (!id) return null
  const profiles = await restFetch(
    supabaseUrl,
    serviceRoleKey,
    `profiles?id=eq.${encodeURIComponent(id)}&select=*`
  )
  return profiles?.[0] || null
}

async function getActorProfile(supabaseUrl: string, serviceRoleKey: string, authedUser: AnyRecord) {
  let actor: AnyRecord | null = null
  if (authedUser?.email) actor = await getProfileByEmail(supabaseUrl, serviceRoleKey, authedUser.email)
  if (!actor && authedUser?.id) actor = await getProfileById(supabaseUrl, serviceRoleKey, authedUser.id)
  return actor
}

async function getProjectsForStudent(supabaseUrl: string, serviceRoleKey: string, student: AnyRecord) {
  const filters = [
    student.id ? `student_id.eq.${student.id}` : '',
    student.id ? `created_by.eq.${student.id}` : '',
    student.email ? `student_email.ilike.${student.email}` : '',
    student.email ? `created_by_email.ilike.${student.email}` : '',
    student.full_name ? `group_name.ilike.${student.full_name}` : '',
  ].filter(Boolean).join(',')
  if (!filters) return []
  return await restFetch(supabaseUrl, serviceRoleKey, `research_projects?or=(${encodeURIComponent(filters)})&select=*&order=created_at.desc`)
}

async function getProjectById(supabaseUrl: string, serviceRoleKey: string, projectId: string) {
  if (!projectId) return null
  const rows = await restFetch(supabaseUrl, serviceRoleKey, `research_projects?id=eq.${encodeURIComponent(projectId)}&select=*&limit=1`)
  return Array.isArray(rows) ? rows[0] || null : null
}

function projectHasSupervisor(project: AnyRecord) {
  const name = normalize(project?.supervisor_name)
  return Boolean(project?.supervisor_id || project?.supervisor_email || (name && name !== 'pending assignment' && name !== 'not assigned'))
}

function firstProjectSummary(projects: AnyRecord[]) {
  const project = projects?.[0]
  if (!project) return { title: 'Not available', group: 'Not available', area: 'Not available' }
  return {
    title: project.title || project.project_title || 'Not available',
    group: project.group_name || project.research_group || 'Not available',
    area: project.area || project.department || 'Not available',
  }
}

async function updateStudentAssignment(supabaseUrl: string, serviceRoleKey: string, student: AnyRecord, supervisor: AnyRecord | null, preserveEmailMarker: boolean, projectId = '') {
  const now = new Date().toISOString()
  const updates = supervisor
    ? {
        assigned_supervisor_id: supervisor.id || null,
        assigned_supervisor_email: supervisor.email || '',
        assigned_supervisor_name: supervisor.full_name || '',
        assigned_supervisor_email_sent_at: preserveEmailMarker ? student.assigned_supervisor_email_sent_at || null : null,
        assigned_supervisor_email_supervisor_id: preserveEmailMarker ? student.assigned_supervisor_email_supervisor_id || null : null,
        assigned_supervisor_email_supervisor_email: preserveEmailMarker ? student.assigned_supervisor_email_supervisor_email || '' : '',
      }
    : {
        assigned_supervisor_id: null,
        assigned_supervisor_email: '',
        assigned_supervisor_name: '',
        assigned_supervisor_email_sent_at: null,
        assigned_supervisor_email_supervisor_id: null,
        assigned_supervisor_email_supervisor_email: '',
      }

  await restFetch(supabaseUrl, serviceRoleKey, `profiles?id=eq.${encodeURIComponent(student.id)}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  })

  const filters = [
    student.id ? `student_id.eq.${student.id}` : '',
    student.id ? `created_by.eq.${student.id}` : '',
    student.email ? `student_email.ilike.${student.email}` : '',
    student.email ? `created_by_email.ilike.${student.email}` : '',
    student.full_name ? `group_name.ilike.${student.full_name}` : '',
  ].filter(Boolean).join(',')

  const projectUpdates = {
    supervisor_id: supervisor?.id || null,
    supervisor_email: supervisor?.email || '',
    supervisor_name: supervisor?.full_name || 'Pending Assignment',
    updated_at: now,
  }

  if (filters) {
    await restFetch(supabaseUrl, serviceRoleKey, `research_projects?or=(${encodeURIComponent(filters)})`, {
      method: 'PATCH',
      body: JSON.stringify(projectUpdates),
    })
  }

  if (projectId) {
    await restFetch(supabaseUrl, serviceRoleKey, `research_projects?id=eq.${encodeURIComponent(projectId)}`, {
      method: 'PATCH',
      body: JSON.stringify(projectUpdates),
    })
  }
}

async function markAssignmentEmailSent(supabaseUrl: string, serviceRoleKey: string, studentId: string, supervisor: AnyRecord) {
  await restFetch(supabaseUrl, serviceRoleKey, `profiles?id=eq.${encodeURIComponent(studentId)}`, {
    method: 'PATCH',
    body: JSON.stringify({
      assigned_supervisor_email_sent_at: new Date().toISOString(),
      assigned_supervisor_email_supervisor_id: supervisor.id || null,
      assigned_supervisor_email_supervisor_email: supervisor.email || '',
    }),
  })
}

async function sendResendEmail(args: { resendApiKey: string; fromEmail: string; to: string; subject: string; html: string; text: string }) {
  console.log('Sending email:', { to: args.to, subject: args.subject })
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${args.resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: makeFromHeader(args.fromEmail),
      to: [args.to],
      subject: args.subject,
      html: args.html,
      text: args.text,
    }),
  })
  const result = await response.json().catch(() => null)
  if (!response.ok) {
    console.error('Resend email failure:', response.status, result)
    throw new Error(result?.message || result?.error || 'Email provider rejected the message.')
  }
  console.log('Email sent:', result)
  return result
}

function buildEmailWrapper(title: string, intro: string, bodyHtml: string, actionLink = '', actionLabel = 'Open dashboard') {
  const button = actionLink
    ? `<p style="margin:22px 0 0;"><a href="${escapeHtml(actionLink)}" style="display:inline-block;background:#0f172a;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:12px;font-weight:700;">${escapeHtml(actionLabel)}</a></p>`
    : ''
  return `
    <div style="font-family:Arial,sans-serif;background:#f8fafc;padding:28px;color:#0f172a;">
      <div style="max-width:760px;margin:0 auto;background:#ffffff;border-radius:18px;padding:28px;border:1px solid #e2e8f0;box-shadow:0 18px 45px rgba(15,23,42,0.08);">
        <h2 style="margin:0 0 8px;font-size:24px;color:#0f172a;">${escapeHtml(title)}</h2>
        <p style="margin:0 0 22px;color:#64748b;line-height:1.6;">${escapeHtml(intro)}</p>
        <div style="padding:18px;border-radius:14px;background:#eff6ff;border:1px solid #bfdbfe;margin-bottom:18px;line-height:1.65;">
          ${bodyHtml}
        </div>
        ${button}
        <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;" />
        <p style="font-size:13px;color:#64748b;margin:0;">Pharmacy Research Platform</p>
      </div>
    </div>
  `
}

async function sendAssignmentEmails(args: {
  supabaseUrl: string
  serviceRoleKey: string
  resendApiKey: string
  fromEmail: string
  student: AnyRecord
  supervisor: AnyRecord
  projects: AnyRecord[]
  assignedAt: string
  appUrl: string
}) {
  const { student, supervisor, projects, assignedAt, appUrl } = args
  if (!student.email) throw new Error('Student email address is missing.')
  if (!supervisor.email) throw new Error('Supervisor email address is missing.')

  const summary = firstProjectSummary(projects)
  const supervisorLink = dashboardLink(appUrl, 'supervisor', { student: student.id || '' })
  const studentLink = dashboardLink(appUrl, 'student', { supervisor: supervisor.id || '' })

  const supervisorHtml = buildEmailWrapper(
    'New Student Assigned',
    `${student.full_name || student.email} has been assigned to you.`,
    `
      <p><strong>Supervisor name:</strong> ${escapeHtml(supervisor.full_name || supervisor.email)}</p>
      <p><strong>Student name:</strong> ${escapeHtml(student.full_name || student.email)}</p>
      <p><strong>Student email:</strong> ${escapeHtml(student.email || 'Not available')}</p>
      <p><strong>Department/program:</strong> ${escapeHtml(student.department || summary.area || 'Not available')}</p>
      <p><strong>Research group:</strong> ${escapeHtml(summary.group)}</p>
      <p><strong>Research title/project:</strong> ${escapeHtml(summary.title)}</p>
      <p><strong>Assigned date/time:</strong> ${escapeHtml(dateTime(assignedAt))}</p>
    `,
    supervisorLink,
    'View student in supervisor dashboard'
  )
  const supervisorText = [
    'New Student Assigned',
    `Supervisor: ${supervisor.full_name || supervisor.email}`,
    `Student: ${student.full_name || student.email}`,
    `Student email: ${student.email || 'Not available'}`,
    `Department/program: ${student.department || summary.area || 'Not available'}`,
    `Research group: ${summary.group}`,
    `Research title/project: ${summary.title}`,
    `Assigned date/time: ${dateTime(assignedAt)}`,
    supervisorLink ? `Dashboard link: ${supervisorLink}` : '',
  ].filter(Boolean).join('\n')

  const studentHtml = buildEmailWrapper(
    'Supervisor Assigned',
    `${supervisor.full_name || supervisor.email} has been assigned as your supervisor.`,
    `
      <p><strong>Student name:</strong> ${escapeHtml(student.full_name || student.email)}</p>
      <p><strong>Supervisor name:</strong> ${escapeHtml(supervisor.full_name || supervisor.email)}</p>
      <p><strong>Supervisor email:</strong> ${escapeHtml(supervisor.email || 'Not available')}</p>
      <p><strong>Research group:</strong> ${escapeHtml(summary.group)}</p>
      <p><strong>Research title/project:</strong> ${escapeHtml(summary.title)}</p>
      <p><strong>Assigned date/time:</strong> ${escapeHtml(dateTime(assignedAt))}</p>
    `,
    studentLink,
    'Open student dashboard'
  )
  const studentText = [
    'Supervisor Assigned',
    `Student: ${student.full_name || student.email}`,
    `Supervisor: ${supervisor.full_name || supervisor.email}`,
    `Supervisor email: ${supervisor.email || 'Not available'}`,
    `Research group: ${summary.group}`,
    `Research title/project: ${summary.title}`,
    `Assigned date/time: ${dateTime(assignedAt)}`,
    studentLink ? `Dashboard link: ${studentLink}` : '',
  ].filter(Boolean).join('\n')

  const supervisorEmail = await sendResendEmail({ resendApiKey: args.resendApiKey, fromEmail: args.fromEmail, to: supervisor.email, subject: 'New Student Assigned', html: supervisorHtml, text: supervisorText })
  const studentEmail = await sendResendEmail({ resendApiKey: args.resendApiKey, fromEmail: args.fromEmail, to: student.email, subject: 'Supervisor Assigned', html: studentHtml, text: studentText })
  await markAssignmentEmailSent(args.supabaseUrl, args.serviceRoleKey, student.id, supervisor)
  return { supervisorEmailId: supervisorEmail?.id || null, studentEmailId: studentEmail?.id || null }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed.' }, 405)

  try {
    console.log('assign-supervisor function called')
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    const resendApiKey = Deno.env.get('RESEND_API_KEY') || ''
    const fromEmail = getFromEmail()

    if (!supabaseUrl || !serviceRoleKey) throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY secret.')

    const payload = await req.json().catch(() => ({}))
    console.log('assign-supervisor payload:', {
      studentId: payload.studentId || payload.target_student_id,
      supervisorId: payload.supervisorId || payload.target_supervisor_id || null,
      projectId: payload.projectId || payload.project_id || null,
      action: payload.action || null,
      hasAppUrl: Boolean(payload.appUrl),
    })

    const authedUser = await getAuthedUser(req, supabaseUrl, serviceRoleKey)
    const actor = await getActorProfile(supabaseUrl, serviceRoleKey, authedUser)
    if (!actor || !isAdminRole(actor.role) || !isApprovedActiveStatus(actor.status)) {
      return jsonResponse({ error: 'You do not have permission to access this admin feature.' }, 403)
    }

    const studentId = String(payload.studentId || payload.target_student_id || '')
    const supervisorId = String(payload.supervisorId || payload.target_supervisor_id || '')
    const projectId = String(payload.projectId || payload.project_id || '')
    const student = await getProfileById(supabaseUrl, serviceRoleKey, studentId)
    if (!student || normalize(student.role) !== 'student') return jsonResponse({ error: 'Student account not found.' }, 404)

    let projects = await getProjectsForStudent(supabaseUrl, serviceRoleKey, student)
    if (projectId) {
      const selectedProject = await getProjectById(supabaseUrl, serviceRoleKey, projectId)
      if (selectedProject && !projects.some((project) => String(project.id || '') === String(selectedProject.id || ''))) {
        projects = [selectedProject, ...projects]
      }
    }
    const assignedAt = new Date().toISOString()
    const appUrl = getAbsoluteSiteUrl(String(payload.appUrl || getSiteUrl(req.headers.get('origin') || '')))

    if (!supervisorId) {
      const hadAssignment = Boolean(
        student.assigned_supervisor_id ||
        student.assigned_supervisor_email ||
        student.assigned_supervisor_name ||
        projects.some(projectHasSupervisor)
      )
      await updateStudentAssignment(supabaseUrl, serviceRoleKey, student, null, false, projectId)
      return jsonResponse({
        success: true,
        assignmentSaved: true,
        removed: true,
        hadAssignment,
        emailSent: false,
        message: hadAssignment ? 'Supervisor removed successfully.' : 'No supervisor assignment was found.',
      })
    }

    const supervisor = await getProfileById(supabaseUrl, serviceRoleKey, supervisorId)
    if (!supervisor || normalize(supervisor.role) !== 'supervisor') return jsonResponse({ error: 'Supervisor account not found.' }, 404)

    const sameSupervisor =
      String(student.assigned_supervisor_id || '') === String(supervisor.id || '') ||
      normalize(student.assigned_supervisor_email) === normalize(supervisor.email) ||
      normalize(student.assigned_supervisor_name) === normalize(supervisor.full_name)

    const emailAlreadySent =
      !!student.assigned_supervisor_email_sent_at &&
      (
        String(student.assigned_supervisor_email_supervisor_id || '') === String(supervisor.id || '') ||
        normalize(student.assigned_supervisor_email_supervisor_email) === normalize(supervisor.email)
      )

    await updateStudentAssignment(supabaseUrl, serviceRoleKey, student, supervisor, sameSupervisor && emailAlreadySent, projectId)

    if (sameSupervisor && emailAlreadySent) {
      return jsonResponse({
        success: true,
        assignmentSaved: true,
        noChange: true,
        emailSkipped: true,
        message: 'Student is already assigned to this supervisor. No duplicate email was sent.',
      })
    }

    if (!resendApiKey || !fromEmail) {
      const reason = 'Missing RESEND_API_KEY or sender email secret. Set RESEND_API_KEY and FROM_EMAIL/PLATFORM_FROM_EMAIL in Supabase Edge Function secrets.'
      console.error(reason)
      return jsonResponse({
        success: true,
        assignmentSaved: true,
        emailSent: false,
        emailFailed: true,
        emailError: reason,
      })
    }

    try {
      const emailResult = await sendAssignmentEmails({ supabaseUrl, serviceRoleKey, resendApiKey, fromEmail, student, supervisor, projects, assignedAt, appUrl })
      return jsonResponse({
        success: true,
        assignmentSaved: true,
        emailSent: true,
        notificationsSent: true,
        ...emailResult,
      })
    } catch (emailError) {
      console.error('Assignment email send failed after assignment save:', emailError)
      return jsonResponse({
        success: true,
        assignmentSaved: true,
        emailSent: false,
        emailFailed: true,
        emailError: emailError?.message || 'Email notification failed.',
      })
    }
  } catch (error) {
    console.error('assign-supervisor error:', error)
    return jsonResponse({ error: error?.message || 'Unexpected assignment email error.' }, 500)
  }
})

// Pharmacy Research Platform generic platform email sender
// Deploy with: supabase functions deploy send-platform-email
// Required custom secrets: RESEND_API_KEY and INVITE_FROM_EMAIL
// Supabase hosted Edge Functions also provide SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-application-name, x-supabase-api-version, accept, origin, referer',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

type AnyRecord = Record<string, any>

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function normalize(value: unknown) {
  return String(value ?? '').trim().toLowerCase()
}

function isApprovedActiveStatus(value: unknown) {
  const status = normalize(value || 'active')
  return !status || ['active', 'approved', 'accepted'].includes(status)
}

function isAdminRole(value: unknown) {
  return ['admin', 'admin/editor', 'administrator'].includes(normalize(value))
}

function getFromEmail() {
  return Deno.env.get('FROM_EMAIL') || Deno.env.get('INVITE_FROM_EMAIL') || Deno.env.get('PLATFORM_FROM_EMAIL') || Deno.env.get('RESEND_FROM_EMAIL') || ''
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
  const payload = await response.json().catch(() => null)
  if (!response.ok) throw new Error(payload?.message || payload?.error || `Supabase request failed: ${response.status}`)
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
  if (!userResponse.ok) throw new Error('Invalid or expired user session.')
  return await userResponse.json()
}

async function getProfileByEmail(supabaseUrl: string, serviceRoleKey: string, email: string) {
  const profiles = await restFetch(
    supabaseUrl,
    serviceRoleKey,
    `profiles?email=ilike.${encodeURIComponent(email)}&select=*`
  )
  return profiles?.[0] || null
}

async function getProfileById(supabaseUrl: string, serviceRoleKey: string, id: string) {
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

async function getProjectById(supabaseUrl: string, serviceRoleKey: string, id: string) {
  const projects = await restFetch(
    supabaseUrl,
    serviceRoleKey,
    `research_projects?id=eq.${encodeURIComponent(id)}&select=*`
  )
  return projects?.[0] || null
}

async function getQuestionById(supabaseUrl: string, serviceRoleKey: string, id: string) {
  const questions = await restFetch(
    supabaseUrl,
    serviceRoleKey,
    `student_questions?id=eq.${encodeURIComponent(id)}&select=*`
  )
  return questions?.[0] || null
}

function userCanAccessQuestion(actor: AnyRecord, question: AnyRecord) {
  if (!actor || !question || !isApprovedActiveStatus(actor.status)) return false
  if (isAdminRole(actor.role)) return true
  if (normalize(actor.role) === 'student') {
    return String(question.student_id || '') === String(actor.id || '') || normalize(question.student_email) === normalize(actor.email)
  }
  if (normalize(actor.role) === 'supervisor') {
    return String(question.supervisor_id || '') === String(actor.id || '') || normalize(question.supervisor_email) === normalize(actor.email) || normalize(question.supervisor_name) === normalize(actor.full_name)
  }
  return false
}


async function getProjectsForStudent(supabaseUrl: string, serviceRoleKey: string, student: AnyRecord, projectIds: string[] = []) {
  if (projectIds.length) {
    const ids = projectIds.map((id) => `id.eq.${id}`).join(',')
    return await restFetch(supabaseUrl, serviceRoleKey, `research_projects?or=(${encodeURIComponent(ids)})&select=*`)
  }
  const filters = [
    student.id ? `student_id.eq.${student.id}` : '',
    student.id ? `created_by.eq.${student.id}` : '',
    student.email ? `student_email.ilike.${student.email}` : '',
    student.email ? `created_by_email.ilike.${student.email}` : '',
  ].filter(Boolean).join(',')
  if (!filters) return []
  return await restFetch(supabaseUrl, serviceRoleKey, `research_projects?or=(${encodeURIComponent(filters)})&select=*&order=created_at.desc`)
}

function firstProjectSummary(projects: AnyRecord[]) {
  const project = projects?.[0]
  if (!project) return { title: 'Not available', group: 'Not available', area: 'Not available' }
  return {
    title: project.title || 'Not available',
    group: project.group_name || 'Not available',
    area: project.area || 'Not available',
  }
}

async function sendResendEmail(args: { resendApiKey: string; fromEmail: string; to: string; subject: string; html: string; text: string }) {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${args.resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: args.fromEmail,
      to: [args.to],
      subject: args.subject,
      html: args.html,
      text: args.text,
    }),
  })
  const result = await response.json().catch(() => null)
  if (!response.ok) throw new Error(result?.message || result?.error || 'Email provider rejected the message.')
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
        <div style="padding:18px;border-radius:14px;background:#eef2ff;border:1px solid #c7d2fe;margin-bottom:18px;line-height:1.65;">
          ${bodyHtml}
        </div>
        ${button}
        <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;" />
        <p style="font-size:13px;color:#64748b;margin:0;">Pharmacy Research Platform</p>
      </div>
    </div>
  `
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed.' }, 405)

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    const resendApiKey = Deno.env.get('RESEND_API_KEY') || ''
    const fromEmail = getFromEmail()

    if (!supabaseUrl || !serviceRoleKey) throw new Error('Missing Supabase Edge Function environment variables.')
    if (!resendApiKey || !fromEmail) throw new Error('Missing RESEND_API_KEY or sender email secret. Set RESEND_API_KEY and FROM_EMAIL/PLATFORM_FROM_EMAIL/RESEND_FROM_EMAIL.')

    const payload = await req.json().catch(() => ({}))
    const authedUser = await getAuthedUser(req, supabaseUrl, serviceRoleKey)
    const actor = await getActorProfile(supabaseUrl, serviceRoleKey, authedUser)
    if (!actor || !isApprovedActiveStatus(actor.status)) throw new Error('Only approved active users can send platform emails.')

    const kind = String(payload.kind || '')
    const appUrl = getAbsoluteSiteUrl(String(payload.appUrl || getSiteUrl(req.headers.get('origin') || '')))

    if (kind === 'assignment') {
      if (!isAdminRole(actor.role)) return jsonResponse({ error: 'You do not have permission to access this admin feature.' }, 403)
      const student = await getProfileById(supabaseUrl, serviceRoleKey, String(payload.studentId || ''))
      const supervisor = await getProfileById(supabaseUrl, serviceRoleKey, String(payload.supervisorId || ''))
      if (!student || student.role !== 'student') throw new Error('Student account not found.')
      if (!supervisor || supervisor.role !== 'supervisor') throw new Error('Supervisor account not found.')
      if (!student.email) throw new Error('Student email address is missing.')
      if (!supervisor.email) throw new Error('Supervisor email address is missing.')

      const assignmentSaved =
        String(student.assigned_supervisor_id || '') === String(supervisor.id || '') ||
        normalize(student.assigned_supervisor_email) === normalize(supervisor.email) ||
        normalize(student.assigned_supervisor_name) === normalize(supervisor.full_name)

      if (!assignmentSaved) {
        return jsonResponse({ error: 'Assignment must be saved before email notifications are sent.' }, 409)
      }

      const alreadyNotified =
        !!student.assigned_supervisor_email_sent_at &&
        (
          String(student.assigned_supervisor_email_supervisor_id || '') === String(supervisor.id || '') ||
          normalize(student.assigned_supervisor_email_supervisor_email) === normalize(supervisor.email)
        )

      if (alreadyNotified) {
        return jsonResponse({ success: true, skipped: true, reason: 'Assignment email was already sent for this supervisor.' })
      }

      const projects = await getProjectsForStudent(supabaseUrl, serviceRoleKey, student, Array.isArray(payload.projectIds) ? payload.projectIds : [])
      const summary = firstProjectSummary(projects)
      const assignedAt = payload.assignmentDate || new Date().toISOString()
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
          <p><strong>Research group/title:</strong> ${escapeHtml(summary.group)} — ${escapeHtml(summary.title)}</p>
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
        `Research group/title: ${summary.group} — ${summary.title}`,
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
          <p><strong>Research group/title:</strong> ${escapeHtml(summary.group)} — ${escapeHtml(summary.title)}</p>
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
        `Research group/title: ${summary.group} — ${summary.title}`,
        `Assigned date/time: ${dateTime(assignedAt)}`,
        studentLink ? `Dashboard link: ${studentLink}` : '',
      ].filter(Boolean).join('\n')

      const supervisorEmail = await sendResendEmail({ resendApiKey, fromEmail, to: supervisor.email, subject: 'New Student Assigned', html: supervisorHtml, text: supervisorText })
      const studentEmail = await sendResendEmail({ resendApiKey, fromEmail, to: student.email, subject: 'Supervisor Assigned', html: studentHtml, text: studentText })

      await restFetch(supabaseUrl, serviceRoleKey, `profiles?id=eq.${encodeURIComponent(student.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({
          assigned_supervisor_email_sent_at: new Date().toISOString(),
          assigned_supervisor_email_supervisor_id: supervisor.id || null,
          assigned_supervisor_email_supervisor_email: supervisor.email || '',
        }),
      })

      return jsonResponse({ success: true, supervisorEmailId: supervisorEmail?.id || null, studentEmailId: studentEmail?.id || null })
    }


    if (kind === 'student_question_submitted') {
      const question = await getQuestionById(supabaseUrl, serviceRoleKey, String(payload.questionId || ''))
      if (!question) throw new Error('Student question not found.')
      if (!userCanAccessQuestion(actor, question)) return jsonResponse({ error: 'You do not have permission to send this question email.' }, 403)
      const supervisor = question.supervisor_id ? await getProfileById(supabaseUrl, serviceRoleKey, question.supervisor_id) : await getProfileByEmail(supabaseUrl, serviceRoleKey, question.supervisor_email || '')
      const student = question.student_id ? await getProfileById(supabaseUrl, serviceRoleKey, question.student_id) : await getProfileByEmail(supabaseUrl, serviceRoleKey, question.student_email || '')
      if (!supervisor?.email) throw new Error('Supervisor email address is missing.')
      const link = dashboardLink(appUrl, 'supervisor', { tab: 'questions', question: question.id || '' })
      const submittedAt = question.created_at || new Date().toISOString()
      const html = buildEmailWrapper(
        'New Student Question',
        `${question.student_name || student?.full_name || question.student_email || 'A student'} submitted a question for you.`,
        `
          <p><strong>Supervisor name:</strong> ${escapeHtml(supervisor.full_name || supervisor.email)}</p>
          <p><strong>Student name:</strong> ${escapeHtml(student?.full_name || question.student_name || question.student_email || 'Student')}</p>
          <p><strong>Student email:</strong> ${escapeHtml(student?.email || question.student_email || 'Not available')}</p>
          <p><strong>Submitted date/time:</strong> ${escapeHtml(dateTime(submittedAt))}</p>
          <p><strong>Question:</strong><br>${escapeHtml(question.question_text || '')}</p>
        `,
        link,
        'Open student questions'
      )
      const text = [
        'New Student Question',
        `Supervisor: ${supervisor.full_name || supervisor.email}`,
        `Student: ${student?.full_name || question.student_name || question.student_email || 'Student'}`,
        `Student email: ${student?.email || question.student_email || 'Not available'}`,
        `Submitted: ${dateTime(submittedAt)}`,
        `Question: ${question.question_text || ''}`,
        link ? `Dashboard link: ${link}` : '',
      ].filter(Boolean).join('\n')
      const email = await sendResendEmail({ resendApiKey, fromEmail, to: supervisor.email, subject: 'New Student Question', html, text })
      return jsonResponse({ success: true, emailId: email?.id || null })
    }

    if (kind === 'student_question_answered') {
      const question = await getQuestionById(supabaseUrl, serviceRoleKey, String(payload.questionId || ''))
      if (!question) throw new Error('Student question not found.')
      if (!userCanAccessQuestion(actor, question)) return jsonResponse({ error: 'You do not have permission to send this answer email.' }, 403)
      const student = question.student_id ? await getProfileById(supabaseUrl, serviceRoleKey, question.student_id) : await getProfileByEmail(supabaseUrl, serviceRoleKey, question.student_email || '')
      const supervisor = question.supervisor_id ? await getProfileById(supabaseUrl, serviceRoleKey, question.supervisor_id) : await getProfileByEmail(supabaseUrl, serviceRoleKey, question.supervisor_email || '')
      if (!student?.email && !question.student_email) throw new Error('Student email address is missing.')
      const toEmail = student?.email || question.student_email
      const link = dashboardLink(appUrl, 'student', { tab: 'questions', question: question.id || '' })
      const answeredAt = question.answered_at || new Date().toISOString()
      const html = buildEmailWrapper(
        'Your Supervisor Answered Your Question',
        `${question.supervisor_name || supervisor?.full_name || 'Your supervisor'} answered your question.`,
        `
          <p><strong>Student name:</strong> ${escapeHtml(student?.full_name || question.student_name || question.student_email || 'Student')}</p>
          <p><strong>Supervisor name:</strong> ${escapeHtml(supervisor?.full_name || question.supervisor_name || question.supervisor_email || 'Supervisor')}</p>
          <p><strong>Original question:</strong><br>${escapeHtml(question.question_text || '')}</p>
          <p><strong>Answer:</strong><br>${escapeHtml(question.answer_text || '')}</p>
          <p><strong>Answered date/time:</strong> ${escapeHtml(dateTime(answeredAt))}</p>
        `,
        link,
        'Open questions tab'
      )
      const text = [
        'Your Supervisor Answered Your Question',
        `Student: ${student?.full_name || question.student_name || question.student_email || 'Student'}`,
        `Supervisor: ${supervisor?.full_name || question.supervisor_name || question.supervisor_email || 'Supervisor'}`,
        `Question: ${question.question_text || ''}`,
        `Answer: ${question.answer_text || ''}`,
        `Answered: ${dateTime(answeredAt)}`,
        link ? `Dashboard link: ${link}` : '',
      ].filter(Boolean).join('\n')
      const email = await sendResendEmail({ resendApiKey, fromEmail, to: toEmail, subject: 'Your Supervisor Answered Your Question', html, text })
      return jsonResponse({ success: true, emailId: email?.id || null })
    }

    if (kind === 'project_accepted') {
      if (!['admin', 'committee', 'supervisor'].includes(actor.role)) return jsonResponse({ error: 'You do not have permission to access this admin feature.' }, 403)
      const project = await getProjectById(supabaseUrl, serviceRoleKey, String(payload.projectId || ''))
      if (!project) throw new Error('Research title not found.')
      if (project.acceptance_email_sent_at) return jsonResponse({ success: true, skipped: true, reason: 'Project acceptance email was already sent.' })

      let student: AnyRecord | null = null
      if (project.student_id) student = await getProfileById(supabaseUrl, serviceRoleKey, project.student_id)
      if (!student && project.student_email) student = await getProfileByEmail(supabaseUrl, serviceRoleKey, project.student_email)
      if (!student && project.created_by) student = await getProfileById(supabaseUrl, serviceRoleKey, project.created_by)
      if (!student && project.created_by_email) student = await getProfileByEmail(supabaseUrl, serviceRoleKey, project.created_by_email)
      if (!student?.email) throw new Error('Student email not found for this research title.')

      const acceptedAt = payload.acceptedAt || new Date().toISOString()
      const link = dashboardLink(appUrl, 'student', { project: project.id || '' })
      const comment = project.admin_comment || project.supervisor_comment || project.committee_comment || project.comments || project.feedback || 'No comment available.'
      const html = buildEmailWrapper(
        'Your Project Has Been Accepted',
        'Your submitted research title/project has been accepted.',
        `
          <p><strong>Student name:</strong> ${escapeHtml(student.full_name || student.email)}</p>
          <p><strong>Project/research title:</strong> ${escapeHtml(project.title || 'Untitled research title')}</p>
          <p><strong>Acceptance status:</strong> ${escapeHtml(project.approval || 'Approved')}</p>
          <p><strong>Accepted date/time:</strong> ${escapeHtml(dateTime(acceptedAt))}</p>
          <p><strong>Admin/supervisor comment:</strong> ${escapeHtml(comment)}</p>
        `,
        link,
        'View project status'
      )
      const text = [
        'Your Project Has Been Accepted',
        `Student: ${student.full_name || student.email}`,
        `Project/research title: ${project.title || 'Untitled research title'}`,
        `Acceptance status: ${project.approval || 'Approved'}`,
        `Accepted date/time: ${dateTime(acceptedAt)}`,
        `Comment: ${comment}`,
        link ? `Dashboard link: ${link}` : '',
      ].filter(Boolean).join('\n')

      const email = await sendResendEmail({ resendApiKey, fromEmail, to: student.email, subject: 'Your Project Has Been Accepted', html, text })
      await restFetch(supabaseUrl, serviceRoleKey, `research_projects?id=eq.${encodeURIComponent(project.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ acceptance_email_sent_at: new Date().toISOString(), acceptance_email_sent_by: actor.id || null }),
      })
      return jsonResponse({ success: true, emailId: email?.id || null })
    }

    return jsonResponse({ error: 'Unsupported email kind.' }, 400)
  } catch (error) {
    console.error('Platform email error:', error)
    return jsonResponse({ error: error?.message || 'Unexpected platform email error.' }, 500)
  }
})

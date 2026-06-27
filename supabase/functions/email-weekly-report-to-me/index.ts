// PharmaTrack weekly report email sender
// Deploy with: supabase functions deploy email-weekly-report-to-me
// Required custom secrets: RESEND_API_KEY, INVITE_FROM_EMAIL
// Supabase hosted Edge Functions automatically provide SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

function dateTime(value: unknown) {
  if (!value) return 'Not available'
  const parsed = new Date(String(value))
  if (Number.isNaN(parsed.getTime())) return String(value)
  return parsed.toLocaleString('en', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
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

function reportOwnedByProfile(report: AnyRecord, profile: AnyRecord) {
  return (
    String(report.submitted_by_id || '') === String(profile.id || '') ||
    normalize(report.submitted_by_email) === normalize(profile.email) ||
    normalize(report.submitted_by) === normalize(profile.full_name) ||
    normalize(report.submitted_by) === normalize(profile.email)
  )
}

function supervisorAssignedToProject(project: AnyRecord, profile: AnyRecord) {
  return (
    String(project.supervisor_id || '') === String(profile.id || '') ||
    normalize(project.supervisor_email) === normalize(profile.email) ||
    normalize(project.supervisor_name) === normalize(profile.full_name) ||
    normalize(project.supervisor) === normalize(profile.full_name) ||
    normalize(project.assigned_supervisor) === normalize(profile.full_name)
  )
}

function canAccessReport(report: AnyRecord, project: AnyRecord, profile: AnyRecord) {
  if (!profile || profile.status !== 'Active') return false
  if (profile.role === 'admin') return true
  if (profile.role === 'student') return reportOwnedByProfile(report, profile)
  if (profile.role === 'supervisor') return supervisorAssignedToProject(project, profile)
  return false
}

function attachmentPublicUrl(supabaseUrl: string, attachment: AnyRecord | null) {
  if (!attachment) return ''
  if (attachment.file_url) return String(attachment.file_url)
  if (!attachment.file_path) return ''
  return `${supabaseUrl}/storage/v1/object/public/project-files/${encodeURIComponent(String(attachment.file_path)).replaceAll('%2F', '/')}`
}

function buildReportEmailHtml(args: {
  report: AnyRecord
  project: AnyRecord
  recipient: AnyRecord
  attachment: AnyRecord | null
  attachmentUrl: string
  mode: string
}) {
  const { report, project, recipient, attachment, attachmentUrl, mode } = args
  const title = mode === 'notification' ? 'Weekly Report Notification' : 'Weekly Report Copy'
  const attachmentBlock = attachment
    ? `<p><strong>Attached file:</strong> ${escapeHtml(attachment.file_name || 'Attached file')}${attachmentUrl ? ` — <a href="${escapeHtml(attachmentUrl)}">View / Download</a>` : ''}</p>`
    : '<p><strong>Attached file:</strong> No attachment uploaded.</p>'

  return `
    <div style="font-family:Arial,sans-serif;background:#f8fafc;padding:28px;color:#0f172a;">
      <div style="max-width:760px;margin:0 auto;background:#ffffff;border-radius:18px;padding:28px;border:1px solid #e2e8f0;box-shadow:0 18px 45px rgba(15,23,42,0.08);">
        <h2 style="margin:0 0 8px;font-size:24px;color:#0f172a;">${escapeHtml(title)}</h2>
        <p style="margin:0 0 22px;color:#64748b;">Sent to ${escapeHtml(recipient.email || 'your registered email')}</p>
        <div style="padding:18px;border-radius:14px;background:#eef2ff;border:1px solid #c7d2fe;margin-bottom:18px;">
          <p><strong>Student:</strong> ${escapeHtml(report.submitted_by || report.submitted_by_email || 'Unknown student')}</p>
          <p><strong>Project:</strong> ${escapeHtml(project.title || 'Weekly Report')}</p>
          <p><strong>Week:</strong> ${escapeHtml(report.week_number || '')}</p>
          <p><strong>Submitted:</strong> ${escapeHtml(dateTime(report.submitted_at))}</p>
          <p><strong>Status:</strong> ${escapeHtml(report.status || 'Submitted')}</p>
          <p><strong>Score:</strong> ${report.score === null || report.score === undefined ? 'Pending' : `${escapeHtml(report.score)}/20`}</p>
          ${attachmentBlock}
        </div>
        <h3 style="font-size:18px;margin:20px 0 8px;">Weekly report content</h3>
        <div style="line-height:1.65;color:#334155;">
          <p><strong>Completed work:</strong><br>${escapeHtml(report.completed_work || 'No completed work written.')}</p>
          <p><strong>Problems / challenges:</strong><br>${escapeHtml(report.challenges || 'No challenges written.')}</p>
          <p><strong>Next week plan:</strong><br>${escapeHtml(report.next_week_plan || 'No next week plan written.')}</p>
          <p><strong>Supervisor feedback:</strong><br>${escapeHtml(report.supervisor_feedback || 'No supervisor feedback yet.')}</p>
        </div>
        <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;" />
        <p style="font-size:13px;color:#64748b;margin:0;">PharmaTrack Research Platform</p>
      </div>
    </div>
  `
}

function buildReportText(report: AnyRecord, project: AnyRecord, attachment: AnyRecord | null, attachmentUrl: string) {
  return [
    'Weekly Report',
    `Student: ${report.submitted_by || report.submitted_by_email || 'Unknown student'}`,
    `Project: ${project.title || 'Weekly Report'}`,
    `Week: ${report.week_number || ''}`,
    `Submitted: ${dateTime(report.submitted_at)}`,
    `Status: ${report.status || 'Submitted'}`,
    `Score: ${report.score === null || report.score === undefined ? 'Pending' : `${report.score}/20`}`,
    `Attachment: ${attachment ? `${attachment.file_name || 'Attached file'} ${attachmentUrl || ''}` : 'No attachment uploaded.'}`,
    '',
    'Completed work:',
    report.completed_work || 'No completed work written.',
    '',
    'Problems / challenges:',
    report.challenges || 'No challenges written.',
    '',
    'Next week plan:',
    report.next_week_plan || 'No next week plan written.',
    '',
    'Supervisor feedback:',
    report.supervisor_feedback || 'No supervisor feedback yet.',
  ].join('\n')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405)

  try {
    const resendApiKey = Deno.env.get('RESEND_API_KEY')
    const fromEmail = Deno.env.get('INVITE_FROM_EMAIL')
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!resendApiKey) return jsonResponse({ error: 'Missing RESEND_API_KEY secret.' }, 500)
    if (!fromEmail) return jsonResponse({ error: 'Missing INVITE_FROM_EMAIL secret.' }, 500)
    if (!supabaseUrl || !serviceRoleKey) return jsonResponse({ error: 'Missing Supabase service environment variables.' }, 500)

    const authUser = await getAuthedUser(req, supabaseUrl, serviceRoleKey)
    const authEmail = normalize(authUser.email)
    if (!authEmail) return jsonResponse({ error: 'Authenticated user email not found.' }, 401)

    const payload = await req.json().catch(() => ({}))
    const reportId = String(payload.reportId || payload.report_id || '').trim()
    const mode = String(payload.mode || 'copy')
    if (!reportId) return jsonResponse({ error: 'Report ID is required.' }, 400)

    const profiles = await restFetch(supabaseUrl, serviceRoleKey, `profiles?select=*&email=eq.${encodeURIComponent(authEmail)}&limit=1`)
    const actorProfile = Array.isArray(profiles) ? profiles[0] : null
    if (!actorProfile || actorProfile.status !== 'Active') return jsonResponse({ error: 'Active profile not found for this user.' }, 403)

    const reports = await restFetch(supabaseUrl, serviceRoleKey, `weekly_reports?select=*&id=eq.${encodeURIComponent(reportId)}&limit=1`)
    const report = Array.isArray(reports) ? reports[0] : null
    if (!report) return jsonResponse({ error: 'Weekly report not found.' }, 404)

    const projects = await restFetch(supabaseUrl, serviceRoleKey, `research_projects?select=*&id=eq.${encodeURIComponent(report.project_id)}&limit=1`)
    const project = Array.isArray(projects) ? projects[0] : {}

    if (!canAccessReport(report, project, actorProfile)) {
      return jsonResponse({ error: 'You do not have permission to email this report.' }, 403)
    }

    let recipientProfile = actorProfile
    if (mode === 'notification' && payload.recipientUserId) {
      const recipients = await restFetch(supabaseUrl, serviceRoleKey, `profiles?select=*&id=eq.${encodeURIComponent(String(payload.recipientUserId))}&limit=1`)
      const requestedRecipient = Array.isArray(recipients) ? recipients[0] : null
      if (!requestedRecipient) return jsonResponse({ error: 'Notification recipient was not found.' }, 404)

      const allowedNotificationRecipient =
        actorProfile.role === 'admin' ||
        (
          actorProfile.role === 'student' &&
          reportOwnedByProfile(report, actorProfile) &&
          requestedRecipient.role === 'supervisor' &&
          supervisorAssignedToProject(project, requestedRecipient)
        ) ||
        (
          actorProfile.role === 'supervisor' &&
          supervisorAssignedToProject(project, actorProfile) &&
          requestedRecipient.role === 'student' &&
          reportOwnedByProfile(report, requestedRecipient)
        )

      if (!allowedNotificationRecipient) {
        return jsonResponse({ error: 'You do not have permission to send this report notification.' }, 403)
      }
      recipientProfile = requestedRecipient
    }

    if (!recipientProfile?.email) return jsonResponse({ error: 'Recipient registered email was not found.' }, 400)

    const files = await restFetch(supabaseUrl, serviceRoleKey, `uploaded_files?select=*&report_id=eq.${encodeURIComponent(reportId)}&order=created_at.desc&limit=1`)
    const attachment = Array.isArray(files) ? files[0] : null
    const attachmentUrl = attachmentPublicUrl(supabaseUrl, attachment)

    const subject = mode === 'notification'
      ? `Weekly Report Update: Week ${report.week_number}`
      : `Your Weekly Report Copy: Week ${report.week_number}`
    const html = buildReportEmailHtml({ report, project, recipient: recipientProfile, attachment, attachmentUrl, mode })
    const text = buildReportText(report, project, attachment, attachmentUrl)

    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [recipientProfile.email],
        subject,
        text,
        html,
      }),
    })

    const resendResult = await resendResponse.json().catch(() => ({}))
    if (!resendResponse.ok) {
      return jsonResponse({ error: resendResult?.message || 'Email provider rejected the weekly report email.', details: resendResult }, 502)
    }

    return jsonResponse({ success: true, provider: 'resend', emailId: resendResult?.id || null })
  } catch (error) {
    return jsonResponse({ error: error?.message || 'Unexpected weekly report email error.' }, 500)
  }
})

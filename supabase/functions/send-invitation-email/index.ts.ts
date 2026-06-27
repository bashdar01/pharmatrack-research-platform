// PharmaTrack invitation email sender
// Deploy with: supabase functions deploy send-invitation-email
// Required secrets: RESEND_API_KEY, INVITE_FROM_EMAIL

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function escapeHtml(value: string) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function fillTemplate(template: string, invitation: Record<string, string>) {
  return String(template || '')
    .replaceAll('[Name]', invitation.fullName || 'Colleague')
    .replaceAll('[Role]', invitation.roleLabel || invitation.role || 'User')
    .replaceAll('[Link]', invitation.invitationLink || '')
    .replaceAll('[Expiration Date]', invitation.expirationDate || '')
    .replaceAll('[Website Name]', invitation.websiteName || 'PharmaTrack Research Platform')
}

function buildEmailHtml(textBody: string, invitation: Record<string, string>) {
  const paragraphs = textBody
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => `<p>${escapeHtml(line)}</p>`)
    .join('')

  return `
    <div style="font-family:Arial,sans-serif;background:#f8fafc;padding:28px;color:#0f172a;">
      <div style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:18px;padding:28px;border:1px solid #e2e8f0;box-shadow:0 18px 45px rgba(15,23,42,0.08);">
        <h2 style="margin:0 0 16px;font-size:22px;color:#0f172a;">${escapeHtml(invitation.websiteName || 'PharmaTrack Research Platform')}</h2>
        <div style="font-size:15px;line-height:1.65;color:#334155;">${paragraphs}</div>
        <div style="margin:24px 0;padding:18px;border-radius:14px;background:#eef2ff;border:1px solid #c7d2fe;">
          <p style="margin:0 0 8px;"><strong>Assigned role:</strong> ${escapeHtml(invitation.roleLabel || invitation.role || 'User')}</p>
          <p style="margin:0 0 8px;"><strong>Expiration date:</strong> ${escapeHtml(invitation.expirationDate || '')}</p>
          <a href="${escapeHtml(invitation.invitationLink || '')}" style="display:inline-block;margin-top:10px;background:#2563eb;color:#ffffff;text-decoration:none;border-radius:999px;padding:12px 18px;font-weight:700;">Accept Invitation</a>
        </div>
        <p style="font-size:13px;color:#64748b;margin-top:18px;">If the button does not work, copy and paste this link into your browser:</p>
        <p style="font-size:13px;word-break:break-all;color:#2563eb;">${escapeHtml(invitation.invitationLink || '')}</p>
        <hr style="border:none;border-top:1px solid #e2e8f0;margin:22px 0;" />
        <p style="font-size:13px;color:#64748b;margin:0;">${escapeHtml(invitation.contactInfo || 'College of Pharmacy, Hawler Medical University')}</p>
      </div>
    </div>
  `
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

    const authHeader = req.headers.get('Authorization') || ''
    const accessToken = authHeader.replace('Bearer ', '')
    if (!accessToken) return jsonResponse({ error: 'Missing authorization token.' }, 401)

    const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        apikey: serviceRoleKey,
      },
    })

    if (!userResponse.ok) return jsonResponse({ error: 'Invalid or expired user session.' }, 401)
    const user = await userResponse.json()
    const userEmail = String(user.email || '').toLowerCase()
    if (!userEmail) return jsonResponse({ error: 'Authenticated user email not found.' }, 401)

    const profileUrl = `${supabaseUrl}/rest/v1/profiles?select=email,role,status&email=eq.${encodeURIComponent(userEmail)}&limit=1`
    const profileResponse = await fetch(profileUrl, {
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
    })
    if (!profileResponse.ok) return jsonResponse({ error: 'Could not validate admin profile.' }, 403)
    const profiles = await profileResponse.json()
    const profile = Array.isArray(profiles) ? profiles[0] : null

    if (!profile || profile.role !== 'admin' || (profile.status || 'Pending') !== 'Active') {
      return jsonResponse({ error: 'Only active admin users can send invitations.' }, 403)
    }

    const payload = await req.json()
    const to = String(payload.to || '').trim().toLowerCase()
    const fullName = String(payload.fullName || '').trim()
    const role = String(payload.role || '').trim()
    const roleLabel = String(payload.roleLabel || role || 'User').trim()
    const subject = String(payload.subject || 'Invitation to join PharmaTrack').trim()
    const invitationLink = String(payload.invitationLink || '').trim()
    const expiresAt = payload.expiresAt ? new Date(payload.expiresAt) : null
    const expirationDate = expiresAt && !Number.isNaN(expiresAt.getTime()) ? expiresAt.toLocaleDateString('en', { year: 'numeric', month: 'short', day: 'numeric' }) : ''
    const websiteName = String(payload.websiteName || 'PharmaTrack Research Platform')
    const contactInfo = String(payload.contactInfo || 'College of Pharmacy, Hawler Medical University')

    if (!to || !to.includes('@')) return jsonResponse({ error: 'A valid recipient email is required.' }, 400)
    if (!invitationLink) return jsonResponse({ error: 'Invitation link is required.' }, 400)

    const textBody = `${fillTemplate(String(payload.body || ''), {
      fullName,
      role,
      roleLabel,
      invitationLink,
      expirationDate,
      websiteName,
      contactInfo,
    })}\n\nAssigned role: ${roleLabel}\nSecure invitation link: ${invitationLink}\nExpiration date: ${expirationDate}\n\n${websiteName}\nContact: ${contactInfo}`

    const htmlBody = buildEmailHtml(textBody, {
      fullName,
      role,
      roleLabel,
      invitationLink,
      expirationDate,
      websiteName,
      contactInfo,
    })

    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [to],
        subject,
        text: textBody,
        html: htmlBody,
      }),
    })

    const resendResult = await resendResponse.json().catch(() => ({}))
    if (!resendResponse.ok) {
      return jsonResponse({ error: resendResult?.message || 'Resend rejected the invitation email.', details: resendResult }, 502)
    }

    if (payload.invitationId) {
      await fetch(`${supabaseUrl}/rest/v1/invitations?id=eq.${encodeURIComponent(payload.invitationId)}`, {
        method: 'PATCH',
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({ sent_at: new Date().toISOString() }),
      })
    }

    return jsonResponse({ success: true, provider: 'resend', emailId: resendResult?.id || null })
  } catch (error) {
    return jsonResponse({ error: error?.message || 'Unexpected invitation email error.' }, 500)
  }
})

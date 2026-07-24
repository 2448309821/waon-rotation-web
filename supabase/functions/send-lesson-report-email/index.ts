import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8'
import { buildLessonReportMailPackage, resolveLessonReport } from './lesson-report-mail-format.ts'

const allowedOrigins = new Set([
  'https://2448309821.github.io',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:5175',
  'http://127.0.0.1:5175',
])

function corsHeaders(request: Request) {
  const origin = request.headers.get('origin') || ''
  return {
    'Access-Control-Allow-Origin': allowedOrigins.has(origin) ? origin : 'https://2448309821.github.io',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json; charset=utf-8',
    'Vary': 'Origin',
  }
}

function response(request: Request, body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders(request) })
}

function isGoogleAppsScriptUrl(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && url.hostname === 'script.google.com' && url.pathname.startsWith('/macros/s/')
  } catch {
    return false
  }
}

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

function parseRecipientMap(value: string) {
  try {
    const parsed = JSON.parse(value)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
    const entries = Object.entries(parsed)
      .map(([name, email]) => [name.trim(), String(email || '').trim().toLowerCase()] as const)
      .filter(([name, email]) => name && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    const uniqueEmails = new Set(entries.map(([, email]) => email))
    return entries.length >= 2 && uniqueEmails.size === entries.length
      ? Object.fromEntries(entries) as Record<string, string>
      : null
  } catch {
    return null
  }
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(request) })
  if (request.method !== 'POST') return response(request, { sent: false, error: 'method_not_allowed' }, 405)
  const origin = request.headers.get('origin') || ''
  if (origin && !allowedOrigins.has(origin)) return response(request, { sent: false, error: 'origin_not_allowed' }, 403)

  let payload: { monthKey?: string; reportId?: string; senderName?: string }
  try {
    payload = await request.json()
  } catch {
    return response(request, { sent: false, error: 'invalid_json' }, 400)
  }
  const monthKey = String(payload.monthKey || '')
  const reportId = String(payload.reportId || '')
  const senderName = String(payload.senderName || '').trim()
  if (!/^\d{4}-\d{1,2}$/.test(monthKey) || !/^\d{1,2}\/\d{1,2}__.{1,40}$/.test(reportId)) {
    return response(request, { sent: false, error: 'invalid_report_id' }, 400)
  }
  if (!senderName || senderName.length > 40) return response(request, { sent: false, error: 'invalid_sender' }, 400)

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
  const webhookUrl = Deno.env.get('MAIL_WEBHOOK_URL') || ''
  const webhookToken = Deno.env.get('MAIL_WEBHOOK_TOKEN') || ''
  const recipientMap = parseRecipientMap(Deno.env.get('SCHEDULE_MAIL_RECIPIENTS_JSON') || '')
  if (!supabaseUrl || !serviceRoleKey) return response(request, { sent: false, error: 'server_storage_not_configured' }, 503)
  if (!isGoogleAppsScriptUrl(webhookUrl) || !webhookToken || !recipientMap) {
    return response(request, { sent: false, error: 'mail_backend_not_configured' }, 503)
  }

  const senderEmail = recipientMap[senderName]
  const recipientEmails = Object.entries(recipientMap).filter(([name]) => name !== senderName).map(([, email]) => email)
  if (!senderEmail || recipientEmails.length !== Object.keys(recipientMap).length - 1) {
    return response(request, { sent: false, error: 'invalid_sender' }, 400)
  }

  const service = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data: shared, error: stateError } = await service.from('rotation_states').select('state').eq('id', 'shared').maybeSingle()
  if (stateError || !shared?.state) return response(request, { sent: false, error: 'shared_state_unavailable' }, 503)
  const state = shared.state as Record<string, any>
  const teacherNames = new Set((Array.isArray(state.teachers) ? state.teachers : []).map((teacher: any) => String(teacher?.name || '')))
  const configuredTeacherNames = Object.keys(recipientMap)
  if (configuredTeacherNames.length !== teacherNames.size || configuredTeacherNames.some((name) => !teacherNames.has(name))) {
    return response(request, { sent: false, error: 'recipient_config_mismatch' }, 503)
  }

  let report
  try {
    report = resolveLessonReport(state, monthKey, reportId)
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'report_unavailable'
    const status = reason === 'report_not_saved' || reason === 'report_incomplete' ? 409 : 400
    return response(request, { sent: false, error: reason }, status)
  }
  if (report.teacherName !== senderName) return response(request, { sent: false, error: 'sender_not_report_teacher' }, 403)

  const mailPackage = buildLessonReportMailPackage(report)
  const { subject, text, html, attachment } = mailPackage
  const contentHash = await sha256(`${senderName}\n${recipientEmails.slice().sort().join(',')}\n${subject}\n${text}\n${html}\n${attachment.base64}`)
  const dispatchKey = await sha256(`wawon-lesson-report-email:${monthKey}:${reportId}:${report.updatedAt}`)
  const { data: existing, error: existingError } = await service
    .from('lesson_report_email_dispatches')
    .select('status, attempt_count, updated_at')
    .eq('dispatch_key', dispatchKey)
    .maybeSingle()
  if (existingError) return response(request, { sent: false, error: 'dispatch_lookup_failed' }, 503)
  if (existing?.status === 'sent') return response(request, { sent: false, error: 'already_sent' }, 409)

  const now = new Date()
  const nowIso = now.toISOString()
  const staleBefore = now.getTime() - 10 * 60 * 1000
  if (existing?.status === 'sending' && new Date(existing.updated_at).getTime() >= staleBefore) {
    return response(request, { sent: false, error: 'send_in_progress' }, 409)
  }
  const dispatchRecord = {
    dispatch_key: dispatchKey,
    month_key: monthKey,
    report_id: reportId,
    report_updated_at: report.updatedAt,
    status: 'sending',
    sender_name: senderName,
    recipient_count: recipientEmails.length,
    subject,
    content_hash: contentHash,
    attempt_count: Number(existing?.attempt_count || 0) + 1,
    error: null,
    sent_at: null,
    updated_at: nowIso,
  }
  if (existing) {
    const { data: reserved, error: reserveError } = await service
      .from('lesson_report_email_dispatches')
      .update(dispatchRecord)
      .eq('dispatch_key', dispatchKey)
      .eq('status', existing.status)
      .eq('updated_at', existing.updated_at)
      .select('dispatch_key')
      .maybeSingle()
    if (reserveError) return response(request, { sent: false, error: 'dispatch_reservation_failed' }, 503)
    if (!reserved) return response(request, { sent: false, error: 'send_in_progress' }, 409)
  } else {
    const { error: reserveError } = await service.from('lesson_report_email_dispatches').insert(dispatchRecord)
    if (reserveError?.code === '23505') return response(request, { sent: false, error: 'send_in_progress' }, 409)
    if (reserveError) return response(request, { sent: false, error: 'dispatch_reservation_failed' }, 503)
  }

  try {
    const webhookResponse = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: webhookToken,
        to: recipientEmails,
        excludedEmail: senderEmail,
        senderName,
        subject,
        text,
        html,
        attachments: [attachment],
        dispatchKey,
      }),
    })
    const webhookResult = await webhookResponse.json().catch(() => ({}))
    if (!webhookResponse.ok || webhookResult.sent !== true) throw new Error(webhookResult.error || `mail_webhook_http_${webhookResponse.status}`)
    await service.from('lesson_report_email_dispatches').update({
      status: 'sent',
      error: null,
      sent_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('dispatch_key', dispatchKey).eq('status', 'sending').eq('content_hash', contentHash)
    return response(request, {
      sent: true,
      senderName,
      recipientCount: recipientEmails.length,
      report: { dateText: report.dateText, className: report.className },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 240) : 'mail_webhook_failed'
    await service.from('lesson_report_email_dispatches').update({
      status: 'failed',
      error: message,
      updated_at: new Date().toISOString(),
    }).eq('dispatch_key', dispatchKey).eq('status', 'sending').eq('content_hash', contentHash)
    return response(request, { sent: false, error: 'mail_webhook_failed' }, 502)
  }
})

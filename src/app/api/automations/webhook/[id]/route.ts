import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/automations/admin-client'
import { runAutomationsForTrigger } from '@/lib/automations/engine'
import { findOrCreateContact } from '@/lib/api/v1/contacts'
import { sanitizePhoneForMeta, isValidE164 } from '@/lib/whatsapp/phone-utils'
import type { WebhookTriggerConfig } from '@/types'

/** Recursively inspects any JSON structure to find a valid phone number */
export function findPhoneInJson(val: unknown, depth = 0): string | undefined {
  if (depth > 6 || val === null || val === undefined) return undefined

  if (typeof val === 'string' || typeof val === 'number') {
    const str = String(val).trim()
    const digits = str.replace(/\D/g, '')
    if (digits.length >= 7 && digits.length <= 15) {
      const sanitized = sanitizePhoneForMeta(str)
      if (isValidE164(sanitized)) return sanitized
    }
    return undefined
  }

  if (typeof val === 'object') {
    const entries = Object.entries(val as Record<string, unknown>)
    // Check keys containing phone keywords first
    for (const [k, v] of entries) {
      const lk = k.toLowerCase()
      if (
        lk.includes('phone') ||
        lk.includes('mobile') ||
        lk.includes('whatsapp') ||
        lk.includes('recipient') ||
        lk.includes('tel') ||
        lk === 'to'
      ) {
        const found = findPhoneInJson(v, depth + 1)
        if (found) return found
      }
    }
    // Check all other keys
    for (const [, v] of entries) {
      const found = findPhoneInJson(v, depth + 1)
      if (found) return found
    }
  }

  return undefined
}

/** Recursively inspects any JSON structure to find a contact name */
export function findNameInJson(val: unknown, depth = 0): string | undefined {
  if (depth > 5 || !val || typeof val !== 'object') return undefined

  for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
    const lk = k.toLowerCase()
    if (
      (lk === 'name' || lk.includes('name') || lk.includes('contact')) &&
      typeof v === 'string' &&
      v.trim().length > 0 &&
      !v.includes('@')
    ) {
      return v.trim()
    }
    if (typeof v === 'object') {
      const found = findNameInJson(v, depth + 1)
      if (found) return found
    }
  }

  return undefined
}

/** Recursively inspects any JSON structure to find an email address */
export function findEmailInJson(val: unknown, depth = 0): string | undefined {
  if (depth > 5 || !val || typeof val !== 'object') return undefined

  for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
    const lk = k.toLowerCase()
    if (
      (lk === 'email' || lk.includes('mail')) &&
      typeof v === 'string' &&
      v.includes('@')
    ) {
      return v.trim()
    }
    if (typeof v === 'object') {
      const found = findEmailInJson(v, depth + 1)
      if (found) return found
    }
  }

  return undefined
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const admin = supabaseAdmin()
  const { data: automation, error } = await admin
    .from('automations')
    .select('id, name, is_active, trigger_type, trigger_config')
    .eq('id', id)
    .maybeSingle()

  if (error || !automation) {
    return NextResponse.json({ error: 'Automation not found' }, { status: 404 })
  }

  return NextResponse.json({
    status: 'ok',
    automation_id: automation.id,
    name: automation.name,
    is_active: automation.is_active,
    trigger_type: automation.trigger_type,
    message: 'Send any HTTP POST request with JSON to this endpoint to trigger the automation.',
    sample_payload: (automation.trigger_config as Record<string, unknown>)?.samplePayload ?? null,
  })
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const admin = supabaseAdmin()

  // 1. Fetch automation
  const { data: automation, error } = await admin
    .from('automations')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (error || !automation) {
    return NextResponse.json({ error: 'Automation not found' }, { status: 404 })
  }

  if (automation.trigger_type !== 'webhook_received') {
    return NextResponse.json(
      {
        error: `Automation trigger is '${automation.trigger_type}', not 'webhook_received'`,
      },
      { status: 400 }
    )
  }

  const cfg = (automation.trigger_config ?? {}) as WebhookTriggerConfig

  // 2. Secret authentication check
  if (cfg.secret) {
    const url = new URL(request.url)
    const secretFromQuery = url.searchParams.get('secret')
    const secretFromHeader =
      request.headers.get('x-webhook-secret') ||
      request.headers.get('x-api-key') ||
      request.headers.get('authorization')?.replace(/^Bearer\s+/i, '')

    if (secretFromQuery !== cfg.secret && secretFromHeader !== cfg.secret) {
      return NextResponse.json(
        { error: 'Unauthorized: Invalid or missing webhook secret' },
        { status: 401 }
      )
    }
  }

  // 3. Resilient payload parser (handles JSON array or object, form data, or raw text)
  let rawPayload: unknown = {}
  try {
    const rawText = await request.text()
    if (rawText.trim().startsWith('{') || rawText.trim().startsWith('[')) {
      try {
        rawPayload = JSON.parse(rawText)
      } catch {
        // Try fixing PowerShell single-quote or unquoted key mangling:
        const normalized = rawText
          .replace(/([{,]\s*)([a-zA-Z0-9_]+)\s*:/g, '$1"$2":')
          .replace(/'/g, '"')
        rawPayload = JSON.parse(normalized)
      }
    } else {
      const search = new URLSearchParams(rawText)
      const entries = Array.from(search.entries())
      if (entries.length > 0) {
        rawPayload = Object.fromEntries(entries)
      } else {
        rawPayload = { raw: rawText }
      }
    }
  } catch {
    rawPayload = {}
  }

  const payload = (typeof rawPayload === 'object' && rawPayload !== null) ? rawPayload : {}

  // 4. Always save recent payload so builder displays the exact JSON keys
  void admin
    .from('automations')
    .update({
      trigger_config: {
        ...cfg,
        samplePayload: payload,
      },
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)

  // 5. If inactive, capture sample payload and inform user nicely instead of erroring
  const url = new URL(request.url)
  const isTestOrForced = url.searchParams.get('test') === 'true' || url.searchParams.get('force') === 'true'
  if (!automation.is_active && !isTestOrForced) {
    return NextResponse.json({
      success: true,
      status: 'captured',
      message:
        'Webhook payload received and captured! Toggle "Active" to ON in the builder (or add ?force=true) to trigger actions live.',
      payload,
    })
  }

  // 6. Auto-detect contact from ANY JSON structure (arrays, nested objects, n8n wrappers)
  const firstItem = Array.isArray(payload)
    ? (payload[0] as Record<string, unknown>)
    : payload
  const effectiveBody =
    firstItem &&
    typeof firstItem === 'object' &&
    'body' in firstItem &&
    typeof firstItem.body === 'object' &&
    firstItem.body !== null
      ? (firstItem.body as Record<string, unknown>)
      : firstItem

  const phone = findPhoneInJson(payload)
  const name = findNameInJson(effectiveBody) || findNameInJson(payload)
  const email = findEmailInJson(effectiveBody) || findEmailInJson(payload)

  let contactId: string | null = null
  if (phone) {
    try {
      const contact = await findOrCreateContact(
        admin,
        automation.account_id,
        automation.user_id,
        {
          phone,
          name: name || undefined,
          email: email || undefined,
        }
      )
      contactId = contact.id
    } catch (err) {
      console.error('[webhook-trigger] failed to auto-resolve contact:', err)
    }
  }

  // 7. Dispatch automation execution
  try {
    await runAutomationsForTrigger({
      accountId: automation.account_id,
      triggerType: 'webhook_received',
      contactId,
      context: {
        message_text: `Webhook received: ${automation.name}`,
        contact_name: name || undefined,
        contact_phone: phone || undefined,
        vars: {
          webhook: firstItem,
          raw_webhook: payload,
          ...(firstItem && typeof firstItem === 'object' ? firstItem : {}),
          ...(effectiveBody && typeof effectiveBody === 'object' ? effectiveBody : {}),
        },
      },
    })

    return NextResponse.json({
      success: true,
      automation_id: id,
      contact_id: contactId,
      message: 'Automation triggered successfully',
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[webhook-trigger] execution failed:', message)
    return NextResponse.json(
      { error: `Automation execution error: ${message}` },
      { status: 500 }
    )
  }
}

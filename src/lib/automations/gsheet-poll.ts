import { createHash } from 'node:crypto'
import type { Automation, GoogleSheetTriggerConfig } from '@/types'
import { supabaseAdmin } from './admin-client'
import { runAutomationsForTrigger } from './engine'
import { findOrCreateContact } from '@/lib/api/v1/contacts'
import { sanitizePhoneForMeta, isValidE164 } from '@/lib/whatsapp/phone-utils'

// ------------------------------------------------------------
// Google Sheets polling engine.
//
// Polls connected spreadsheets for new/updated rows and fires the
// matching automations. Runs from the cron endpoint
// (/api/automations/google-sheets-poll) on a schedule.
//
// Change detection strategy:
//   - row count increase  → row_added
//   - per-row content hash change → row_updated
// State is persisted in google_sheets_poll_state keyed by
// automation_id, so each automation tracks its own baseline.
// ------------------------------------------------------------

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GOOGLE_SHEETS_BASE = 'https://sheets.googleapis.com/v4/spreadsheets'

interface GoogleTokenRow {
  access_token: string
  refresh_token: string
  token_expiry: string
}

interface SheetValuesResponse {
  values?: string[][]
}

/** Fetch a fresh access token for the account, refreshing if expired. */
async function getAccessToken(accountId: string): Promise<string> {
  const db = supabaseAdmin()
  const { data: tokenRow, error } = await db
    .from('google_oauth_tokens')
    .select('access_token, refresh_token, token_expiry')
    .eq('account_id', accountId)
    .maybeSingle()

  if (error || !tokenRow) {
    throw new Error(`no google oauth token for account ${accountId}`)
  }

  const row = tokenRow as GoogleTokenRow
  const expired = new Date(row.token_expiry).getTime() <= Date.now() + 30_000
  if (!expired) return row.access_token

  // Refresh
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: row.refresh_token,
      grant_type: 'refresh_token',
    }),
  })
  if (!res.ok) {
    throw new Error(`google token refresh failed: ${res.status}`)
  }
  const json = (await res.json()) as { access_token: string; expires_in: number }
  const newExpiry = new Date(Date.now() + json.expires_in * 1000).toISOString()

  await db
    .from('google_oauth_tokens')
    .update({ access_token: json.access_token, token_expiry: newExpiry, updated_at: new Date().toISOString() })
    .eq('account_id', accountId)

  return json.access_token
}

/** Fetch all rows of a sheet tab (header row included). */
async function fetchSheetValues(
  accessToken: string,
  spreadsheetId: string,
  sheetName: string,
): Promise<string[][]> {
  const range = encodeURIComponent(`'${sheetName}'`)
  const url = `${GOOGLE_SHEETS_BASE}/${spreadsheetId}/values/${range}`
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`sheets fetch failed (${res.status}): ${body.slice(0, 200)}`)
  }
  const json = (await res.json()) as SheetValuesResponse
  return json.values ?? []
}

function rowHash(row: string[]): string {
  return createHash('sha256').update(JSON.stringify(row)).digest('hex')
}

/** Map header names to row values, e.g. { Name: "Jane", Phone: "+15550001" }. */
function rowToRecord(header: string[], row: string[]): Record<string, string> {
  const rec: Record<string, string> = {}
  header.forEach((h, i) => {
    if (h && h.trim()) rec[h.trim()] = row[i] ?? ''
  })
  return rec
}

const PHONE_HEADER_CANDIDATES = ['phone', 'whatsapp', 'whatsapp phone', 'mobile', 'number', 'tel', 'telephone']
const NAME_HEADER_CANDIDATES = ['name', 'full name', 'fullname', 'contact name', 'client name', 'customer name', 'lead name', 'first name']
const EMAIL_HEADER_CANDIDATES = ['email', 'e-mail', 'mail', 'email address']

/**
 * Try to find a phone number in the row record for contact
 * resolution. An explicitly configured phoneColumn wins; otherwise
 * fall back to auto-detection from common header names.
 */
function extractPhone(record: Record<string, string>, phoneColumn?: string): string | null {
  if (phoneColumn) {
    const v = record[phoneColumn] ?? record[phoneColumn.trim()]
    if (v && v.trim()) return v.trim()
    return null
  }
  const lower: Record<string, string> = {}
  for (const [k, v] of Object.entries(record)) lower[k.toLowerCase()] = v
  for (const candidate of PHONE_HEADER_CANDIDATES) {
    const v = lower[candidate]
    if (v && v.trim()) return v.trim()
  }
  return null
}

function extractName(record: Record<string, string>, nameColumn?: string): string | undefined {
  if (nameColumn) {
    const v = record[nameColumn] ?? record[nameColumn.trim()]
    if (v && v.trim()) return v.trim()
    return undefined
  }
  const lower: Record<string, string> = {}
  for (const [k, v] of Object.entries(record)) lower[k.toLowerCase()] = v
  for (const candidate of NAME_HEADER_CANDIDATES) {
    const v = lower[candidate]
    if (v && v.trim()) return v.trim()
  }
  return undefined
}

function extractEmail(record: Record<string, string>, emailColumn?: string): string | undefined {
  if (emailColumn) {
    const v = record[emailColumn] ?? record[emailColumn.trim()]
    if (v && v.trim()) return v.trim()
    return undefined
  }
  const lower: Record<string, string> = {}
  for (const [k, v] of Object.entries(record)) lower[k.toLowerCase()] = v
  for (const candidate of EMAIL_HEADER_CANDIDATES) {
    const v = lower[candidate]
    if (v && v.trim()) return v.trim()
  }
  return undefined
}

interface PollStateRow {
  last_row_count: number
  last_hash: string | null
}

interface PollResult {
  automationId: string
  fired: number
  error?: string
}

/**
 * Poll all active Google Sheets automations across all accounts.
 * Called by the cron endpoint. Never throws — per-automation errors
 * are captured into PollResult.error and logged.
 */
export async function pollAllGoogleSheetAutomations(options?: { force?: boolean }): Promise<PollResult[]> {
  const db = supabaseAdmin()

  const { data: automations, error } = await db
    .from('automations')
    .select('*')
    .in('trigger_type', [
      'google_sheet_row_added',
      'google_sheet_row_updated',
      'google_sheet_row_added_or_updated',
    ])
    .eq('is_active', true)

  if (error) {
    console.error('[gsheets-poll] fetch automations failed:', error)
    return []
  }
  if (!automations || automations.length === 0) return []

  const results: PollResult[] = []
  for (const automation of automations as Automation[]) {
    try {
      const fired = await pollOne(automation, options?.force)
      results.push({ automationId: automation.id, fired })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error('[gsheets-poll] automation failed:', automation.id, message)
      results.push({ automationId: automation.id, fired: 0, error: message })
    }
  }
  return results
}

/**
 * Poll a single automation's sheet. Returns the number of trigger
 * events fired (0 if nothing changed).
 */
async function pollOne(automation: Automation, force = false): Promise<number> {
  const db = supabaseAdmin()
  const cfg = automation.trigger_config as GoogleSheetTriggerConfig
  if (!cfg?.spreadsheetId || !cfg?.sheetName) return 0

  // Respect the per-automation poll interval unless force=true is supplied.
  const intervalMin = Math.max(1, cfg.pollIntervalMinutes ?? 1)
  const { data: state } = await db
    .from('google_sheets_poll_state')
    .select('last_row_count, last_hash, last_polled_at')
    .eq('automation_id', automation.id)
    .maybeSingle()

  if (!force && state) {
    const lastPolled = new Date((state as PollStateRow & { last_polled_at: string }).last_polled_at).getTime()
    if (Date.now() - lastPolled < intervalMin * 60_000) return 0
  }

  const accessToken = await getAccessToken(automation.account_id)
  const values = await fetchSheetValues(accessToken, cfg.spreadsheetId, cfg.sheetName)

  // First row is the header; data rows follow.
  const header = values[0] ?? []
  const dataRows = values.slice(1)

  const { data: prevState } = await db
    .from('google_sheets_poll_state')
    .select('last_row_count, last_hash')
    .eq('automation_id', automation.id)
    .maybeSingle()
  const prev = (prevState ?? { last_row_count: 0, last_hash: null }) as PollStateRow

  // Detect added rows: count grew.
  const addedCount = Math.max(0, dataRows.length - prev.last_row_count)
  const addedRows = addedCount > 0 ? dataRows.slice(dataRows.length - addedCount) : []

  // Detect updated rows: hash of the overlapping region changed.
  const overlap = Math.min(prev.last_row_count, dataRows.length)
  const updatedRows: string[][] = []
  if (prev.last_hash && overlap > 0) {
    // last_hash stores the per-row hashes of the previous overlap
    // region, joined with '|'. Compare per-row to find which changed.
    const prevHashes = prev.last_hash.split('|')
    for (let i = 0; i < overlap; i++) {
      const currentRowHash = rowHash(dataRows[i])
      if (prevHashes[i] !== currentRowHash) updatedRows.push(dataRows[i])
    }
  }

  // Persist new state BEFORE firing, so a crash mid-fire doesn't
  // re-trigger everything on the next poll.
  const allRowHashes = dataRows.map((r) => rowHash(r)).join('|')
  const newState = {
    last_row_count: dataRows.length,
    last_hash: dataRows.length > 0 ? allRowHashes : null,
    last_polled_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
  await db.from('google_sheets_poll_state').upsert({
    automation_id: automation.id,
    ...newState,
  })

  // Decide which rows to fire on based on trigger type.
  let rowsToFire: string[][] = []
  let triggerEvent: 'row_added' | 'row_updated' = 'row_added'
  if (automation.trigger_type === 'google_sheet_row_added') {
    rowsToFire = addedRows
  } else if (automation.trigger_type === 'google_sheet_row_updated') {
    rowsToFire = updatedRows
  } else {
    // added_or_updated: fire on both, added first.
    rowsToFire = [...addedRows, ...updatedRows]
  }

  if (rowsToFire.length === 0) return 0

  let fired = 0
  for (const row of rowsToFire) {
    const record = rowToRecord(header, row)
    let contactId: string | null = null
    let conversationId: string | null = null
    const phone = extractPhone(record, cfg.phoneColumn)
    if (phone) {
      const sanitized = sanitizePhoneForMeta(phone)
      if (isValidE164(sanitized)) {
        try {
          const contact = await findOrCreateContact(db, automation.account_id, automation.user_id, {
            phone: sanitized,
            name: extractName(record, cfg.nameColumn),
            email: extractEmail(record, cfg.emailColumn),
          })
          contactId = contact.id
          // A contact created from a sheet row has never messaged the
          // account, so it has no conversation — and the engine's
          // send steps refuse to send without one. Find-or-create it
          // here (same convention as the inbound webhook / public API)
          // and pass it via context so send steps work for brand-new
          // numbers, not just existing customers.
          const { data: conv } = await db
            .from('conversations')
            .select('id')
            .eq('account_id', automation.account_id)
            .eq('contact_id', contactId)
            .order('created_at', { ascending: true })
            .limit(1)
            .maybeSingle()
          if (conv?.id) {
            conversationId = conv.id
          } else {
            const { data: newConv, error: convErr } = await db
              .from('conversations')
              .insert({
                account_id: automation.account_id,
                user_id: automation.user_id,
                contact_id: contactId,
              })
              .select('id')
              .single()
            if (convErr || !newConv) {
              console.error('[gsheets-poll] conversation create failed:', convErr)
            } else {
              conversationId = newConv.id
            }
          }
        } catch (err) {
          console.error('[gsheets-poll] contact resolution failed:', err)
        }
      }
    }

    await runAutomationsForTrigger({
      accountId: automation.account_id,
      triggerType: automation.trigger_type,
      contactId,
      context: {
        conversation_id: conversationId ?? undefined,
        vars: { sheet_row: record },
      },
    })

    fired++
  }

  return fired
}

/** Extract a human-readable message from a Google API error response. */
async function googleErrorMessage(res: Response): Promise<string> {
  const body = await res.text().catch(() => '')
  try {
    const json = JSON.parse(body) as { error?: { message?: string } }
    if (json.error?.message) return json.error.message
  } catch {
    // not JSON — fall through
  }
  return `HTTP ${res.status}`
}

/**
 * List spreadsheets accessible to the account (for the builder UI's
 * spreadsheet picker). Uses Drive's files.list with Sheets mimeType.
 */
export async function listSpreadsheetsForAccount(accountId: string): Promise<
  { id: string; name: string }[]
> {
  const accessToken = await getAccessToken(accountId)
  const url =
    'https://www.googleapis.com/drive/v3/files?q=' +
    encodeURIComponent("mimeType='application/vnd.google-apps.spreadsheet'") +
    '&fields=files(id,name)&pageSize=100'
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) {
    throw new Error(`Could not list your spreadsheets: ${await googleErrorMessage(res)}`)
  }
  const json = (await res.json()) as { files?: { id: string; name: string }[] }
  return json.files ?? []
}

/**
 * List sheet tabs within a spreadsheet (for the builder UI's tab
 * picker).
 */
export async function listSheetsInSpreadsheet(
  accountId: string,
  spreadsheetId: string,
): Promise<string[]> {
  const accessToken = await getAccessToken(accountId)
  const url = `${GOOGLE_SHEETS_BASE}/${spreadsheetId}?fields=sheets.properties.title`
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) {
    throw new Error(`Could not read the spreadsheet tabs: ${await googleErrorMessage(res)}`)
  }
  const json = (await res.json()) as {
    sheets?: { properties?: { title?: string } }[]
  }
  return (json.sheets ?? [])
    .map((s) => s.properties?.title)
    .filter((t): t is string => Boolean(t))
}

/**
 * Read the header row (first row) of a sheet tab, so the builder can
 * show which columns exist and let the user pick the phone column.
 */
export async function listSheetHeaders(
  accountId: string,
  spreadsheetId: string,
  sheetName: string,
): Promise<string[]> {
  const accessToken = await getAccessToken(accountId)
  const values = await fetchSheetValues(accessToken, spreadsheetId, sheetName)
  const header = values[0] ?? []
  return header.map((h) => h.trim()).filter(Boolean)
}

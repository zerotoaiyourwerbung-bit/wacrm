import { NextResponse } from 'next/server'
import { requireRole, toErrorResponse } from '@/lib/auth/account'
import {
  listSpreadsheetsForAccount,
  listSheetsInSpreadsheet,
  listSheetHeaders,
} from '@/lib/automations/gsheet-poll'

/**
 * List spreadsheets (and optionally the tabs within one spreadsheet)
 * accessible to the caller's connected Google account. Used by the
 * automation builder's Google Sheets trigger config UI.
 *
 * GET /api/google-sheets/spreadsheets
 *   → { spreadsheets: [{ id, name }] }
 * GET /api/google-sheets/spreadsheets?spreadsheetId=<id>
 *   → { sheets: ["Tab1", "Tab2"] }
 * GET /api/google-sheets/spreadsheets?spreadsheetId=<id>&sheetName=<tab>
 *   → { headers: ["Name", "Phone", ...] }
 */
export async function GET(request: Request) {
  let accountId: string
  try {
    const ctx = await requireRole('admin')
    accountId = ctx.accountId
  } catch (err) {
    return toErrorResponse(err)
  }

  const url = new URL(request.url)
  const spreadsheetId = url.searchParams.get('spreadsheetId')
  const sheetName = url.searchParams.get('sheetName')

  try {
    if (spreadsheetId && sheetName) {
      const headers = await listSheetHeaders(accountId, spreadsheetId, sheetName)
      return NextResponse.json({ headers })
    }
    if (spreadsheetId) {
      const sheets = await listSheetsInSpreadsheet(accountId, spreadsheetId)
      return NextResponse.json({ sheets })
    }
    const spreadsheets = await listSpreadsheetsForAccount(accountId)
    return NextResponse.json({ spreadsheets })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error'
    const notConnected = message.includes('no google oauth token')
    return NextResponse.json(
      { error: notConnected ? 'Google account not connected' : message },
      { status: notConnected ? 400 : 500 },
    )
  }
}

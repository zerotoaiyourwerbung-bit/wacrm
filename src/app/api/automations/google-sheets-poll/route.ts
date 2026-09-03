import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { pollAllGoogleSheetAutomations } from '@/lib/automations/gsheet-poll'

/**
 * Poll all connected Google Sheets for new/updated rows and fire the
 * matching automations. Meant to be hit on a schedule (Vercel Cron /
 * external pinger) — requires a shared secret via the `x-cron-secret`
 * header to match `AUTOMATION_CRON_SECRET` (same secret as the
 * pending-executions drain, so one scheduler config covers both).
 *
 * Per-automation `pollIntervalMinutes` (default 5) is enforced inside
 * the poll engine via `google_sheets_poll_state.last_polled_at`, so
 * this endpoint can safely run every minute.
 */
export async function GET(request: Request) {
  const expected = process.env.AUTOMATION_CRON_SECRET
  if (!expected) {
    return NextResponse.json({ error: 'cron not configured' }, { status: 503 })
  }
  const supplied = request.headers.get('x-cron-secret') ?? ''
  const suppliedBuf = Buffer.from(supplied)
  const expectedBuf = Buffer.from(expected)
  if (
    suppliedBuf.length !== expectedBuf.length ||
    !timingSafeEqual(suppliedBuf, expectedBuf)
  ) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(request.url)
  const force = url.searchParams.get('force') === 'true'
  const results = await pollAllGoogleSheetAutomations({ force })

  const fired = results.reduce((sum, r) => sum + r.fired, 0)
  const errors = results.filter((r) => r.error).length
  return NextResponse.json({ automations: results.length, fired, errors })
}

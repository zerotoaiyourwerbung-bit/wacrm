/**
 * Self-Hosted Background Worker
 *
 * Runs background maintenance tasks continuously inside the Node.js server process:
 * 1. Google Sheets polling (continuous change detection without manual curls)
 * 2. Due automation wait executions draining
 * 3. Abandoned flow run sweep
 *
 * Eliminates the need for external serverless cron schedulers.
 */

import { supabaseAdmin as adminClient } from '@/lib/automations/admin-client'
import { supabaseAdmin as flowAdminClient } from '@/lib/flows/admin-client'
import { resumePendingExecution } from '@/lib/automations/engine'
import type { AutomationContext } from '@/lib/automations/engine'
import { pollAllGoogleSheetAutomations } from '@/lib/automations/gsheet-poll'
import { resolveFallbackPolicy } from '@/lib/flows/fallback'

let workerInterval: NodeJS.Timeout | null = null
let isRunning = false

export async function runBackgroundTasks(): Promise<void> {
  if (isRunning) return
  isRunning = true

  try {
    // 1. Google Sheets Poll (checks automations whose interval has elapsed)
    await pollAllGoogleSheetAutomations().catch((err) => {
      console.error('[worker] gsheet poll error:', err)
    })

    // 2. Drain due automation wait steps
    await drainDueAutomations().catch((err) => {
      console.error('[worker] drain automations error:', err)
    })
  } finally {
    isRunning = false
  }
}

/** Drain due `automation_pending_executions` rows */
async function drainDueAutomations(): Promise<number> {
  const admin = adminClient()
  const { data: due, error } = await admin
    .from('automation_pending_executions')
    .select('*')
    .eq('status', 'pending')
    .lte('run_at', new Date().toISOString())
    .order('run_at', { ascending: true })
    .limit(50)

  if (error || !due || due.length === 0) return 0

  let processed = 0
  for (const row of due) {
    const { data: claim } = await admin
      .from('automation_pending_executions')
      .update({ status: 'running' })
      .eq('id', row.id)
      .eq('status', 'pending')
      .select('id')
      .maybeSingle()

    if (!claim) continue

    await resumePendingExecution({
      id: row.id as string,
      automation_id: row.automation_id as string,
      account_id: row.account_id as string,
      user_id: row.user_id as string,
      contact_id: (row.contact_id as string | null) ?? null,
      log_id: (row.log_id as string | null) ?? null,
      parent_step_id: (row.parent_step_id as string | null) ?? null,
      branch: (row.branch as 'yes' | 'no' | null) ?? null,
      next_step_position: row.next_step_position as number,
      context: (row.context as AutomationContext) ?? {},
    }).catch((err) => {
      console.error('[worker] resume execution error for', row.id, err)
    })

    processed++
  }

  return processed
}

/** Sweep abandoned flow runs (runs every ~5 minutes) */
export async function sweepAbandonedFlowRuns(): Promise<void> {
  try {
    const admin = flowAdminClient()
    const { data: activeRuns, error } = await admin
      .from('flow_runs')
      .select('id, flow_id, current_node_key, last_advanced_at, flows(fallback_policy)')
      .eq('status', 'active')
      .limit(100)

    if (error || !activeRuns || activeRuns.length === 0) return

    const now = Date.now()
    for (const run of activeRuns) {
      const flow = Array.isArray(run.flows) ? run.flows[0] : run.flows
      const policy = resolveFallbackPolicy(flow?.fallback_policy)
      const timeoutMs = policy.on_timeout_hours * 3600_000
      const lastActive = new Date(run.last_advanced_at).getTime()

      if (now - lastActive > timeoutMs) {
        await admin
          .from('flow_runs')
          .update({
            status: 'timed_out',
            ended_at: new Date().toISOString(),
            end_reason: 'stale_sweep',
          })
          .eq('id', run.id)
      }
    }
  } catch (err) {
    console.error('[worker] flow sweep error:', err)
  }
}

/**
 * Start the persistent in-process background worker.
 * Idempotent: safe to call multiple times.
 */
export function startBackgroundWorker(): void {
  if (workerInterval) return

  // Run tasks every 30 seconds
  workerInterval = setInterval(() => {
    void runBackgroundTasks()
  }, 30_000)

  if (workerInterval.unref) {
    workerInterval.unref()
  }

  // Run flow timeout sweep every 5 minutes
  const flowTimer = setInterval(() => {
    void sweepAbandonedFlowRuns()
  }, 5 * 60_000)

  if (flowTimer.unref) {
    flowTimer.unref()
  }

  // Kick off initial run immediately
  void runBackgroundTasks()
}

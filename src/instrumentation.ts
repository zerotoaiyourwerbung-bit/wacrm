/**
 * Next.js Server Instrumentation
 * Runs once on server startup in the Node.js runtime.
 *
 * Starts a background scheduler for automatic Google Sheets polling
 * and automation execution without requiring manual curls or external crons.
 */

let pollerStarted = false

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    if (pollerStarted) return
    pollerStarted = true

    // Start background worker on server startup
    setTimeout(async () => {
      const { startBackgroundWorker } = await import('@/lib/server/background-worker')
      startBackgroundWorker()
    }, 3_000)
  }
}

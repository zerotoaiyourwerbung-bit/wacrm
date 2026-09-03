import { NextResponse } from "next/server";

import { getCurrentAccount, toErrorResponse } from "@/lib/auth/account";
import type { StoredPresence } from "@/lib/presence";

export async function POST(request: Request) {
  try {
    const ctx = await getCurrentAccount();
    const body = await request.json().catch(() => ({}));
    const status: StoredPresence = body.status === "away" ? "away" : "online";

    const { error } = await ctx.supabase.rpc("touch_presence", {
      p_status: status,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Ensure persistent background worker is active and trigger tasks
    void import("@/lib/server/background-worker").then(({ startBackgroundWorker, runBackgroundTasks }) => {
      startBackgroundWorker();
      void runBackgroundTasks();
    }).catch(() => {});

    return NextResponse.json({ success: true });
  } catch (err) {
    return toErrorResponse(err);
  }
}

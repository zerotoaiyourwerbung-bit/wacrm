/**
 * Shared status badge config for broadcasts + recipients.
 *
 * Previously `statusConfig` was defined inline in both
 * /broadcasts/page.tsx and /broadcasts/[id]/page.tsx with slight
 * drift risk. One source of truth now.
 *
 * Badge shape: bg-*-500/10 + text-*-400 + border-*-500/20. The
 * translucent fills sit fine on both light and dark surfaces; neutral
 * statuses use text-muted-foreground so the label stays legible in
 * light mode (a solid slate-400 would be too faint on white).
 */

import type { BroadcastStatus, RecipientStatus } from "@/types";

export interface StatusDisplay {
  label: string;
  classes: string;
  /**
   * Set true for statuses that should pulse in the UI to convey
   * "live / in-flight" — currently only `sending`.
   */
  pulse?: boolean;
}

export const broadcastStatusConfig: Record<BroadcastStatus, StatusDisplay> = {
  draft: {
    label: "draft",
    classes: "bg-slate-100 text-slate-700 border-slate-300 font-medium",
  },
  scheduled: {
    label: "scheduled",
    classes: "bg-sky-50 text-sky-800 border-sky-300 font-medium",
  },
  sending: {
    label: "sending",
    classes: "bg-amber-50 text-amber-800 border-amber-300 font-medium",
    pulse: true,
  },
  sent: {
    label: "sent",
    classes: "bg-emerald-50 text-emerald-800 border-emerald-300 font-medium",
  },
  failed: {
    label: "failed",
    classes: "bg-rose-50 text-rose-800 border-rose-300 font-medium",
  },
};

export const recipientStatusConfig: Record<RecipientStatus, StatusDisplay> = {
  pending: {
    label: "pending",
    classes: "bg-slate-100 text-slate-700 border-slate-300 font-medium",
  },
  sent: {
    label: "sent",
    classes: "bg-sky-50 text-sky-800 border-sky-300 font-medium",
  },
  delivered: {
    label: "delivered",
    classes: "bg-teal-50 text-teal-800 border-teal-300 font-medium",
  },
  read: {
    label: "read",
    classes: "bg-emerald-50 text-emerald-800 border-emerald-300 font-medium",
  },
  replied: {
    label: "replied",
    classes: "bg-purple-50 text-purple-800 border-purple-300 font-medium",
  },
  failed: {
    label: "failed",
    classes: "bg-rose-50 text-rose-800 border-rose-300 font-medium",
  },
};

/**
 * Tolerant lookup — callers often have a generic string status
 * coming from Supabase. Falls back to the "draft" / "pending"
 * entry so the UI never crashes on an unknown value.
 */
export function getBroadcastStatus(status: string): StatusDisplay {
  return (
    broadcastStatusConfig[status as BroadcastStatus] ??
    broadcastStatusConfig.draft
  );
}

export function getRecipientStatus(status: string): StatusDisplay {
  return (
    recipientStatusConfig[status as RecipientStatus] ??
    recipientStatusConfig.pending
  );
}

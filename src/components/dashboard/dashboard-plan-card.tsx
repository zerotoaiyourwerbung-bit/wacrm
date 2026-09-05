"use client"

import Link from 'next/link'
import { ArrowUpRight, Sparkles, TrendingUp } from 'lucide-react'

export function DashboardPlanCard() {
  return (
    <div className="flex h-full flex-col justify-between rounded-lg border border-[#E5EAE7] bg-white p-5 shadow-xs transition-all duration-200 hover:shadow-sm">
      <div>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              WhatsApp Cloud API
            </p>
            <h3 className="mt-1 text-lg font-bold tracking-tight text-slate-900">
              Meta Cloud Connected
            </h3>
          </div>
          <Link
            href="/settings?tab=whatsapp"
            className="flex items-center gap-1.5 rounded-lg bg-[#0F332A] px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-[#164237] transition-colors shrink-0"
          >
            <span>Manage</span>
            <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        <p className="mt-2.5 text-xs leading-relaxed text-slate-600">
          Supercharge your customer communication and unlock automated workflows, broadcast campaigns, and smart AI agent responses.
        </p>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 border-t border-slate-100 pt-4">
        <div className="rounded-lg bg-[#F4F7F5] p-3 border border-[#E4E9E6]">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-600">
            <TrendingUp className="h-3.5 w-3.5 text-emerald-700" />
            <span>Delivery Rate</span>
          </div>
          <p className="mt-1 text-base font-extrabold text-slate-900 tabular-nums">
            ↑ 99.4%
          </p>
        </div>

        <div className="rounded-lg bg-[#F4F7F5] p-3 border border-[#E4E9E6]">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-600">
            <Sparkles className="h-3.5 w-3.5 text-emerald-700" />
            <span>Active Triggers</span>
          </div>
          <p className="mt-1 text-base font-extrabold text-slate-900 tabular-nums">
            12 active
          </p>
        </div>
      </div>
    </div>
  )
}


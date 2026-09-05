import { ArrowDown, ArrowUp, ArrowRight, Minus } from 'lucide-react'
import type { ComponentType } from 'react'
import { cn } from '@/lib/utils'

interface MetricCardProps {
  title: string
  /** Pre-formatted value for display (e.g. "42" or "$1,250"). */
  value: string
  icon: ComponentType<{ className?: string }>
  /**
   * Delta-mode secondary row: arrow + delta text. Omit when the metric
   * doesn't have a sensible comparison (e.g. total pipeline value).
   */
  delta?: {
    /** Positive / negative / zero drives arrow + color. */
    sign: number
    /** Pre-formatted delta, e.g. "+3 vs yesterday". */
    label: string
    /** Short percentage or change badge like "+10.5%" */
    badge?: string
  }
  /** Used instead of `delta` when the metric has a static subtitle. */
  subtitle?: string
}

export function MetricCard({ title, value, icon: Icon, delta, subtitle }: MetricCardProps) {
  const isPositive = delta ? delta.sign > 0 : false
  const isNegative = delta ? delta.sign < 0 : false

  // Derive compact badge if not explicitly given
  const badgeText = delta?.badge ?? (delta?.sign ? `${delta.sign > 0 ? '+' : ''}${delta.sign}%` : null)

  return (
    <div className="group flex flex-col justify-between rounded-xl border border-[#E5EAE7] bg-white p-4.5 shadow-xs transition-all duration-200 hover:shadow-sm hover:border-[#D1DCD6]">
      {/* Top row: Label & Squircle Icon */}
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold tracking-wider text-gray-500 uppercase">
          {title}
        </p>
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 border border-emerald-100/80 text-emerald-600 transition-transform group-hover:scale-105">
          <Icon className="h-4 w-4" />
        </div>
      </div>

      {/* Main value + Inline Delta Pill */}
      <div className="mt-3 flex items-baseline gap-2.5">
        <span className="text-[26px] font-extrabold tracking-tight text-gray-900 tabular-nums">
          {value}
        </span>
        {delta && badgeText && (
          <span
            className={cn(
              'inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-bold border',
              isPositive
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200/60'
                : isNegative
                ? 'bg-rose-50 text-rose-700 border-rose-200/60'
                : 'bg-gray-50 text-gray-600 border-gray-200/60'
            )}
          >
            {isPositive ? (
              <ArrowUp className="h-3 w-3" />
            ) : isNegative ? (
              <ArrowDown className="h-3 w-3" />
            ) : (
              <Minus className="h-3 w-3" />
            )}
            <span>{badgeText}</span>
          </span>
        )}
      </div>

      {/* Bottom comparison row + Subtle arrow button */}
      <div className="mt-3 flex items-center justify-between border-t border-gray-50 pt-2.5 text-xs text-gray-400">
        <p className="truncate font-medium">
          {delta ? delta.label : subtitle ?? 'Up to date'}
        </p>
        <ArrowRight className="h-3.5 w-3.5 text-gray-300 transition-transform group-hover:translate-x-0.5 group-hover:text-gray-600" />
      </div>
    </div>
  )
}

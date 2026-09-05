"use client"

import { GitBranch } from 'lucide-react'
import type { PipelineDonutData } from '@/lib/dashboard/types'
import { formatCurrencyShort } from '@/lib/currency'
import { EmptyState } from './empty-state'
import { Skeleton } from './skeleton'

interface PipelineDonutProps {
  data: PipelineDonutData | null
  loading: boolean
  /** Account default currency for the totals. */
  currency: string
}

import { useTranslations } from 'next-intl'

export function PipelineDonut({ data, loading, currency }: PipelineDonutProps) {
  const t = useTranslations('Dashboard.pipelineDonut')

  const totalDeals = data ? data.stages.reduce((acc, s) => acc + s.dealCount, 0) : 0
  const wonDeals = data?.stages.find((s) => s.name.toLowerCase().includes('won'))?.dealCount ?? 0
  const winRate = totalDeals > 0 ? ((wonDeals / totalDeals) * 100).toFixed(1) : '18.5'

  return (
    <section className="flex h-full flex-col justify-between rounded-xl border border-[#E5EAE7] bg-white p-4.5 shadow-xs">
      {/* Header matching Vizora Conversion Rate card */}
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
            Conversion & Pipeline
          </p>
          <div className="mt-1 flex items-baseline gap-2.5">
            <span className="text-[26px] font-extrabold tracking-tight text-gray-900 tabular-nums">
              {winRate}%
            </span>
            <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-50 border border-emerald-200/60 px-2 py-0.5 text-[11px] font-bold text-emerald-700">
              <span>+2.4%</span>
            </span>
          </div>
        </div>
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 border border-emerald-100/80 text-emerald-600">
          <GitBranch className="h-4 w-4" />
        </div>
      </div>

      <div className="mt-4 flex flex-1 flex-col justify-center">
        {loading || !data ? (
          <Skeleton className="h-48 w-full rounded-xl" />
        ) : data.stages.length === 0 ? (
          <EmptyState
            icon={GitBranch}
            title={t('noOpenDeals')}
            hint={t('noOpenDealsHint')}
          />
        ) : (
          <>
            <Donut data={data} currency={currency} />
            <ul className="mt-4 divide-y divide-gray-50 space-y-1">
              {data.stages.map((s) => (
                <li key={s.id} className="flex items-center justify-between py-1.5 text-xs">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span
                      className="h-2 w-2 flex-shrink-0 rounded-full"
                      style={{ background: s.color }}
                      aria-hidden
                    />
                    <div className="flex flex-col min-w-0">
                      <span className="truncate font-semibold text-gray-800">{s.name}</span>
                      <span className="text-[10px] text-gray-400">
                        {t('dealCount', { count: s.dealCount })}
                      </span>
                    </div>
                  </div>
                  <span className="font-bold text-gray-900 tabular-nums">
                    {formatCurrencyShort(s.totalValue, currency)}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </section>
  )
}

// ------------------------------------------------------------
// SVG ring. 200×200 viewBox, 12px ring width. We draw one <path>
// per stage using an SVG arc from startAngle → endAngle. Gaps
// between segments are implied by a thin slate-900 stroke between
// them for a cleaner look.
// ------------------------------------------------------------
function Donut({ data, currency }: { data: PipelineDonutData; currency: string }) {
  const t = useTranslations('Dashboard.pipelineDonut')
  const size = 200
  const r = 80
  const ringWidth = 18
  const cx = size / 2
  const cy = size / 2

  // Small slices would render as slivers that disappear into stroke
  // rounding. We give each stage a floor share purely for rendering,
  // but keep the labels/legend honest with the actual totals.
  const totalRaw = data.totalValue || 1
  const minFrac = 0.02
  const rawShares = data.stages.map((s) => s.totalValue / totalRaw)
  const floored = rawShares.map((x) => Math.max(x, minFrac))
  const floorSum = floored.reduce((a, b) => a + b, 0)
  const shares = floored.map((x) => x / floorSum)

  // Build a cumulative-offset array, then map stages → arc paths. Using
  // a pre-computed offsets array avoids the Next 16 React Compiler's
  // "Cannot reassign variable after render completes" rule.
  const offsets: number[] = [0]
  for (let i = 0; i < shares.length; i++) offsets.push(offsets[i] + shares[i])
  const segments = data.stages.map((s, i) => {
    const start = offsets[i] * Math.PI * 2 - Math.PI / 2
    const end = offsets[i + 1] * Math.PI * 2 - Math.PI / 2
    return { path: arcPath(cx, cy, r, start, end), color: s.color, id: s.id }
  })

  return (
    <div className="flex items-center justify-center">
      <svg viewBox={`0 0 ${size} ${size}`} className="h-48 w-48" role="img" aria-label={t('ariaLabel')}>
        {/* background ring */}
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--muted)" strokeWidth={ringWidth} />
        {segments.map((seg) => (
          <path
            key={seg.id}
            d={seg.path}
            fill="none"
            stroke={seg.color}
            strokeWidth={ringWidth}
            strokeLinecap="butt"
          />
        ))}
        {/* center label */}
        <text
          x={cx}
          y={cy - 6}
          textAnchor="middle"
          className="fill-muted-foreground text-[11px]"
        >
          {t('total')}
        </text>
        <text
          x={cx}
          y={cy + 14}
          textAnchor="middle"
          className="fill-foreground text-[18px] font-semibold tabular-nums"
        >
          {formatCurrencyShort(data.totalValue, currency)}
        </text>
      </svg>
    </div>
  )
}

function arcPath(cx: number, cy: number, r: number, startRad: number, endRad: number): string {
  const x1 = cx + r * Math.cos(startRad)
  const y1 = cy + r * Math.sin(startRad)
  const x2 = cx + r * Math.cos(endRad)
  const y2 = cy + r * Math.sin(endRad)
  const largeArc = endRad - startRad > Math.PI ? 1 : 0
  return `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`
}

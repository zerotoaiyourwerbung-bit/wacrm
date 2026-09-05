"use client"

import { useEffect, useMemo, useRef, useState } from 'react'
import { MessageSquare } from 'lucide-react'
import type { ConversationsSeriesPoint } from '@/lib/dashboard/types'
import { EmptyState } from './empty-state'
import { Skeleton } from './skeleton'
import { cn } from '@/lib/utils'

type RangeDays = 7 | 30 | 90

interface ConversationsChartProps {
  /** Per-range data, so switching tabs never re-fetches. */
  series: Record<RangeDays, ConversationsSeriesPoint[] | null>
  loading: boolean
  range: RangeDays
  onRangeChange: (r: RangeDays) => void
}

// ------------------------------------------------------------
// Layout constants. The SVG renders into a fixed viewBox and scales
// via CSS (preserveAspectRatio default). Everything inside uses
// viewBox coordinates so the drawing math stays simple even as the
// container resizes.
// ------------------------------------------------------------
const VB_W = 760
const VB_H = 240
const PADDING = { top: 16, right: 16, bottom: 28, left: 40 }

import { useTranslations } from 'next-intl'

export function ConversationsChart({ series, loading, range, onRangeChange }: ConversationsChartProps) {
  const t = useTranslations('Dashboard.conversationsChart')
  const data = series[range]

  // Memoise the max so per-day hover math doesn't recompute it.
  const { maxY, niceTicks } = useMemo(() => {
    const arr = data ?? []
    const max = arr.reduce(
      (m, p) => Math.max(m, p.incoming, p.outgoing),
      0,
    )
    const ceil = niceCeil(max)
    const ticks = [0, ceil / 4, ceil / 2, (3 * ceil) / 4, ceil].map((v) =>
      Math.round(v),
    )
    // De-dupe when the series is flat 0.
    return { maxY: ceil, niceTicks: Array.from(new Set(ticks)) }
  }, [data])

  const totalVolume = useMemo(() => {
    if (!data) return 0
    return data.reduce((acc, p) => acc + p.incoming + p.outgoing, 0)
  }, [data])

  return (
    <section className="flex h-full flex-col justify-between rounded-xl border border-[#E5EAE7] bg-white shadow-xs">
      <header className="flex flex-wrap items-start justify-between gap-4 p-5 pb-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
            Overall Conversations
          </p>
          <div className="mt-1 flex items-baseline gap-2.5">
            <span className="text-[26px] font-extrabold tracking-tight text-gray-900 tabular-nums">
              {totalVolume.toLocaleString()}
            </span>
            <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-50 border border-emerald-200/60 px-2 py-0.5 text-[11px] font-bold text-emerald-700">
              <span>+12.4%</span>
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Legend dots */}
          <div className="hidden sm:flex items-center gap-3 text-xs font-medium text-gray-500">
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-emerald-500" />
              <span>Incoming</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-slate-400" />
              <span>Outgoing</span>
            </span>
          </div>

          {/* Range tabs */}
          <div className="flex items-center rounded-lg bg-gray-100 p-0.5 border border-gray-200/60">
            {[7, 30, 90].map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => onRangeChange(r as RangeDays)}
                className={cn(
                  'rounded-md px-2.5 py-1 text-xs font-semibold transition-all',
                  range === r
                    ? 'bg-white text-gray-900 shadow-xs'
                    : 'text-gray-500 hover:text-gray-900',
                )}
              >
                {t('days', { count: r })}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="px-5 pb-5">
        {loading || !data ? (
          <Skeleton className="h-[240px] w-full rounded-xl" />
        ) : data.every((p) => p.incoming === 0 && p.outgoing === 0) ? (
          <EmptyState
            icon={MessageSquare}
            title={t('noActivity')}
            hint={t('noActivityHint')}
          />
        ) : (
          <LineSvg data={data} maxY={maxY} ticks={niceTicks} t={t} />
        )}
      </div>
    </section>
  )
}

// ------------------------------------------------------------
// The actual SVG. Two polylines + per-day hit targets for hover.
// ------------------------------------------------------------

function LineSvg({
  data,
  maxY,
  ticks,
  t
}: {
  data: ConversationsSeriesPoint[]
  maxY: number
  ticks: number[]
  t: ReturnType<typeof useTranslations>
}) {
  // Hover state: both the snapped index AND the tooltip's pixel
  // offset inside the wrapper div. They're stored together so the
  // tooltip positions against the chart's actual rendered pixels,
  // not against a raw viewBox percentage. See the precision note on
  // the onMove handler below.
  const [hover, setHover] = useState<{ idx: number; tooltipLeftPx: number } | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  const chartW = VB_W - PADDING.left - PADDING.right
  const chartH = VB_H - PADDING.top - PADDING.bottom

  // x step can be fractional for 90-day views; points are positioned
  // at the center of each "slot" so the first and last points don't
  // sit right on the axis.
  const stepX = data.length > 1 ? chartW / (data.length - 1) : 0
  const yFor = (v: number) =>
    maxY === 0 ? PADDING.top + chartH : PADDING.top + chartH - (v / maxY) * chartH
  const xFor = (i: number) => PADDING.left + i * stepX

  const incomingPath = data.map((p, i) => `${i === 0 ? 'M' : 'L'}${xFor(i)},${yFor(p.incoming)}`).join(' ')
  const outgoingPath = data.map((p, i) => `${i === 0 ? 'M' : 'L'}${xFor(i)},${yFor(p.outgoing)}`).join(' ')

  const firstX = xFor(0)
  const lastX = xFor(data.length - 1)
  const baseY = PADDING.top + chartH
  const areaPath = data.length > 0 ? `${incomingPath} L${lastX},${baseY} L${firstX},${baseY} Z` : ''

  // Mouse-move: use the SVG's current screen-CTM to map clientX
  // back to viewBox coordinates.
  useEffect(() => {
    const svg = svgRef.current
    const wrap = wrapRef.current
    if (!svg || !wrap) return
    const onMove = (e: MouseEvent) => {
      const ctm = svg.getScreenCTM()
      if (!ctm) return
      const pt = svg.createSVGPoint()
      pt.x = e.clientX
      pt.y = e.clientY
      const local = pt.matrixTransform(ctm.inverse())
      const xVb = local.x
      if (xVb < PADDING.left - 8 || xVb > VB_W - PADDING.right + 8) {
        setHover(null)
        return
      }
      const relative = xVb - PADDING.left
      const idx = Math.max(
        0,
        Math.min(data.length - 1, Math.round(stepX === 0 ? 0 : relative / stepX)),
      )
      const dataPointVbX = PADDING.left + idx * stepX
      const dataPointPt = svg.createSVGPoint()
      dataPointPt.x = dataPointVbX
      dataPointPt.y = 0
      const screen = dataPointPt.matrixTransform(ctm)
      const wrapRect = wrap.getBoundingClientRect()
      setHover({ idx, tooltipLeftPx: screen.x - wrapRect.left })
    }
    const onLeave = () => setHover(null)
    svg.addEventListener('mousemove', onMove)
    svg.addEventListener('mouseleave', onLeave)
    return () => {
      svg.removeEventListener('mousemove', onMove)
      svg.removeEventListener('mouseleave', onLeave)
    }
  }, [data, stepX])

  const hovered = hover !== null ? data[hover.idx] : null
  const hoverX = hover !== null ? xFor(hover.idx) : 0

  // X-axis label strategy
  const labelStride = Math.max(1, Math.ceil(data.length / 6))

  return (
    <div ref={wrapRef} className="relative w-full">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        className="h-[240px] w-full"
        role="img"
        aria-label={t('ariaLabel')}
      >
        <defs>
          <linearGradient id="emeraldAreaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#10B981" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#10B981" stopOpacity="0.0" />
          </linearGradient>
        </defs>

        {/* Y-axis gridlines + labels */}
        {ticks.map((tickVal) => {
          const y = yFor(tickVal)
          return (
            <g key={tickVal}>
              <line
                x1={PADDING.left}
                x2={VB_W - PADDING.right}
                y1={y}
                y2={y}
                stroke="#E5EAE7"
                strokeDasharray="4 4"
              />
              <text
                x={PADDING.left - 8}
                y={y}
                textAnchor="end"
                dominantBaseline="middle"
                className="fill-gray-400 text-[10px] font-medium"
              >
                {tickVal}
              </text>
            </g>
          )
        })}

        {/* X-axis labels */}
        {data.map((p, i) =>
          i % labelStride === 0 ? (
            <text
              key={p.day}
              x={xFor(i)}
              y={VB_H - 8}
              textAnchor="middle"
              className="fill-gray-400 text-[10px] font-medium"
            >
              {shortDayLabel(p.day)}
            </text>
          ) : null,
        )}

        {/* Gradient Area under incoming */}
        {areaPath && (
          <path d={areaPath} fill="url(#emeraldAreaGrad)" />
        )}

        {/* Outgoing polyline (Slate) */}
        <path
          d={outgoingPath}
          fill="none"
          stroke="#94A3B8"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Incoming polyline (Emerald) */}
        <path
          d={incomingPath}
          fill="none"
          stroke="#10B981"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Hover crosshair */}
        {hover !== null && (
          <g pointerEvents="none">
            <line
              x1={hoverX}
              x2={hoverX}
              y1={PADDING.top}
              y2={PADDING.top + chartH}
              stroke="#CBD5E1"
              strokeDasharray="3 3"
            />
            <circle cx={hoverX} cy={yFor(data[hover.idx].incoming)} r={4} fill="#10B981" stroke="#FFFFFF" strokeWidth={2} />
            <circle cx={hoverX} cy={yFor(data[hover.idx].outgoing)} r={4} fill="#94A3B8" stroke="#FFFFFF" strokeWidth={2} />
          </g>
        )}
      </svg>

      {/* Tooltip */}
      {hovered && hover !== null && (
        <div
          className="pointer-events-none absolute top-2 z-10 -translate-x-1/2 rounded-xl border border-[#E5EAE7] bg-white p-3 text-xs shadow-lg"
          style={{ left: `${hover.tooltipLeftPx}px` }}
        >
          <div className="font-bold text-gray-900">{longDayLabel(hovered.day)}</div>
          <div className="mt-1.5 flex flex-col gap-1">
            <span className="flex items-center gap-1.5 text-emerald-700 font-semibold">
              <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
              {t('tooltipIncoming', { count: hovered.incoming })}
            </span>
            <span className="flex items-center gap-1.5 text-slate-600 font-medium">
              <span className="inline-block h-2 w-2 rounded-full bg-slate-400" />
              {t('tooltipOutgoing', { count: hovered.outgoing })}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: color }} />
      {label}
    </span>
  )
}

function shortDayLabel(key: string): string {
  // key is YYYY-MM-DD; return "Apr 17"-style. Using Date with an
  // appended time avoids timezone-shift surprises across midnight.
  const [y, m, d] = key.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function longDayLabel(key: string): string {
  const [y, m, d] = key.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}

/**
 * Round `max` up to a "nice" number so Y-axis ticks feel natural
 * (1, 2, 5, 10, 20, 50, …). Keeps the chart readable even when the
 * series is small (max=3 becomes ceil=4, not 3).
 */
function niceCeil(max: number): number {
  if (max <= 0) return 4
  const pow = Math.pow(10, Math.floor(Math.log10(max)))
  const normalised = max / pow
  let nice: number
  if (normalised <= 1) nice = 1
  else if (normalised <= 2) nice = 2
  else if (normalised <= 5) nice = 5
  else nice = 10
  return nice * pow
}

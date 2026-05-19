import { useEffect, useId, useMemo, useState } from 'react'

const CHART_W = 720
const CHART_H = 200
const PAD = { top: 20, right: 16, bottom: 36, left: 12 }
const BAR_GAP = 6
const BAR_RADIUS = 6
const ANIM_MS = 800

function easeOutQuart(t) {
  return 1 - (1 - t) ** 4
}

/** @param {number} hour24 0–23 */
export function formatHour12(hour24) {
  const h = Number(hour24)
  if (!Number.isFinite(h) || h < 0 || h > 23) return ''
  const period = h < 12 ? 'AM' : 'PM'
  const h12 = h % 12 || 12
  return `${h12}:00 ${period}`
}

function parseHour(label, index) {
  const n = Number.parseInt(String(label ?? ''), 10)
  return Number.isFinite(n) && n >= 0 && n <= 23 ? n : index
}

function roundedTopBarPath(x, y, width, height, radius) {
  if (height <= 0) return ''
  const r = Math.min(radius, width / 2, height)
  return [
    `M ${x} ${y + height}`,
    `L ${x} ${y + r}`,
    `Q ${x} ${y} ${x + r} ${y}`,
    `L ${x + width - r} ${y}`,
    `Q ${x + width} ${y} ${x + width} ${y + r}`,
    `L ${x + width} ${y + height}`,
    'Z',
  ].join(' ')
}

/**
 * @param {{ title: string, data: Array<{ label: string, value: number }> }} props
 */
export default function SignInsHourlyChart({ title, data }) {
  const gradientId = useId().replace(/:/g, '')
  const [animT, setAnimT] = useState(0)
  const [hovered, setHovered] = useState(null)

  const points = useMemo(() => {
    const rows = Array.isArray(data) && data.length === 24 ? data : Array.from({ length: 24 }, (_, i) => ({ label: String(i).padStart(2, '0'), value: 0 }))
    return rows.map((d, i) => ({
      hour: parseHour(d.label, i),
      label: d.label,
      value: Number(d.value) || 0,
    }))
  }, [data])

  const maxValue = useMemo(() => Math.max(1, ...points.map((p) => p.value)), [points])

  const plotW = CHART_W - PAD.left - PAD.right
  const plotH = CHART_H - PAD.top - PAD.bottom
  const barSlot = plotW / 24
  const barW = Math.min(24, barSlot - BAR_GAP)

  useEffect(() => {
    let start = null
    let raf = 0
    setAnimT(0)

    const frame = (ts) => {
      if (start == null) start = ts
      const raw = Math.min(1, (ts - start) / ANIM_MS)
      setAnimT(easeOutQuart(raw))
      if (raw < 1) raf = requestAnimationFrame(frame)
    }

    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [points])

  const gridLines = 4

  return (
    <div className="h-full w-full min-h-[280px] overflow-x-auto">
      <div className="relative flex h-full min-h-[280px] min-w-0 flex-col rounded-xl border border-neutral-200/80 bg-white p-5 shadow-sm ring-1 ring-slate-900/[0.03]">
        <div className="flex shrink-0 items-center justify-between gap-3">
          <h4 className="text-sm font-bold tracking-tight text-neutral-900">{title}</h4>
          <span className="text-[11px] font-medium uppercase tracking-wider text-slate-400">Today · 24h</span>
        </div>

        <div className="relative mt-5 min-h-0 flex-1">
          <svg
            viewBox={`0 0 ${CHART_W} ${CHART_H}`}
            className="h-full min-h-[200px] w-full select-none"
            role="img"
            aria-label={title}
          >
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#6366f1" stopOpacity="1" />
                <stop offset="55%" stopColor="#3b82f6" stopOpacity="0.85" />
                <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.1" />
              </linearGradient>
            </defs>

            {Array.from({ length: gridLines + 1 }, (_, i) => {
              const y = PAD.top + (plotH * i) / gridLines
              return (
                <line
                  key={`grid-${i}`}
                  x1={PAD.left}
                  y1={y}
                  x2={CHART_W - PAD.right}
                  y2={y}
                  stroke="#f1f5f9"
                  strokeWidth="1"
                  vectorEffect="non-scaling-stroke"
                />
              )
            })}

            <line
              x1={PAD.left}
              y1={PAD.top + plotH}
              x2={CHART_W - PAD.right}
              y2={PAD.top + plotH}
              stroke="rgba(15, 23, 42, 0.08)"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />

            {points.map((p, i) => {
              const fullH = (p.value / maxValue) * plotH
              const barH = Math.max(p.value > 0 ? 3 : 0, fullH * animT)
              const x = PAD.left + i * barSlot + (barSlot - barW) / 2
              const y = PAD.top + plotH - barH
              const cx = x + barW / 2
              const showLabel = p.hour % 3 === 0

              return (
                <g key={p.hour}>
                  <rect
                    x={x - 4}
                    y={PAD.top}
                    width={barW + 8}
                    height={plotH}
                    fill="transparent"
                    className="cursor-pointer"
                    onMouseEnter={() => setHovered({ hour: p.hour, value: p.value, cx, cy: y })}
                    onMouseLeave={() => setHovered((h) => (h?.hour === p.hour ? null : h))}
                    onFocus={() => setHovered({ hour: p.hour, value: p.value, cx, cy: y })}
                    onBlur={() => setHovered(null)}
                    tabIndex={0}
                    aria-label={`${p.value} sign-ins at ${formatHour12(p.hour)}`}
                  />
                  {barH > 0 ? (
                    <path
                      d={roundedTopBarPath(x, y, barW, barH, BAR_RADIUS)}
                      fill={`url(#${gradientId})`}
                      className="pointer-events-none transition-opacity duration-150"
                      style={{ opacity: hovered?.hour === p.hour ? 1 : 0.92 }}
                    />
                  ) : null}
                  {showLabel ? (
                    <text
                      x={cx}
                      y={CHART_H - 10}
                      textAnchor="middle"
                      className="fill-slate-400 text-[10px] font-medium tracking-wide"
                      style={{ fontFamily: 'system-ui, sans-serif' }}
                    >
                      {formatHour12(p.hour)}
                    </text>
                  ) : null}
                </g>
              )
            })}
          </svg>

          {hovered ? (
            <div
              className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-xl border border-slate-200/80 bg-white px-3.5 py-2.5 shadow-lg shadow-slate-900/10 ring-1 ring-slate-900/5"
              style={{
                left: `${((hovered.cx / CHART_W) * 100).toFixed(2)}%`,
                top: `${((hovered.cy / CHART_H) * 100).toFixed(2)}%`,
                marginTop: -10,
              }}
            >
              <p className="text-sm font-semibold text-slate-800">
                <span className="mr-1" aria-hidden>
                  ✨
                </span>
                {hovered.value} Sign-in{hovered.value === 1 ? '' : 's'} at {formatHour12(hovered.hour)}
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}


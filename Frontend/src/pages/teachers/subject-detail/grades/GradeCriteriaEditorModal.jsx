import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { ACTION_BLUE } from '../../instituteChrome.js'



function drawDonut(canvas, rows) {

  if (!canvas) return

  const ctx = canvas.getContext('2d')

  const W = 200

  const cx = W / 2

  const cy = W / 2

  const r = W / 2 - 4

  ctx.clearRect(0, 0, W, W)

  const total = rows.reduce((s, c) => s + Math.max(0, Number(c.percentage) || 0), 0)

  if (total <= 0) return

  let start = -Math.PI / 2

  rows.forEach((c) => {

    const pct = Math.max(0, Number(c.percentage) || 0)

    const slice = (pct / Math.max(total, 100)) * Math.PI * 2

    if (slice <= 0) return

    const end = start + slice - 0.018

    ctx.beginPath()

    ctx.moveTo(cx, cy)

    ctx.arc(cx, cy, r, start, end)

    ctx.closePath()

    ctx.fillStyle = c.color || '#185FA5'

    ctx.fill()

    start = end + 0.018

  })

  ctx.beginPath()

  ctx.arc(cx, cy, r * 0.52, 0, Math.PI * 2)

  ctx.fillStyle = '#fff'

  ctx.fill()

}



function normalizeRow(r) {

  return {

    ...r,

    name: String(r.name || '').trim() || 'Component',

    percentage: Number(r.percentage ?? 0),

    color: r.color || '#3B82F6',

    maps_to_assignment: Boolean(r.maps_to_assignment),

    maps_to_activity: Boolean(r.maps_to_activity),

    is_quiz: Boolean(r.is_quiz),

  }

}



export default function GradeCriteriaEditorModal({ open, criteria, subject, onClose, onSave, saving }) {

  const canvasRef = useRef(null)

  const [rows, setRows] = useState([])



  useEffect(() => {

    if (!open) return

    const incoming = Array.isArray(criteria?.components)

      ? criteria.components

      : Array.isArray(criteria?.criteria)

        ? criteria.criteria

        : []

    setRows(incoming.map(normalizeRow))

  }, [open, criteria])



  const total = useMemo(() => rows.reduce((s, r) => s + Number(r.percentage || 0), 0), [rows])

  const valid = rows.length > 0 && total === 100



  useEffect(() => {

    if (open) drawDonut(canvasRef.current, rows)

  }, [open, rows])



  const patchRow = useCallback((idx, field, value) => {

    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, [field]: value } : r)))

  }, [])



  const addComponent = useCallback(() => {

    setRows((prev) => [

      ...prev,

      {

        name: `Component ${prev.length + 1}`,

        percentage: 0,

        color: '#3B82F6',

        maps_to_assignment: true,

        maps_to_activity: false,

        is_quiz: false,

      },

    ])

  }, [])



  const removeComponent = useCallback((idx) => {

    setRows((prev) => prev.filter((_, i) => i !== idx))

  }, [])



  if (!open) return null



  const title = [subject?.subject_name, subject?.grade_level].filter(Boolean).join(' · ')



  return (

    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">

      <div className="max-h-[90vh] w-full max-w-4xl overflow-auto rounded-xl border border-neutral-200 bg-white shadow-xl">

        <div className="flex items-center justify-between border-b border-neutral-200 bg-neutral-50 px-4 py-3">

          <div>

            <h3 className="text-sm font-semibold text-neutral-900">Grade Criteria{title ? ` — ${title}` : ''}</h3>

            <p className="text-xs text-neutral-500">Changes apply to grade calculations for this subject</p>

          </div>

          <div className="flex gap-2">

            <button type="button" className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs" onClick={onClose}>

              Cancel

            </button>

            <button

              type="button"

              disabled={!valid || saving}

              className="rounded-md px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"

              style={{ backgroundColor: ACTION_BLUE }}

              onClick={() => onSave({ criteria: rows })}

            >

              {saving ? 'Saving…' : 'Save Criteria'}

            </button>

          </div>

        </div>

        <div className="grid md:grid-cols-2">

          <div className="border-r border-neutral-200 p-4">

            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-neutral-500">Grading components</p>

            {rows.length === 0 ? (

              <p className="mb-3 text-sm text-neutral-500">No components yet. Add one to get started.</p>

            ) : null}

            <div className="space-y-2">

              {rows.map((row, idx) => (

                <div key={row.id ?? `row-${idx}`} className="flex items-center gap-2 rounded-md border border-neutral-200 px-2 py-2">

                  <input type="color" className="h-6 w-8 cursor-pointer rounded border-0" value={row.color} onChange={(e) => patchRow(idx, 'color', e.target.value)} />

                  <input

                    className="min-w-0 flex-1 border-0 bg-transparent text-sm outline-none"

                    value={row.name}

                    onChange={(e) => patchRow(idx, 'name', e.target.value)}

                  />

                  <input

                    type="number"

                    min={0}

                    max={100}

                    className="w-14 rounded border border-neutral-200 px-1 py-0.5 text-right text-sm"

                    value={row.percentage}

                    onChange={(e) => patchRow(idx, 'percentage', Number(e.target.value))}

                  />

                  <span className="text-xs text-neutral-500">%</span>

                  <button

                    type="button"

                    className="rounded border border-neutral-300 px-1.5 py-0.5 text-xs text-neutral-600"

                    onClick={() => removeComponent(idx)}

                  >

                    Delete

                  </button>

                </div>

              ))}

            </div>

            {rows.length > 0 ? (

              <div className="mt-3 space-y-2 rounded-md border border-neutral-200 p-2">

                {rows.map((row, idx) => (

                  <div key={`maps-${row.id ?? idx}`} className="flex flex-wrap items-center gap-3 text-xs">

                    <span className="min-w-28 font-medium text-neutral-700">{row.name}</span>

                    <label className="inline-flex items-center gap-1">

                      <input

                        type="checkbox"

                        checked={row.maps_to_assignment}

                        onChange={(e) => patchRow(idx, 'maps_to_assignment', e.target.checked)}

                      />

                      Assignment

                    </label>

                    <label className="inline-flex items-center gap-1">

                      <input

                        type="checkbox"

                        checked={row.maps_to_activity}

                        onChange={(e) => patchRow(idx, 'maps_to_activity', e.target.checked)}

                      />

                      Activity

                    </label>

                    <label className="inline-flex items-center gap-1">

                      <input

                        type="checkbox"

                        checked={row.is_quiz}

                        onChange={(e) => patchRow(idx, 'is_quiz', e.target.checked)}

                      />

                      Quiz

                    </label>

                  </div>

                ))}

              </div>

            ) : null}

            <button

              type="button"

              className="mt-3 rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700"

              onClick={addComponent}

            >

              Add component

            </button>

            <div className={`mt-3 rounded-md px-3 py-2 text-sm font-medium ${valid ? 'bg-green-50 text-green-800' : total > 100 ? 'bg-red-50 text-red-800' : 'bg-amber-50 text-amber-900'}`}>

              Total: {total}% {valid ? '✓' : rows.length === 0 ? '(add at least one component)' : '(must equal 100%)'}

            </div>

          </div>

          <div className="p-4">

            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-neutral-500">Live preview</p>

            <div className="flex flex-col items-center gap-4">

              <div className="relative h-[200px] w-[200px]">

                <canvas ref={canvasRef} width={200} height={200} className="rounded-full" />

                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">

                  <span className="text-2xl font-semibold">{total}%</span>

                  <span className="text-xs text-neutral-500">allocated</span>

                </div>

              </div>

              <div className="w-full space-y-1">

                {rows.map((row, idx) => (

                  <div key={`preview-${row.id ?? idx}`} className="flex items-center justify-between text-sm">

                    <span className="flex items-center gap-2">

                      <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: row.color }} />

                      {row.name}

                    </span>

                    <span className="font-medium text-neutral-600">{row.percentage}%</span>

                  </div>

                ))}

              </div>

            </div>

          </div>

        </div>

      </div>

    </div>

  )

}



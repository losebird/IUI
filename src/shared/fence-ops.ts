/**
 * Weak-model fence operations counters — plugin-feasible observability.
 * Not constrained decoding; just honest ops telemetry for Settings / health.
 * Config-driven event names; no hard-coded intent lists at call sites.
 */

export type FenceOpKind =
  | 'prime'
  | 'first_token_violation'
  | 'tool_before_fence'
  | 'mid_nudge'
  | 'json_masquerade'
  | 'format_steer'
  | 'render_steer'
  | 'delivery_steer'
  | 'next_turn_reminder'
  | 'validated_ok'
  | 'gateway_repair'
  | 'gateway_reject'
  | 'design_lint'

export type FenceOpsSnapshot = {
  readonly startedAt: string
  readonly total: number
  readonly byKind: Readonly<Record<string, number>>
  readonly lastKind: string | null
  readonly lastAt: string | null
  readonly lastDetail: string | null
}

const byKind: Record<string, number> = Object.create(null) as Record<string, number>
let total = 0
let lastKind: string | null = null
let lastAt: string | null = null
let lastDetail: string | null = null
const startedAt = new Date().toISOString()

export function recordFenceOp(kind: FenceOpKind, detail?: string): void {
  byKind[kind] = (byKind[kind] ?? 0) + 1
  total += 1
  lastKind = kind
  lastAt = new Date().toISOString()
  lastDetail = detail !== undefined && detail.trim() !== '' ? detail.trim().slice(0, 160) : null
}

export function getFenceOpsSnapshot(): FenceOpsSnapshot {
  return {
    startedAt,
    total,
    byKind: { ...byKind },
    lastKind,
    lastAt,
    lastDetail,
  }
}

/** Test helper. */
export function resetFenceOpsForTests(): void {
  for (const k of Object.keys(byKind)) delete byKind[k]
  total = 0
  lastKind = null
  lastAt = null
  lastDetail = null
}

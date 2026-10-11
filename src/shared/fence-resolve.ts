/**
 * Shared fence-body resolve for catalog JSON (legacy ```iui) and tooling.
 * Sandbox product path uses parseHtmlSandboxFence — not this module.
 */
import { processGenuiSpec, type GenuiProcessResult } from '../client/guard.ts'
import type { GenuiSpec } from '../client/spec.ts'
import { repairFenceJson } from './fence-repair.ts'

export interface FenceResolveOptions {
  readonly settled: boolean
  readonly mode?: 'lenient' | 'strict'
  readonly sessionId?: string
  readonly stableSeed?: string
}

export interface FenceResolution {
  readonly value: unknown | null
  readonly processed: GenuiProcessResult | null
  readonly spec: GenuiSpec | null
  readonly ir: null
  readonly instanceId: null
  readonly frames: readonly []
}

function parseJsonValue(raw: string): unknown | null {
  const trimmed = raw.trim()
  if (trimmed.length === 0) return null
  try {
    return JSON.parse(trimmed) as unknown
  } catch {
    if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return null
    const repaired = repairFenceJson(trimmed)
    if (repaired === null) return null
    try {
      return JSON.parse(repaired.text) as unknown
    } catch {
      return null
    }
  }
}

function resolutionFromValue(value: unknown | null): FenceResolution {
  if (value === null) {
    return { value: null, processed: null, spec: null, ir: null, instanceId: null, frames: [] }
  }
  const processed = processGenuiSpec(value)
  const spec = processed.spec ?? null
  return { value, processed, spec, ir: null, instanceId: null, frames: [] }
}

export function resolveFence(raw: string, _options: FenceResolveOptions): FenceResolution {
  return resolutionFromValue(parseJsonValue(raw))
}

export function resolveFenceSpec(raw: string, options: FenceResolveOptions): GenuiSpec | null {
  return resolveFence(raw, options).spec
}

export function resolveFenceValue(
  value: unknown,
  _options: Pick<FenceResolveOptions, 'mode' | 'sessionId' | 'stableSeed'> = {},
): FenceResolution {
  return resolutionFromValue(value)
}

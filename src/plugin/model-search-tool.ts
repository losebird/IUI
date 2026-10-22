/**
 * R5-3 find_3d_models — CC0 model search for the host 3D stage (Poly Haven + Khronos samples).
 * Returns stage-ready ids (`polyhaven:<id>` / `khronos:<Name>`), size, licence and source page.
 * R5-3b: models shipped with the plugin are searched first and marked `bundled=yes` (they load offline).
 */
import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import type { JsonValue } from '@deepseek-ai/dsh-util-values'
import type { GenericCallView, GenericResultView, ToolDefinition } from '@deepseek-ai/dsh-tools'
import { preferBundled, rankHits, searchBundled, searchKhronos, searchPolyhaven, type ModelHit } from '../shared/model-catalog.ts'
import { isKnownUnreachable } from '../shared/network-probe.ts'

const PARAMETERS: Record<string, unknown> = {
  type: 'object',
  properties: {
    query: { type: 'string', minLength: 1, maxLength: 120, description: 'What the object is, in English keywords (e.g. "armchair", "potted plant", "toy car"). Chinese is accepted.' },
    max: { type: 'integer', minimum: 1, maximum: 6, description: 'How many results (default 4).' },
  },
  required: ['query'],
  additionalProperties: false,
}

function argsOf(args: unknown): { query: string; max: number } | null {
  if (!args || typeof args !== 'object') return null
  const r = args as Record<string, unknown>
  const q = typeof r.query === 'string' ? r.query.trim() : typeof r.q === 'string' ? r.q.trim() : ''
  if (!q) return null
  const max = Math.min(6, Math.max(1, Math.round(Number(r.max) || 4)))
  return { query: q.slice(0, 120), max }
}

function formatHit(h: ModelHit, i: number): string {
  return [
    `--- ${i + 1} ---`,
    `model=${h.model}`,
    `name=${JSON.stringify(h.name)}`,
    `source=${h.source}`,
    `license=${h.license}`,
    `author=${JSON.stringify(h.author)}`,
    ...(h.bundled ? ['bundled=yes'] : []),
    ...(h.sizeMb !== undefined ? [`size_mb=${h.sizeMb}`] : []),
    ...(h.dimensionsM ? [`dimensions_m=${h.dimensionsM.join('x')}`] : []),
    ...(h.polycount !== undefined ? [`polycount=${h.polycount}`] : []),
    `tags=${h.tags.slice(0, 6).join(',')}`,
    `page=${h.page}`,
  ].join('\n')
}

async function fetchJson(url: string, signal?: AbortSignal): Promise<unknown> {
  const res = await fetch(url, { ...(signal ? { signal } : {}), headers: { accept: 'application/json', 'user-agent': 'iui-dsh-plugin (find_3d_models)' } })
  if (!res.ok) throw new Error(`${new URL(url).host} ${res.status}`)
  return res.json()
}

export function createFind3dModelsTool(deps: { fetchJson?: typeof fetchJson } = {}): ToolDefinition {
  const get = deps.fetchJson ?? fetchJson
  return {
    name: 'find_3d_models',
    description:
      'Search free CC0 3D models (Poly Haven + Khronos glTF samples) for the host 3D stage. '
      + 'Pass what the object is in English keywords. Returns stage ids like polyhaven:ArmChair_01 / khronos:ToyCar with size and licence. '
      + 'Then emit ONE ```iui-html fence with <div data-iui-3d=\'{"model":"<id>"}\'></div> (the host does lights, shadow, framing, orbit). '
      + 'Prefer bundled=yes (ships with the plugin, loads offline), then the smallest good match. No match → use a primitive "shape" or ask the user for a GLB URL; never invent model ids or URLs.',
    parameters: PARAMETERS,
    output: {
      schema: { type: 'string', description: 'Model search result for the model.' },
      render(_args: unknown, value: JsonValue): ContentBlock[] {
        return [{ type: 'text', text: String(value) }]
      },
    },
    async execute(args: unknown): Promise<JsonValue> {
      const a = argsOf(args)
      if (!a) return ['[iui-3d-models]', 'status=invalid', 'error=need_query', 'hint=Pass query: "armchair" (English keywords)'].join('\n')
      const hits: ModelHit[] = []
      const notes: string[] = []
      hits.push(...searchBundled(a.query), ...searchKhronos(a.query))
      if (isKnownUnreachable(['models'])) notes.push('note=Poly Haven is unreachable from this network; only bundled models and Khronos samples were searched (bundled=yes loads offline).')
      else {
        try {
          const signal = typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(6000) : undefined
          hits.push(...await searchPolyhaven(a.query, get, { max: a.max + 2, ...(signal ? { signal } : {}) }))
        } catch (err) {
          notes.push(`note=Poly Haven search failed (${err instanceof Error ? err.message : String(err)}); only bundled models and Khronos samples were searched.`)
        }
      }
      const top = rankHits(preferBundled(hits), a.max)
      if (!top.length) {
        return [
          '[iui-3d-models]',
          'status=empty',
          `query=${JSON.stringify(a.query)}`,
          ...notes,
          'hint=No CC0 model matched. Use the stage with a primitive: data-iui-3d=\'{"shape":"torusKnot|sphere|box|icosahedron|torus|cone|cylinder|capsule"}\', or ask the user for a GLB URL. Do not invent ids.',
        ].join('\n')
      }
      return [
        '[iui-3d-models]',
        'status=ok',
        `query=${JSON.stringify(a.query)}`,
        `results=${top.length}`,
        ...notes,
        'usage=<div data-iui-3d=\'{"model":"<model>"}\'></div>; optional "hotspots":[{"id","label","at":[x,y,z] in -1..1 of the model box,"text"}], "cursor":"look", "ground":"plinth", children with data-iui-3d-layer="back|front" for big type. CC0: the host shows the source line.',
        '',
        ...top.map(formatHit),
      ].join('\n')
    },
    presentCall(args: unknown): GenericCallView | undefined {
      const a = argsOf(args)
      return { card: 'generic', title: a ? `3D models · ${a.query}` : '3D models', kind: 'read' }
    },
    presentResult(args: unknown): GenericResultView | undefined {
      const a = argsOf(args)
      return { card: 'generic', title: a ? `3D models · ${a.query}` : '3D models' }
    },
  }
}

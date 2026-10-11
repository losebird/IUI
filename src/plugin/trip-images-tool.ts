/**
 * get_trip_stop_images — Wikimedia photo tool for itineraries.
 * Fetches Wikimedia Commons photos + attribution; falls back to IUI well-known table.
 */
import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import type { JsonValue } from '@deepseek-ai/dsh-util-values'
import type { GenericCallView, GenericResultView, ToolDefinition } from '@deepseek-ai/dsh-tools'
import { resolveTripStopImages, type TripStopImage } from '../shared/trip-images.ts'

const PARAMETERS: Record<string, unknown> = {
  type: 'object',
  properties: {
    wikipedia_titles: {
      type: 'array',
      description:
        '1–8 precise English Wikipedia article titles (e.g. "Shanghai", "Paris", "Nice"). '
        + 'Chinese place names are also accepted and mapped via IUI well-known table / Wikipedia.',
      items: { type: 'string', minLength: 1, maxLength: 160 },
      minItems: 1,
      maxItems: 8,
    },
  },
  required: ['wikipedia_titles'],
  additionalProperties: false,
}

function titlesOf(args: unknown): string[] | null {
  if (typeof args !== 'object' || args === null) return null
  const record = args as Record<string, unknown>
  const raw = record.wikipedia_titles ?? record.titles ?? record.places
  if (!Array.isArray(raw)) return null
  const out: string[] = []
  for (const item of raw) {
    if (typeof item === 'string' && item.trim()) out.push(item.trim())
  }
  return out.length > 0 ? out : null
}

function formatStop(stop: TripStopImage): string {
  if (stop.status === 'available') {
    return [
      `place=${JSON.stringify(stop.place)}`,
      `status=available`,
      `image_url=${stop.image_url}`,
      `artist=${JSON.stringify(stop.artist ?? '')}`,
      `license=${JSON.stringify(stop.license ?? '')}`,
      `credit_url=${stop.credit_url ?? ''}`,
      ...(stop.article_url ? [`article_url=${stop.article_url}`] : []),
      `note=${JSON.stringify(stop.note ?? '')}`,
      `source=${stop.source ?? 'wikipedia'}`,
    ].join('\n')
  }
  return [
    `place=${JSON.stringify(stop.place)}`,
    `status=unavailable`,
    `reason=${JSON.stringify(stop.reason ?? 'unavailable')}`,
  ].join('\n')
}

export function createGetTripStopImagesTool(): ToolDefinition {
  return {
    name: 'get_trip_stop_images',
    description:
      'Fetch destination photos with creator, license and source links for itinerary stop cards. '
      + 'Pass 1–8 precise English Wikipedia article titles (for example Shanghai, Paris, Nice / Half Moon Bay, California). '
      + 'Render available images with visible creator/license credits linked to credit_url. '
      + 'Unavailable results must be acknowledged; do not invent photos. '
      + 'Host also auto-fills well-known places if you omit the tool — still prefer calling this for uncommon destinations. '
      + 'This retrieves images only, not driving directions or travel times. '
      + 'After photos resolve, emit ONE closed ```iui-html fence with .iui-stop-card photo bands using image_url.',
    parameters: PARAMETERS,
    output: {
      schema: { type: 'string', description: 'Photo resolution result for the model.' },
      render(_args: unknown, value: JsonValue): ContentBlock[] {
        return [{ type: 'text', text: String(value) }]
      },
    },
    async execute(args: unknown): Promise<JsonValue> {
      const titles = titlesOf(args)
      if (titles === null) {
        return [
          '[iui-trip-images]',
          'status=invalid',
          'error=need_wikipedia_titles',
          'hint=Pass wikipedia_titles: string[1..8]',
        ].join('\n')
      }
      try {
        // P1-TOOL-TIMEOUT: hard 8s budget so hung Wikipedia/Commons cannot stall the turn.
        const opts: { signal?: AbortSignal; timeoutMs: number } = { timeoutMs: 8000 }
        if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
          opts.signal = AbortSignal.timeout(8000)
        }
        const result = await resolveTripStopImages(titles, opts)
        const available = result.stops.filter((s) => s.status === 'available').length
        return [
          '[iui-trip-images]',
          'status=ok',
          `source=${result.source}`,
          `available=${available}`,
          `total=${result.stops.length}`,
          'usage=Put each image_url into .iui-stop-card .photo img; show artist/license via .iui-photo-credit linking credit_url.',
          '',
          ...result.stops.map((s, i) => `--- stop ${i + 1} ---\n${formatStop(s)}`),
        ].join('\n')
      } catch (err) {
        return [
          '[iui-trip-images]',
          'status=error',
          `error=${err instanceof Error ? err.message : String(err)}`,
        ].join('\n')
      }
    },
    presentCall(args: unknown): GenericCallView | undefined {
      const titles = titlesOf(args)
      return {
        card: 'generic',
        title: titles ? `Trip photos (${titles.length})` : 'Trip photos',
        kind: 'read',
      }
    },
    presentResult(args: unknown): GenericResultView | undefined {
      const titles = titlesOf(args)
      return {
        card: 'generic',
        title: titles ? `Trip photos (${titles.length})` : 'Trip photos',
      }
    },
  }
}

/** Alias for non-itinerary hotel/product/place covers — same resolver, different name. */
export function createGetPlaceImagesTool(): ToolDefinition {
  const base = createGetTripStopImagesTool()
  return {
    ...base,
    name: 'get_place_images',
    description:
      'Fetch place / hotel / product cover photos with creator, license and source links. '
      + 'Same resolver as get_trip_stop_images — pass 1–8 Wikipedia titles or well-known place names. '
      + 'Use for .iui-hotel-card / .iui-product-card / .iui-place-card / .iui-cover-card photo bands. '
      + 'After photos resolve, emit ONE closed ```iui-html fence with Wikimedia image_url values.',
    presentCall(args: unknown): GenericCallView | undefined {
      const titles = titlesOf(args)
      return {
        card: 'generic',
        title: titles ? `Place photos (${titles.length})` : 'Place photos',
        kind: 'read',
      }
    },
    presentResult(args: unknown): GenericResultView | undefined {
      const titles = titlesOf(args)
      return {
        card: 'generic',
        title: titles ? `Place photos (${titles.length})` : 'Place photos',
      }
    },
  }
}


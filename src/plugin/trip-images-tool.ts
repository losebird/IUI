/**
 * get_trip_stop_images — Wikimedia photo tool for itineraries.
 * Fetches Wikimedia Commons photos + attribution; falls back to IUI well-known table.
 */
import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import type { JsonValue } from '@deepseek-ai/dsh-util-values'
import type { GenericCallView, GenericResultView, ToolDefinition } from '@deepseek-ai/dsh-tools'
import { resolveTripStopImages, type TripStopImage } from '../shared/trip-images.ts'
import type { GeoPoint } from '../shared/photo-match.ts'
import { isKnownUnreachable } from '../shared/network-probe.ts'

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
    coordinates: {
      type: 'array',
      description:
        'Optional stop coordinates aligned with wikipedia_titles ({lat, lng} each; {} when unknown). '
        + 'Enables the 300 m location check and nearby Commons photos for small venues (cafés, shops, streets).',
      items: {
        type: 'object',
        properties: { lat: { type: 'number' }, lng: { type: 'number' } },
      },
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

function coordinatesOf(args: unknown): Array<GeoPoint | null> | undefined {
  if (typeof args !== 'object' || args === null) return undefined
  const raw = (args as Record<string, unknown>).coordinates
  if (!Array.isArray(raw)) return undefined
  return raw.slice(0, 8).map((item) => {
    if (!item || typeof item !== 'object') return null
    const r = item as Record<string, unknown>
    const lat = Number(r.lat)
    const lon = Number(r.lng ?? r.lon)
    return Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180
      ? { lat, lon }
      : null
  })
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
      `confidence=${stop.confidence ?? 'named'}`,
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
      + 'Photos are returned only when they demonstrably show the place (Commons file/description/categories name it, or within 300 m of the given coordinates). '
      + 'Unavailable = no confident photo: leave the .photo band empty (host draws a designed placeholder); never substitute a different place\'s photo or invent one. '
      + 'Pass coordinates for small venues. ' 
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
      // C10: a fresh connectivity probe saw Wikipedia + Wikimedia both fail →
      // answer at once instead of burning the 8 s budget.
      if (isKnownUnreachable(['wikipedia', 'wikimedia'])) {
        return [
          '[iui-trip-images]',
          'status=unavailable',
          'reason=wikimedia_unreachable',
          'hint=Wikipedia/Wikimedia are unreachable from this network. Keep empty .photo bands (host placeholder) and add data-lat/data-lng on each .iui-stop-card; do not call this tool again this turn.',
        ].join('\n')
      }
      try {
        // P1-TOOL-TIMEOUT: hard 8s budget so hung Wikipedia/Commons cannot stall the turn.
        const opts: { signal?: AbortSignal; timeoutMs: number; coordinates?: Array<GeoPoint | null> } = { timeoutMs: 8000 }
        const coords = coordinatesOf(args)
        if (coords) opts.coordinates = coords
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
          'usage=Put each image_url into .iui-stop-card .photo img; add <div class="iui-photo-credit"><a href=credit_url title="artist · license">ⓘ 图片来自 Wikimedia</a></div> (never a file name). Unavailable stops: keep an empty .photo band (host placeholder) and add data-lat/data-lng on the card.',
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


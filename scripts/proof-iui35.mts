import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { injectAppDataIntoSpec, parseToolResultAppData, flattenAppDataToBindings } from '../src/shared/appdata-runtime.ts'
import { parsePartialGenuiSpec, isPartialFenceBody } from '../src/client/parse-partial.ts'

const out = '/workspace/uploads/iui35-hd-shots'
await mkdir(out, { recursive: true })

const chunks = [
  '{"items":[{"type":"stat","label":"CPU","value":"34%","ring":34}',
  '{"items":[{"type":"stat","label":"CPU","value":"34%","ring":34},{"type":"stat","label":"内存","value":"62%","ring":62}',
  '{"items":[{"type":"row","items":[{"type":"stat","label":"CPU","value":"34%"},{"type":"stat","lab',
]
const prog = chunks.map((c, i) => {
  const spec = parsePartialGenuiSpec(c)
  return {
    i,
    partial: isPartialFenceBody(c),
    items: spec?.items?.length ?? 0,
    types: (spec?.items ?? []).map((n: { type?: string }) => n.type),
  }
})
await writeFile(resolve(out, 'progressive-parse.json'), JSON.stringify(prog, null, 2))

const typed = parseToolResultAppData(JSON.stringify({
  appData: { cpu: 34, hourly: [{ label: '10', value: 18 }, { label: '12', value: 21 }] },
}))
const injected = injectAppDataIntoSpec({
  items: [
    { type: 'stat', label: 'CPU', value: '$bind:cpu', ring: '$bind:cpu' },
    { type: 'chart', kind: 'line', data: '$bind:hourly' },
  ],
}, { bindings: flattenAppDataToBindings(typed), appData: typed })
await writeFile(resolve(out, 'appdata-inject.json'), JSON.stringify({ typedKeys: Object.keys(typed), injected }, null, 2))
console.log('progressive', JSON.stringify(prog))
console.log('appData keys', Object.keys(typed), 'stat.value=', (injected.items[0] as { value: unknown }).value, 'chart.data len=', Array.isArray((injected.items[1] as { data: unknown }).data) ? ((injected.items[1] as { data: unknown[] }).data.length) : 'n/a')

/**
 * R5-3: CC0 3D model search for the host 3D stage (`find_3d_models` tool).
 *
 * Sources (all CC0 — no attribution required; the stage still shows where a model came from):
 *  - Poly Haven (live index, ~500 models, glTF 1k textures) → `polyhaven:<id>`
 *  - a curated set of Khronos glTF Sample Assets (pinned commit, via jsDelivr / GitHub) → `khronos:<Name>`
 * Pure + fetch-injectable so it is testable without the network.
 */

export interface ModelHit {
  readonly model: string
  readonly name: string
  readonly source: 'Poly Haven' | 'Khronos glTF Sample Assets'
  readonly license: 'CC0-1.0'
  readonly author: string
  readonly page: string
  readonly tags: readonly string[]
  readonly sizeMb?: number
  readonly dimensionsM?: readonly [number, number, number]
  readonly polycount?: number
  readonly animated?: boolean
  /** R5-3b: shipped with the plugin (loads offline / from the plugin's own asset route). */
  readonly bundled?: boolean
  readonly score: number
}

interface KhronosEntry { name: string; label: string; author: string; mb: number; tags: string[] }

/** CC0-1.0 ("Everything") showcase models from KhronosGroup/glTF-Sample-Assets, sizes of the .glb. */
export const KHRONOS_CC0: readonly KhronosEntry[] = [
  { name: 'GlassVaseFlowers', label: 'Glass vase with flowers', author: 'Eric Chadwick, Rico Cilliers', mb: 1.8, tags: ['vase', 'flower', 'flowers', 'glass', 'plant', 'decor', '花瓶', '花', '玻璃'] },
  { name: 'SheenChair', label: 'Velvet chair', author: 'Eric Chadwick', mb: 4.1, tags: ['chair', 'seat', 'furniture', 'sofa', 'velvet', '椅子', '沙发', '家具'] },
  { name: 'DiffuseTransmissionTeacup', label: 'Teacup', author: 'Poly Haven, Eric Chadwick', mb: 4.8, tags: ['teacup', 'cup', 'tea', 'mug', 'ceramic', 'kitchen', '茶杯', '杯子', '茶'] },
  { name: 'ToyCar', label: 'Toy car', author: 'Guido Odendahl, Eric Chadwick', mb: 5.4, tags: ['car', 'toy', 'vehicle', 'auto', '汽车', '玩具', '车'] },
  { name: 'Avocado', label: 'Avocado', author: 'Microsoft', mb: 8.1, tags: ['avocado', 'fruit', 'food', 'vegetable', '牛油果', '水果', '食物'] },
  { name: 'WaterBottle', label: 'Water bottle', author: 'Microsoft', mb: 9.0, tags: ['bottle', 'water', 'flask', 'drink', 'product', '水瓶', '瓶子', '水杯'] },
  { name: 'ScatteringSkull', label: 'Human skull', author: 'Vladimir Petkovic', mb: 9.0, tags: ['skull', 'anatomy', 'bone', 'human', 'head', '头骨', '骷髅', '解剖'] },
  { name: 'Lantern', label: 'Street lantern', author: 'sbtron, Frank Galligan', mb: 9.6, tags: ['lantern', 'lamp', 'street', 'light', 'streetlight', '路灯', '灯笼', '灯'] },
  { name: 'BoomBox', label: 'Boombox radio', author: 'Microsoft', mb: 10.6, tags: ['boombox', 'radio', 'speaker', 'music', 'audio', 'retro', '收音机', '音箱', '音响'] },
  { name: 'BarramundiFish', label: 'Barramundi fish', author: 'Microsoft', mb: 12.5, tags: ['fish', 'animal', 'sea', 'ocean', '鱼', '动物', '海洋'] },
  { name: 'Corset', label: 'Corset on a mannequin', author: 'Microsoft', mb: 13.5, tags: ['corset', 'mannequin', 'fashion', 'clothing', 'dress', '服装', '人台', '时装'] },
]

/** Common Chinese object words → English search terms (the model is asked for English, this is a safety net). */
const ZH_EN: Readonly<Record<string, string>> = {
  扶手椅: 'armchair', 椅子: 'chair', 椅: 'chair', 凳子: 'stool', 沙发: 'sofa', 桌子: 'table', 桌: 'table', 柜子: 'cabinet', 柜: 'cabinet', 床: 'bed', 架子: 'shelf', 书架: 'shelf',
  灯: 'lamp', 吊灯: 'chandelier', 路灯: 'lantern', 植物: 'plant', 盆栽: 'potted plant', 树: 'tree', 花: 'flower', 草: 'grass', 石头: 'rock', 岩石: 'rock',
  车: 'car', 汽车: 'car', 自行车: 'bicycle', 船: 'boat', 杯子: 'cup', 茶杯: 'teacup', 杯: 'cup', 瓶子: 'bottle', 瓶: 'bottle', 碗: 'bowl', 盘子: 'plate', 锅: 'pot',
  书: 'book', 钟: 'clock', 时钟: 'clock', 相机: 'camera', 电视: 'tv', 收音机: 'radio', 电话: 'phone', 键盘: 'keyboard', 鞋: 'shoe', 帽子: 'hat', 包: 'bag',
  雕像: 'statue', 雕塑: 'sculpture', 头骨: 'skull', 动物: 'animal', 鱼: 'fish', 鸟: 'bird', 食物: 'food', 水果: 'fruit', 面包: 'bread', 蛋糕: 'cake',
  工具: 'tool', 锤子: 'hammer', 斧头: 'axe', 桶: 'barrel', 木桶: 'barrel', 箱子: 'crate', 箱: 'box', 盒子: 'box', 门: 'door', 窗: 'window', 栅栏: 'fence',
  鸭子: 'duck', 鸭: 'duck', 小黄鸭: 'rubber duck', 苹果: 'apple', 仙人掌: 'cactus', 电视机: 'tv', 音箱: 'speaker', 台灯: 'desk lamp',
  花瓶: 'vase', 罐子: 'jar', 蜡烛: 'candle', 镜子: 'mirror', 地毯: 'rug', 枕头: 'pillow', 厨房: 'kitchen', 家具: 'furniture', 武器: 'weapon', 剑: 'sword',
}

const ZH_KEYS = Object.entries(ZH_EN).sort((x, y) => y[0].length - x[0].length)

const STOP = new Set(['a', 'an', 'the', 'of', 'model', 'models', '3d', 'cc0', 'free', 'glb', 'gltf', 'with', 'and', 'for'])

export function queryTerms(query: string): string[] {
  let q = String(query ?? '').toLowerCase()
  const extra: string[] = []
  // Longest keys first so 花瓶 → vase wins over 花 → flower.
  for (const [zh, en] of ZH_KEYS) if (q.includes(zh)) { extra.push(en); q = q.split(zh).join(' ') }
  const words = q.split(/[^a-z0-9\u4e00-\u9fff]+/u).filter((w) => w && !STOP.has(w))
  const out = [...new Set([...extra.flatMap((e) => e.split(' ')), ...words])]
  // crude singular: chairs → chair
  return out.map((w) => (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w)).slice(0, 8)
}

function scoreText(terms: readonly string[], fields: { name: string; tags: readonly string[]; cats?: readonly string[]; desc?: string }): number {
  const name = fields.name.toLowerCase()
  const tags = fields.tags.map((t) => t.toLowerCase())
  const cats = (fields.cats ?? []).map((t) => t.toLowerCase())
  const desc = (fields.desc ?? '').toLowerCase()
  let s = 0
  for (const t of terms) {
    if (!t) continue
    const word = new RegExp(`(^|[^a-z])${t.replace(/[^a-z0-9]/g, '')}`)
    if (/^[a-z0-9]+$/.test(t) ? word.test(name) : name.includes(t)) s += 5
    if (tags.includes(t)) s += 4
    else if (tags.some((x) => x.startsWith(t) || (t.length > 3 && x.includes(t)))) s += 2
    if (cats.includes(t)) s += 3
    if (desc && t.length > 2 && desc.includes(t)) s += 1
  }
  return s
}

export function searchKhronos(query: string): ModelHit[] {
  const terms = queryTerms(query)
  if (!terms.length) return []
  return KHRONOS_CC0.map((k) => ({
    model: `khronos:${k.name}`,
    name: k.label,
    source: 'Khronos glTF Sample Assets' as const,
    license: 'CC0-1.0' as const,
    author: k.author,
    page: `https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/${k.name}`,
    tags: k.tags.filter((t) => /^[a-z]/.test(t)),
    sizeMb: k.mb,
    score: scoreText(terms, { name: k.label + ' ' + k.name, tags: k.tags }),
  })).filter((h) => h.score > 0)
}

interface PolyAsset { name?: string; type?: number; tags?: string[]; categories?: string[]; authors?: Record<string, string>; description?: string; dimensions?: number[]; polycount?: number }

type FetchJson = (url: string, signal?: AbortSignal) => Promise<unknown>

let polyIndex: { at: number; data: Record<string, PolyAsset> } | null = null
export const POLYHAVEN_INDEX_TTL_MS = 6 * 60 * 60 * 1000

export function resetPolyhavenCache(): void { polyIndex = null }

async function polyhavenIndex(fetchJson: FetchJson, signal?: AbortSignal, now = Date.now()): Promise<Record<string, PolyAsset>> {
  if (polyIndex && now - polyIndex.at < POLYHAVEN_INDEX_TTL_MS) return polyIndex.data
  const data = await fetchJson('https://api.polyhaven.com/assets?t=models', signal)
  if (!data || typeof data !== 'object') throw new Error('Poly Haven index: bad response')
  polyIndex = { at: now, data: data as Record<string, PolyAsset> }
  return polyIndex.data
}

/** Sum of the 1k glTF + its includes (MB), or undefined when the files list is unavailable. */
export async function polyhavenSizeMb(id: string, fetchJson: FetchJson, signal?: AbortSignal): Promise<number | undefined> {
  try {
    const files = await fetchJson(`https://api.polyhaven.com/files/${encodeURIComponent(id)}`, signal) as { gltf?: Record<string, { gltf?: { size?: number; include?: Record<string, { size?: number }> } }> }
    const g = files?.gltf?.['1k']?.gltf ?? files?.gltf?.['2k']?.gltf
    if (!g) return undefined
    let bytes = g.size ?? 0
    for (const v of Object.values(g.include ?? {})) bytes += v?.size ?? 0
    return Math.round((bytes / 1048576) * 10) / 10
  } catch {
    return undefined
  }
}

export async function searchPolyhaven(query: string, fetchJson: FetchJson, opts: { signal?: AbortSignal; max?: number; sizes?: boolean } = {}): Promise<ModelHit[]> {
  const terms = queryTerms(query)
  if (!terms.length) return []
  const index = await polyhavenIndex(fetchJson, opts.signal)
  const hits: ModelHit[] = []
  for (const [id, a] of Object.entries(index)) {
    if (!a || (a.type !== undefined && a.type !== 2)) continue
    const score = scoreText(terms, { name: `${a.name ?? id} ${id.replace(/_/g, ' ')}`, tags: a.tags ?? [], cats: a.categories ?? [], desc: a.description ?? '' })
    if (score <= 0) continue
    const dims = Array.isArray(a.dimensions) && a.dimensions.length === 3 ? a.dimensions.map((v) => Math.round(v / 10) / 100) as [number, number, number] : undefined
    hits.push({
      model: `polyhaven:${id}`,
      name: a.name ?? id,
      source: 'Poly Haven',
      license: 'CC0-1.0',
      author: Object.keys(a.authors ?? {}).join(', '),
      page: `https://polyhaven.com/a/${id}`,
      tags: (a.tags ?? []).slice(0, 8),
      ...(dims ? { dimensionsM: dims } : {}),
      ...(typeof a.polycount === 'number' ? { polycount: a.polycount } : {}),
      score,
    })
  }
  hits.sort((x, y) => y.score - x.score || (x.polycount ?? 1e9) - (y.polycount ?? 1e9))
  const top = hits.slice(0, opts.max ?? 6)
  if (opts.sizes !== false) {
    const sizes = await Promise.all(top.map((h) => polyhavenSizeMb(h.model.slice('polyhaven:'.length), fetchJson, opts.signal)))
    return top.map((h, i) => (sizes[i] !== undefined ? { ...h, sizeMb: sizes[i] } : h))
  }
  return top
}

/** Merge both sources: best matches first; on ties prefer the smaller download (chat bubbles). */
export function rankHits(hits: readonly ModelHit[], max: number): ModelHit[] {
  return [...hits].sort((a, b) => b.score - a.score || Number(!!b.bundled) - Number(!!a.bundled) || (a.sizeMb ?? 50) - (b.sizeMb ?? 50)).slice(0, max)
}

// ---------------------------------------------------------------------------
// R5-3b: models shipped inside the plugin package (CC0, optimised with gltf-transform:
// meshopt geometry + WebP textures ≤1024px). They load from the plugin's own asset
// route first (offline / mainland-China safe), then npm mirrors, then the original host.

/** Folder version under lib/assets/vendor (bump when the files change). */
export const BUNDLED_MODELS_DIR = 'iui-models@1'

export interface BundledModel {
  /** The public ref the page uses (`polyhaven:<id>` / `khronos:<Name>`). */
  readonly ref: string
  /** File name under lib/assets/vendor/iui-models@N/. */
  readonly file: string
  readonly name: string
  readonly source: ModelHit['source']
  readonly author: string
  readonly kb: number
  readonly tags: readonly string[]
  readonly dimensionsM?: readonly [number, number, number]
}

export const BUNDLED_MODELS: readonly BundledModel[] = [
  { ref: 'polyhaven:ArmChair_01', file: 'ArmChair_01.glb', name: 'Arm Chair 01', source: 'Poly Haven', author: 'Kirill Sannikov', kb: 415, dimensionsM: [0.85, 0.77, 1.07], tags: ['armchair', 'chair', 'seat', 'furniture', 'sofa', 'couch', 'vintage', 'wood', '扶手椅', '椅子', '沙发', '家具'] },
  { ref: 'polyhaven:Camera_01', file: 'Camera_01.glb', name: 'Camera 01', source: 'Poly Haven', author: 'Rajil Jose Macatangay', kb: 433, dimensionsM: [0.21, 0.26, 0.08], tags: ['camera', 'vintage', 'photography', 'lens', 'retro', 'analog', 'electronics', '相机', '摄影', '复古'] },
  { ref: 'polyhaven:Television_01', file: 'Television_01.glb', name: 'Television 01', source: 'Poly Haven', author: 'Gabriel Radić', kb: 212, dimensionsM: [0.6, 0.47, 0.46], tags: ['tv', 'television', 'vintage', 'retro', 'video', 'screen', 'electronics', '电视', '电视机', '复古'] },
  { ref: 'polyhaven:antique_ceramic_vase_01', file: 'antique_ceramic_vase_01.glb', name: 'Antique Ceramic Vase 01', source: 'Poly Haven', author: 'James Ray Cock', kb: 175, dimensionsM: [0.26, 0.26, 0.44], tags: ['vase', 'ceramic', 'antique', 'pot', 'pottery', 'decor', '花瓶', '陶瓷', '瓷器', '古董'] },
  { ref: 'polyhaven:boombox', file: 'boombox.glb', name: 'Boombox', source: 'Poly Haven', author: 'Thomas Paul Mouilleron', kb: 482, dimensionsM: [0.72, 0.19, 0.47], tags: ['boombox', 'radio', 'speaker', 'stereo', 'music', 'audio', 'retro', '收音机', '音箱', '音响'] },
  { ref: 'polyhaven:desk_lamp_arm_01', file: 'desk_lamp_arm_01.glb', name: 'Desk Lamp Arm 01', source: 'Poly Haven', author: 'Yann Kervran, Kuutti Siitonen', kb: 514, dimensionsM: [0.62, 0.41, 0.88], tags: ['lamp', 'desk', 'light', 'industrial', 'arm', 'lighting', '台灯', '灯', '灯具'] },
  { ref: 'polyhaven:food_apple_01', file: 'food_apple_01.glb', name: 'Food Apple 01', source: 'Poly Haven', author: 'Oliver Harries', kb: 185, dimensionsM: [0.1, 0.1, 0.09], tags: ['apple', 'fruit', 'food', 'red', 'fresh', '苹果', '水果', '食物'] },
  { ref: 'polyhaven:potted_plant_04', file: 'potted_plant_04.glb', name: 'Potted Plant 04', source: 'Poly Haven', author: 'James Ray Cock', kb: 390, dimensionsM: [0.17, 0.19, 0.27], tags: ['plant', 'potted', 'cactus', 'succulent', 'pot', 'decor', '植物', '盆栽', '仙人掌', '多肉'] },
  { ref: 'polyhaven:rubber_duck_toy', file: 'rubber_duck_toy.glb', name: 'Rubber Duck Toy', source: 'Poly Haven', author: 'Plat251', kb: 89, dimensionsM: [0.21, 0.3, 0.29], tags: ['duck', 'rubber duck', 'toy', 'bath', 'cute', 'animal', 'bird', '小黄鸭', '鸭子', '玩具'] },
  { ref: 'khronos:ToyCar', file: 'ToyCar.glb', name: 'Toy car', source: 'Khronos glTF Sample Assets', author: 'Guido Odendahl, Eric Chadwick', kb: 880, tags: ['car', 'toy', 'vehicle', 'auto', '汽车', '玩具', '车'] },
  { ref: 'khronos:WaterBottle', file: 'WaterBottle.glb', name: 'Water bottle', source: 'Khronos glTF Sample Assets', author: 'Microsoft', kb: 90, tags: ['bottle', 'water', 'flask', 'drink', 'product', '水瓶', '瓶子', '水杯'] },
]

const BUNDLED_BY_REF = new Map(BUNDLED_MODELS.map((b) => [b.ref.toLowerCase(), b]))

/** The bundled entry for a ref (case-insensitive), if the plugin ships it. */
export function bundledModel(ref: string): BundledModel | undefined {
  return BUNDLED_BY_REF.get(String(ref ?? '').trim().toLowerCase())
}

/** Search only the models shipped with the plugin (works with no network at all). */
export function searchBundled(query: string): ModelHit[] {
  const terms = queryTerms(query)
  if (!terms.length) return []
  return BUNDLED_MODELS.map((b) => {
    const id = b.ref.slice(b.ref.indexOf(':') + 1)
    return {
      model: b.ref,
      name: b.name,
      source: b.source,
      license: 'CC0-1.0' as const,
      author: b.author,
      page: b.source === 'Poly Haven' ? `https://polyhaven.com/a/${id}` : `https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/${id}`,
      tags: b.tags.filter((t) => /^[a-z]/.test(t)),
      sizeMb: Math.round(b.kb / 102.4) / 10,
      ...(b.dimensionsM ? { dimensionsM: b.dimensionsM } : {}),
      bundled: true,
      score: scoreText(terms, { name: `${b.name} ${id.replace(/_/g, ' ')}`, tags: b.tags }),
    }
  }).filter((h) => h.score > 0)
}

/** Bundled copies replace remote hits of the same ref (smaller, offline-safe) and win ties. */
export function preferBundled(hits: readonly ModelHit[]): ModelHit[] {
  const out = new Map<string, ModelHit>()
  for (const h of hits) {
    const k = h.model.toLowerCase()
    const prev = out.get(k)
    const b = bundledModel(h.model)
    const merged: ModelHit = b && !h.bundled ? { ...h, bundled: true, sizeMb: Math.round(b.kb / 102.4) / 10 } : h
    if (!prev || merged.score > prev.score) out.set(k, merged)
  }
  return [...out.values()]
}

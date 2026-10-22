/**
 * Trip / destination photos via Wikipedia / Wikimedia Commons.
 *
 * Layers:
 * 1. WELL_KNOWN_STOPS — baked Commons URLs (host fill + tool fallback)
 * 2. fetchWikipediaTripImage — Node Wikipedia REST + Commons attribution (tool)
 * 3. enrichItineraryHtml — static HTML rewrite before srcdoc
 * 4. buildTripPhotoFillScript — runtime fill after author JS creates cards
 */
import { AMAP_TILE, GCJ_JS, getNetContext, type NetContext } from './net-context.ts'
import { geoMeters, looksLikeFilename, photoCreditLabel, photoMatchesPlace, PHOTO_GEO_RADIUS_M, PHOTO_MATCH_JS, type GeoPoint } from './photo-match.ts'

export type TripStopImage = {
  status: 'available' | 'unavailable'
  place: string
  image_url?: string
  artist?: string
  license?: string
  credit_url?: string
  article_url?: string
  note?: string
  reason?: string
  source?: 'well-known' | 'wikipedia'
  /** F12: why this photo is trusted (known alias / named in Commons metadata / within 300 m). */
  confidence?: 'known' | 'named' | 'geo' | 'none'
}

export type KnownStop = {
  /** Commons file name (spaces as underscores OK). */
  file: string
  /** Thumb width for Special:FilePath. */
  width?: number
  artist: string
  license: string
  /** Optional English Wikipedia title for credit_url article. */
  wiki?: string
}

/** Commons Special:FilePath URL (redirects to upload.wikimedia.org). */
export function commonsFilePathUrl(file: string, width = 480): string {
  const name = file.replace(/ /g, '_')
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(name)}?width=${width}`
}

export function commonsFilePageUrl(file: string): string {
  const name = file.replace(/ /g, '_')
  return `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(name)}`
}

/**
 * Well-known place aliases → Commons photo.
 * Keys are lowercase; lookup normalizes whitespace and full-width punctuation.
 */
export const WELL_KNOWN_STOPS: Readonly<Record<string, KnownStop>> = {
  // —— California coast ——
  'san francisco': { file: 'GoldenGateBridge-001.jpg', artist: 'Rich Niewiroski Jr.', license: 'CC BY 2.5', wiki: 'San Francisco' },
  '旧金山': { file: 'GoldenGateBridge-001.jpg', artist: 'Rich Niewiroski Jr.', license: 'CC BY 2.5', wiki: 'San Francisco' },
  '金门': { file: 'GoldenGateBridge-001.jpg', artist: 'Rich Niewiroski Jr.', license: 'CC BY 2.5', wiki: 'Golden Gate Bridge' },
  'golden gate': { file: 'GoldenGateBridge-001.jpg', artist: 'Rich Niewiroski Jr.', license: 'CC BY 2.5', wiki: 'Golden Gate Bridge' },
  'monterey': { file: 'Monterey_Bay.jpg', artist: 'Mila Zinkova', license: 'CC BY-SA 3.0', wiki: 'Monterey, California' },
  '蒙特雷': { file: 'Monterey_Bay.jpg', artist: 'Mila Zinkova', license: 'CC BY-SA 3.0', wiki: 'Monterey, California' },
  'big sur': { file: 'Bixby_Creek_Bridge.jpg', artist: 'Claudio Accheri', license: 'CC BY-SA 3.0', wiki: 'Big Sur' },
  '大苏尔': { file: 'Bixby_Creek_Bridge.jpg', artist: 'Claudio Accheri', license: 'CC BY-SA 3.0', wiki: 'Big Sur' },
  'half moon bay': { file: 'Half_Moon_Bay_California.jpg', artist: 'Frank Schulenburg', license: 'CC BY-SA 4.0', wiki: 'Half Moon Bay, California' },

  // —— China ——
  'shanghai': { file: 'The_Bund_Shanghai.jpg', artist: 'Jakub Hałun', license: 'CC BY-SA 4.0', wiki: 'The Bund' },
  '上海': { file: 'The_Bund_Shanghai.jpg', artist: 'Jakub Hałun', license: 'CC BY-SA 4.0', wiki: 'The Bund' },
  '外滩': { file: 'The_Bund_Shanghai.jpg', artist: 'Jakub Hałun', license: 'CC BY-SA 4.0', wiki: 'The Bund' },
  'the bund': { file: 'The_Bund_Shanghai.jpg', artist: 'Jakub Hałun', license: 'CC BY-SA 4.0', wiki: 'The Bund' },
  'yuyuan': { file: 'Yu_Garden.jpg', artist: 'Barnaby', license: 'CC BY-SA 3.0', wiki: 'Yu Garden' },
  '豫园': { file: 'Yu_Garden.jpg', artist: 'Barnaby', license: 'CC BY-SA 3.0', wiki: 'Yu Garden' },
  'oriental pearl': { file: 'Oriental_Pearl_Tower.jpg', artist: 'Alex Needham', license: 'CC BY-SA 3.0', wiki: 'Oriental Pearl Tower' },
  '东方明珠': { file: 'Oriental_Pearl_Tower.jpg', artist: 'Alex Needham', license: 'CC BY-SA 3.0', wiki: 'Oriental Pearl Tower' },
  'lujiazui': { file: 'Lujiazui_from_the_Bund.jpg', artist: 'Notwist', license: 'CC BY-SA 3.0', wiki: 'Lujiazui' },
  '陆家嘴': { file: 'Lujiazui_from_the_Bund.jpg', artist: 'Notwist', license: 'CC BY-SA 3.0', wiki: 'Lujiazui' },
  'nanjing road': { file: 'Nanjing_Road_Shanghai.jpg', artist: 'J. Patrick Fischer', license: 'CC BY-SA 3.0', wiki: 'Nanjing Road' },
  '南京路': { file: 'Nanjing_Road_Shanghai.jpg', artist: 'J. Patrick Fischer', license: 'CC BY-SA 3.0', wiki: 'Nanjing Road' },
  'beijing': { file: 'The_Forbidden_City_-_View_from_Coal_Hill.jpg', artist: 'Charlie fong', license: 'CC BY-SA 4.0', wiki: 'Forbidden City' },
  '北京': { file: 'The_Forbidden_City_-_View_from_Coal_Hill.jpg', artist: 'Charlie fong', license: 'CC BY-SA 4.0', wiki: 'Forbidden City' },
  'forbidden city': { file: 'The_Forbidden_City_-_View_from_Coal_Hill.jpg', artist: 'Charlie fong', license: 'CC BY-SA 4.0', wiki: 'Forbidden City' },
  '故宫': { file: 'The_Forbidden_City_-_View_from_Coal_Hill.jpg', artist: 'Charlie fong', license: 'CC BY-SA 4.0', wiki: 'Forbidden City' },
  'hangzhou': { file: 'West_Lake_-_Hangzhou.jpg', artist: 'Baycrest', license: 'CC BY-SA 2.5', wiki: 'West Lake' },
  '杭州': { file: 'West_Lake_-_Hangzhou.jpg', artist: 'Baycrest', license: 'CC BY-SA 2.5', wiki: 'West Lake' },
  'guangzhou': { file: 'Canton_Tower.jpg', artist: 'Zengame', license: 'CC BY-SA 3.0', wiki: 'Canton Tower' },
  '广州': { file: 'Canton_Tower.jpg', artist: 'Zengame', license: 'CC BY-SA 3.0', wiki: 'Canton Tower' },
  'shenzhen': { file: 'Shenzhen_Bay_Park.jpg', artist: 'Wtzdj', license: 'CC BY-SA 4.0', wiki: 'Shenzhen' },
  '深圳': { file: 'Shenzhen_Bay_Park.jpg', artist: 'Wtzdj', license: 'CC BY-SA 4.0', wiki: 'Shenzhen' },
  'chengdu': { file: 'Chengdu_IFS.jpg', artist: 'Base64bits', license: 'CC BY-SA 4.0', wiki: 'Chengdu' },
  '成都': { file: 'Chengdu_IFS.jpg', artist: 'Base64bits', license: 'CC BY-SA 4.0', wiki: 'Chengdu' },
  'suzhou': { file: 'Jinji_Lake_Suzhou_November_2017_001.jpg', artist: 'Alex Needham', license: 'CC BY-SA 4.0', wiki: 'Suzhou' },
  '苏州': { file: 'Jinji_Lake_Suzhou_November_2017_001.jpg', artist: 'Alex Needham', license: 'CC BY-SA 4.0', wiki: 'Suzhou' },
  'humble administrator': { file: 'Humble_Administrator\'s_Garden_Suzhou_November_2017_002.jpg', artist: 'Zhangzhugang', license: 'CC BY-SA 4.0', wiki: 'Humble Administrator\'s Garden' },
  '拙政园': { file: 'Humble_Administrator\'s_Garden_Suzhou_November_2017_002.jpg', artist: 'Zhangzhugang', license: 'CC BY-SA 4.0', wiki: 'Humble Administrator\'s Garden' },
  '南京': { file: 'Nanjing_Skyline.jpg', artist: 'S5h', license: 'CC BY-SA 4.0', wiki: 'Nanjing' },
  'nanjing': { file: 'Nanjing_Skyline.jpg', artist: 'S5h', license: 'CC BY-SA 4.0', wiki: 'Nanjing' },
  'jinan': { file: 'Jinan_Bahnhofsplatz-20150521-RM-123243.jpg', artist: 'Röntgenogram', license: 'CC BY-SA 4.0', wiki: 'Jinan' },
  '济南': { file: 'Jinan_Bahnhofsplatz-20150521-RM-123243.jpg', artist: 'Röntgenogram', license: 'CC BY-SA 4.0', wiki: 'Jinan' },
  '西安': { file: 'Terracotta_Army-1.jpg', artist: 'Maros M r a z', license: 'CC BY 3.0', wiki: 'Terracotta Army' },
  'xian': { file: 'Terracotta_Army-1.jpg', artist: 'Maros M r a z', license: 'CC BY 3.0', wiki: 'Terracotta Army' },
  'xi\'an': { file: 'Terracotta_Army-1.jpg', artist: 'Maros M r a z', license: 'CC BY 3.0', wiki: 'Terracotta Army' },

  // —— France / Europe ——
  'paris': { file: 'Tour_Eiffel_Wikimedia_Commons.jpg', artist: 'Benh LIEU SONG', license: 'CC BY-SA 3.0', wiki: 'Eiffel Tower' },
  '巴黎': { file: 'Tour_Eiffel_Wikimedia_Commons.jpg', artist: 'Benh LIEU SONG', license: 'CC BY-SA 3.0', wiki: 'Eiffel Tower' },
  'eiffel': { file: 'Tour_Eiffel_Wikimedia_Commons.jpg', artist: 'Benh LIEU SONG', license: 'CC BY-SA 3.0', wiki: 'Eiffel Tower' },
  '埃菲尔': { file: 'Tour_Eiffel_Wikimedia_Commons.jpg', artist: 'Benh LIEU SONG', license: 'CC BY-SA 3.0', wiki: 'Eiffel Tower' },
  'nice': { file: 'Nice_Promenade_des_Anglais.jpg', artist: 'Benh LIEU SONG', license: 'CC BY-SA 3.0', wiki: 'Promenade des Anglais' },
  '尼斯': { file: 'Nice_Promenade_des_Anglais.jpg', artist: 'Benh LIEU SONG', license: 'CC BY-SA 3.0', wiki: 'Promenade des Anglais' },
  'lyon': { file: 'Lyon_France.jpg', artist: 'Vincent.pcf', license: 'CC BY-SA 3.0', wiki: 'Lyon' },
  '里昂': { file: 'Lyon_France.jpg', artist: 'Vincent.pcf', license: 'CC BY-SA 3.0', wiki: 'Lyon' },
  'marseille': { file: 'Marseille_Vieux-Port.jpg', artist: 'Velvet', license: 'CC BY-SA 3.0', wiki: 'Marseille' },
  '马赛': { file: 'Marseille_Vieux-Port.jpg', artist: 'Velvet', license: 'CC BY-SA 3.0', wiki: 'Marseille' },
  'france': { file: 'Tour_Eiffel_Wikimedia_Commons.jpg', artist: 'Benh LIEU SONG', license: 'CC BY-SA 3.0', wiki: 'France' },
  '法国': { file: 'Tour_Eiffel_Wikimedia_Commons.jpg', artist: 'Benh LIEU SONG', license: 'CC BY-SA 3.0', wiki: 'France' },
  'london': { file: 'Tower_Bridge_London_Feb_2006.jpg', artist: 'Diliff', license: 'CC BY-SA 2.5', wiki: 'Tower Bridge' },
  '伦敦': { file: 'Tower_Bridge_London_Feb_2006.jpg', artist: 'Diliff', license: 'CC BY-SA 2.5', wiki: 'Tower Bridge' },
  'rome': { file: 'Colosseum_in_Rome,_Italy_-_April_2007.jpg', artist: 'Diliff', license: 'CC BY-SA 2.5', wiki: 'Colosseum' },
  '罗马': { file: 'Colosseum_in_Rome,_Italy_-_April_2007.jpg', artist: 'Diliff', license: 'CC BY-SA 2.5', wiki: 'Colosseum' },
  'barcelona': { file: 'Sagrada_Familia_01.jpg', artist: 'Bernard Gagnon', license: 'CC BY-SA 3.0', wiki: 'Sagrada Família' },
  '巴塞罗那': { file: 'Sagrada_Familia_01.jpg', artist: 'Bernard Gagnon', license: 'CC BY-SA 3.0', wiki: 'Sagrada Família' },

  // —— Japan ——
  'tokyo': { file: 'Tokyo_Tower_and_around_Skyscrapers.jpg', artist: 'Kakidai', license: 'CC BY-SA 4.0', wiki: 'Tokyo Tower' },
  '东京': { file: 'Tokyo_Tower_and_around_Skyscrapers.jpg', artist: 'Kakidai', license: 'CC BY-SA 4.0', wiki: 'Tokyo Tower' },
  '東京': { file: 'Tokyo_Tower_and_around_Skyscrapers.jpg', artist: 'Kakidai', license: 'CC BY-SA 4.0', wiki: 'Tokyo Tower' },
  'tokyo tower': { file: 'Tokyo_Tower_and_around_Skyscrapers.jpg', artist: 'Kakidai', license: 'CC BY-SA 4.0', wiki: 'Tokyo Tower' },
  '东京塔': { file: 'Tokyo_Tower_and_around_Skyscrapers.jpg', artist: 'Kakidai', license: 'CC BY-SA 4.0', wiki: 'Tokyo Tower' },
  'asakusa': { file: 'Kaminarimon.jpg', artist: 'Kakidai', license: 'CC BY-SA 4.0', wiki: 'Sensō-ji' },
  'senso-ji': { file: 'Kaminarimon.jpg', artist: 'Kakidai', license: 'CC BY-SA 4.0', wiki: 'Sensō-ji' },
  'sensoji': { file: 'Kaminarimon.jpg', artist: 'Kakidai', license: 'CC BY-SA 4.0', wiki: 'Sensō-ji' },
  '浅草寺': { file: 'Kaminarimon.jpg', artist: 'Kakidai', license: 'CC BY-SA 4.0', wiki: 'Sensō-ji' },
  '浅草': { file: 'Kaminarimon.jpg', artist: 'Kakidai', license: 'CC BY-SA 4.0', wiki: 'Asakusa' },
  'meiji shrine': { file: 'Meiji_Shrine.jpg', artist: 'Morio', license: 'CC BY-SA 3.0', wiki: 'Meiji Shrine' },
  'meiji jingu': { file: 'Meiji_Shrine.jpg', artist: 'Morio', license: 'CC BY-SA 3.0', wiki: 'Meiji Shrine' },
  '明治神宫': { file: 'Meiji_Shrine.jpg', artist: 'Morio', license: 'CC BY-SA 3.0', wiki: 'Meiji Shrine' },
  'kyoto': { file: 'Kiyomizu-dera_in_Kyoto-r.jpg', artist: '663highland', license: 'CC BY 2.5', wiki: 'Kiyomizu-dera' },
  '京都': { file: 'Kiyomizu-dera_in_Kyoto-r.jpg', artist: '663highland', license: 'CC BY 2.5', wiki: 'Kiyomizu-dera' },
  'osaka': { file: 'Osaka_Castle_02bs3200.jpg', artist: '664highland', license: 'CC BY 2.5', wiki: 'Osaka Castle' },
  '大阪': { file: 'Osaka_Castle_02bs3200.jpg', artist: '664highland', license: 'CC BY 2.5', wiki: 'Osaka Castle' },
  'japan': { file: 'Tokyo_Tower_and_around_Skyscrapers.jpg', artist: 'Kakidai', license: 'CC BY-SA 4.0', wiki: 'Japan' },
  '日本': { file: 'Tokyo_Tower_and_around_Skyscrapers.jpg', artist: 'Kakidai', license: 'CC BY-SA 4.0', wiki: 'Japan' },

  // —— US / other ——
  'new york': { file: 'Statue_of_Liberty_7.jpg', artist: 'Daniel Schwen', license: 'CC BY-SA 2.5', wiki: 'Statue of Liberty' },
  '纽约': { file: 'Statue_of_Liberty_7.jpg', artist: 'Daniel Schwen', license: 'CC BY-SA 2.5', wiki: 'Statue of Liberty' },
  'nyc': { file: 'Statue_of_Liberty_7.jpg', artist: 'Daniel Schwen', license: 'CC BY-SA 2.5', wiki: 'Statue of Liberty' },
  'los angeles': { file: 'Hollywood_Sign.jpg', artist: 'Thomas Wolf', license: 'CC BY-SA 3.0', wiki: 'Hollywood Sign' },
  '洛杉矶': { file: 'Hollywood_Sign.jpg', artist: 'Thomas Wolf', license: 'CC BY-SA 3.0', wiki: 'Hollywood Sign' },
  'seattle': { file: 'Space_Needle_2011-07-04.jpg', artist: 'Daniel Schwen', license: 'CC BY-SA 3.0', wiki: 'Space Needle' },
  '西雅图': { file: 'Space_Needle_2011-07-04.jpg', artist: 'Daniel Schwen', license: 'CC BY-SA 3.0', wiki: 'Space Needle' },
  'sydney': { file: 'Sydney_Opera_House_-_Dec_2008.jpg', artist: 'Jjron', license: 'CC BY-SA 3.0', wiki: 'Sydney Opera House' },
  '悉尼': { file: 'Sydney_Opera_House_-_Dec_2008.jpg', artist: 'Jjron', license: 'CC BY-SA 3.0', wiki: 'Sydney Opera House' },
  'singapore': { file: 'Merlion_Singapore.jpg', artist: 'Someformofhuman', license: 'CC BY-SA 4.0', wiki: 'Merlion' },
  '新加坡': { file: 'Merlion_Singapore.jpg', artist: 'Someformofhuman', license: 'CC BY-SA 4.0', wiki: 'Merlion' },
  'hong kong': { file: 'Hong_Kong_Skyline_Restitch_-_Dec_2007.jpg', artist: 'Baycrest', license: 'CC BY-SA 2.5', wiki: 'Hong Kong' },
  '香港': { file: 'Hong_Kong_Skyline_Restitch_-_Dec_2007.jpg', artist: 'Baycrest', license: 'CC BY-SA 2.5', wiki: 'Hong Kong' },

  // —— Hotels / covers (non-itinerary): city landmarks used as cover photos ——
  '外滩悦榕庄': { file: 'The_Bund_Shanghai.jpg', artist: 'Jakub Hałun', license: 'CC BY-SA 4.0', wiki: 'The Bund' },
  'bund hotel': { file: 'The_Bund_Shanghai.jpg', artist: 'Jakub Hałun', license: 'CC BY-SA 4.0', wiki: 'The Bund' },
  '上海酒店': { file: 'The_Bund_Shanghai.jpg', artist: 'Jakub Hałun', license: 'CC BY-SA 4.0', wiki: 'The Bund' },
  'hotel shanghai': { file: 'The_Bund_Shanghai.jpg', artist: 'Jakub Hałun', license: 'CC BY-SA 4.0', wiki: 'The Bund' },
  '半岛酒店': { file: 'The_Bund_Shanghai.jpg', artist: 'Jakub Hałun', license: 'CC BY-SA 4.0', wiki: 'The Bund' },
  'tokyo hotel': { file: 'Tokyo_Tower_and_around_Skyscrapers.jpg', artist: 'Kakidai', license: 'CC BY-SA 4.0', wiki: 'Tokyo' },
  '东京酒店': { file: 'Tokyo_Tower_and_around_Skyscrapers.jpg', artist: 'Kakidai', license: 'CC BY-SA 4.0', wiki: 'Tokyo' },
  'paris hotel': { file: 'Tour_Eiffel_Wikimedia_Commons.jpg', artist: 'Benh LIEU SONG', license: 'CC BY-SA 3.0', wiki: 'Paris' },
  '巴黎酒店': { file: 'Tour_Eiffel_Wikimedia_Commons.jpg', artist: 'Benh LIEU SONG', license: 'CC BY-SA 3.0', wiki: 'Paris' },
  'kyoto ryokan': { file: 'Kiyomizu-dera_in_Kyoto-r.jpg', artist: '663highland', license: 'CC BY 2.5', wiki: 'Kyoto' },
  '京都旅馆': { file: 'Kiyomizu-dera_in_Kyoto-r.jpg', artist: '663highland', license: 'CC BY 2.5', wiki: 'Kyoto' },
}


function normalizePlaceKey(raw: string): string {
  return raw
    .normalize('NFKC')
    .replace(/[\u3000\s]+/g, ' ')
    .replace(/[·•、,，.。!！?？:：;；"'「」『』【】\[\]()（）]/g, ' ')
    .trim()
    .toLowerCase()
}

/**
 * Leftover text after removing a known key that still means "the same place"
 * (civic suffixes, day labels, generic trip words). Anything else — a shop,
 * a street, another landmark — means the stop is NOT the known place.
 */
const GENERIC_LEFTOVER_RE = /^(?:day ?\d+|第 ?\d+ ?[天站日]|[市区县省站]|景区|风景区|景点|一日游|游|打卡|附近|周边|city|downtown|trip|tour|travel|day|area|district|station|[\s\d·•\-–—|/→>]+)$/i

function leftoverIsSamePlace(leftover: string, key: string): boolean {
  const parts = leftover
    .replace(/^day ?\d+/i, ' ')
    .replace(/第 ?\d+ ?[天站日]/g, ' ')
    .split(/\s+/)
    .map((p) => p.trim())
    .filter(Boolean)
  if (!parts.length) return true
  const file = WELL_KNOWN_STOPS[key]?.file
  return parts.every((part) => {
    if (GENERIC_LEFTOVER_RE.test(part)) return true
    // Another alias of the same place (「上海 外滩」, "Shanghai Bund").
    const other = WELL_KNOWN_STOPS[part]
    if (other) return true
    if (part.length >= 2 && file) {
      for (const [k, v] of Object.entries(WELL_KNOWN_STOPS)) {
        if (v.file === file && k.includes(part)) return true
      }
    }
    return false
  })
}

/**
 * Resolve a place name against WELL_KNOWN_STOPS.
 * F12: exact key, or a key contained in the place when everything else is
 * generic (「苏州市」「Day 2 上海」「上海 外滩」). 「上海 Seesaw 安福路」 is a
 * café, not the Bund — no match.
 */
export function lookupKnownStop(place: string): TripStopImage | null {
  const key = normalizePlaceKey(place)
  if (!key) return null
  const direct = WELL_KNOWN_STOPS[key]
  if (direct) return knownToAvailable(place, direct)
  const keys = Object.keys(WELL_KNOWN_STOPS).sort((a, b) => b.length - a.length)
  for (const k of keys) {
    if (k.length < 2 || !key.includes(k)) continue
    const leftover = key.split(k).join(' ').trim()
    if (leftoverIsSamePlace(leftover, k)) return knownToAvailable(place, WELL_KNOWN_STOPS[k]!)
  }
  return null
}

function knownToAvailable(place: string, known: KnownStop): TripStopImage {
  const width = known.width ?? 480
  const file = known.file.includes('%') ? decodeURIComponent(known.file) : known.file
  return {
    status: 'available',
    place,
    image_url: commonsFilePathUrl(file, width),
    artist: known.artist,
    license: known.license,
    credit_url: commonsFilePageUrl(file),
    ...(known.wiki
      ? { article_url: `https://en.wikipedia.org/wiki/${encodeURIComponent(known.wiki.replace(/ /g, '_'))}` }
      : {}),
    note: 'Photo from Wikimedia Commons (illustrative; not a live camera).',
    source: 'well-known',
    confidence: 'known',
  }
}

const WIKI_UA = 'IUI-dsh-plugin/0.13 (https://github.com/losebird/iui; trip photos)'
const IMAGE_HOSTS = new Set(['upload.wikimedia.org', 'thumb.wikimedia.org'])

function stripHtml(s: string): string {
  return s.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').trim().slice(0, 500)
}

function commonsFilenameFromUrl(url: string): string | null {
  try {
    const path = new URL(url).pathname
    const m = path.match(/\/wikipedia\/commons\/(?:thumb\/)?[0-9a-f]\/[0-9a-f]{2}\/([^/]+)(?:\/[^/]+)?$/i)
    if (!m?.[1]) return null
    return decodeURIComponent(m[1]).replace(/ /g, '_')
  } catch {
    return null
  }
}

function hasCjkText(s: string): boolean {
  return /[\u3400-\u9fff]/.test(s)
}

function wikipediaTitleVariants(place: string): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  const push = (t: string) => {
    const v = t.trim()
    if (!v || v.length > 120 || seen.has(v)) return
    seen.add(v)
    out.push(v)
  }
  push(place)
  // Generic civic suffix for short CJK toponyms (「苏州市」) — not a city allowlist.
  if (hasCjkText(place) && place.length >= 2 && place.length <= 4
    && !place.includes('市') && !place.includes('省') && !/[路街巷道站园寺馆店楼塔桥湖山区县镇村]$/.test(place)) {
    push(`${place}市`)
  }
  return out
}

type WikiSummary = {
  image: string
  original: string
  article?: string
  pageTitle: string
  coords?: GeoPoint
}

function wikiInit(signal?: AbortSignal): RequestInit {
  const init: RequestInit = { headers: { 'User-Agent': WIKI_UA, Accept: 'application/json' } }
  if (signal) init.signal = signal
  return init
}

async function fetchWikiSummaryOnce(
  lang: 'en' | 'zh',
  title: string,
  fetchImpl: typeof fetch,
  signal?: AbortSignal,
): Promise<WikiSummary> {
  const summaryUrl = `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`
  const summaryRes = await fetchImpl(summaryUrl, wikiInit(signal))
  if (!summaryRes.ok) throw new Error(`summary ${summaryRes.status}`)
  const data = (await summaryRes.json()) as {
    title?: string
    thumbnail?: { source?: string }
    originalimage?: { source?: string }
    content_urls?: { desktop?: { page?: string } }
    coordinates?: { lat?: number; lon?: number }
  }
  const image = data.thumbnail?.source ?? ''
  const original = data.originalimage?.source ?? image
  if (!image) throw new Error('no thumbnail')
  for (const url of [image, original]) {
    if (!url) continue
    const host = new URL(url).hostname
    if (!IMAGE_HOSTS.has(host)) throw new Error('unsupported image host')
  }
  const out: WikiSummary = { image, original, pageTitle: data.title ?? title }
  const article = data.content_urls?.desktop?.page
  if (article) out.article = article
  if (typeof data.coordinates?.lat === 'number' && typeof data.coordinates?.lon === 'number') {
    out.coords = { lat: data.coordinates.lat, lon: data.coordinates.lon }
  }
  return out
}

type CommonsMeta = { artist: string; license: string; evidence: string }

async function fetchCommonsMeta(
  filename: string,
  fetchImpl: typeof fetch,
  signal?: AbortSignal,
): Promise<CommonsMeta> {
  const fallback: CommonsMeta = { artist: '', license: '', evidence: filename }
  try {
    const res = await fetchImpl(
      `https://commons.wikimedia.org/w/api.php?${new URLSearchParams({
        action: 'query',
        format: 'json',
        prop: 'imageinfo',
        iiprop: 'extmetadata',
        titles: `File:${filename}`,
        origin: '*',
      }).toString()}`,
      wikiInit(signal),
    )
    if (!res.ok) return fallback
    const json = (await res.json()) as {
      query?: { pages?: Record<string, { imageinfo?: Array<{ extmetadata?: Record<string, { value?: string }> }> }> }
    }
    const info = Object.values(json.query?.pages ?? {})[0]?.imageinfo?.[0]?.extmetadata ?? {}
    return extmetaToMeta(filename, info)
  } catch {
    return fallback
  }
}

function extmetaToMeta(filename: string, info: Record<string, { value?: string }>): CommonsMeta {
  const artist = stripHtml(info.Artist?.value ?? '')
  const license = stripHtml(info.LicenseShortName?.value ?? '')
  const evidence = [
    filename,
    stripHtml(info.ObjectName?.value ?? ''),
    stripHtml(info.ImageDescription?.value ?? ''),
    String(info.Categories?.value ?? '').replace(/\|/g, ' '),
  ].join(' \n ')
  return { artist, license, evidence }
}

/** zh article → English title (langlinks), for CJK places whose photos are named in English. */
async function fetchEnglishTitle(
  zhTitle: string,
  fetchImpl: typeof fetch,
  signal?: AbortSignal,
): Promise<string | null> {
  try {
    const res = await fetchImpl(
      `https://zh.wikipedia.org/w/api.php?${new URLSearchParams({
        action: 'query',
        format: 'json',
        prop: 'langlinks',
        lllang: 'en',
        titles: zhTitle,
        redirects: '1',
        origin: '*',
      }).toString()}`,
      wikiInit(signal),
    )
    if (!res.ok) return null
    const json = (await res.json()) as {
      query?: { pages?: Record<string, { langlinks?: Array<{ '*'?: string; title?: string }> }> }
    }
    const ll = Object.values(json.query?.pages ?? {})[0]?.langlinks?.[0]
    return (ll?.['*'] ?? ll?.title ?? '').trim() || null
  } catch {
    return null
  }
}

/** Commons files photographed within PHOTO_GEO_RADIUS_M of coords that also name the place (nearest first). */
async function fetchGeoPhoto(
  place: string,
  coords: GeoPoint,
  fetchImpl: typeof fetch,
  signal?: AbortSignal,
): Promise<{ url: string; filename: string; meta: CommonsMeta; named: boolean } | null> {
  const lon = coords.lon ?? coords.lng
  if (!Number.isFinite(+coords.lat) || !Number.isFinite(+(lon ?? NaN))) return null
  try {
    const res = await fetchImpl(
      `https://commons.wikimedia.org/w/api.php?${new URLSearchParams({
        action: 'query',
        format: 'json',
        generator: 'geosearch',
        ggscoord: `${coords.lat}|${lon}`,
        ggsradius: String(PHOTO_GEO_RADIUS_M),
        ggsnamespace: '6',
        ggslimit: '8',
        prop: 'imageinfo|coordinates',
        iiprop: 'url|extmetadata',
        iiurlwidth: '480',
        origin: '*',
      }).toString()}`,
      wikiInit(signal),
    )
    if (!res.ok) return null
    const json = (await res.json()) as {
      query?: {
        pages?: Record<string, {
          title?: string
          index?: number
          coordinates?: Array<{ lat?: number; lon?: number }>
          imageinfo?: Array<{ thumburl?: string; url?: string; extmetadata?: Record<string, { value?: string }> }>
        }>
      }
    }
    const rows = Object.values(json.query?.pages ?? {}).flatMap((page) => {
      const ii = page.imageinfo?.[0]
      const url = ii?.thumburl ?? ii?.url ?? ''
      if (!url || !/^(upload|thumb)\.wikimedia\.org$/.test(safeHost(url))) return []
      const c = page.coordinates?.[0]
      const dist = c && typeof c.lat === 'number' && typeof c.lon === 'number'
        ? geoMeters(coords, { lat: c.lat, lon: c.lon })
        : Infinity
      if (!(dist <= PHOTO_GEO_RADIUS_M)) return []
      const filename = String(page.title ?? '').replace(/^File:/i, '').replace(/ /g, '_')
      if (!/\.(jpe?g|png|webp)$/i.test(filename)) return []
      const meta = extmetaToMeta(filename, ii?.extmetadata ?? {})
      // Nearby alone is not enough (a concert photo 200 m away is not the café): must also be named.
      if (!photoMatchesPlace(place, meta.evidence)) return []
      return [{ url, filename, meta, named: true, dist }]
    })
    rows.sort((x, y) => x.dist - y.dist)
    const best = rows[0]
    return best ? { url: best.url, filename: best.filename, meta: best.meta, named: best.named } : null
  } catch {
    return null
  }
}

function safeHost(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return ''
  }
}

function cleanArtist(artist: string): string {
  const a = artist.trim()
  if (!a || looksLikeFilename(a)) return 'Wikimedia Commons contributor'
  return a.slice(0, 120)
}

function cleanLicense(license: string): string {
  const okLicense = !!license && (license.startsWith('CC') || /public domain|^pd/i.test(license))
  return okLicense ? license : 'Wikimedia Commons'
}

export const NO_CONFIDENT_PHOTO_REASON =
  'No photo confidently shows this place (file name/description/categories do not name it and it is not within 300 m). '
  + 'Host shows a designed placeholder — do not substitute another place\'s photo.'

/**
 * F12: fetch one destination photo, but only when it demonstrably shows the place:
 * 1) strict well-known alias; 2) Wikipedia lead image whose Commons file name /
 * object name / description / categories name the place (or its English title),
 * or whose article sits within 300 m of `coords`; 3) Commons geosearch within
 * 300 m of `coords`. Otherwise unavailable → host placeholder.
 */
export async function fetchWikipediaTripImage(
  title: string,
  options: { signal?: AbortSignal; fetchImpl?: typeof fetch; coords?: GeoPoint | null } = {},
): Promise<TripStopImage> {
  const place = title.trim()
  if (!place || place.length > 160) {
    return { status: 'unavailable', place, reason: 'Invalid Wikipedia title.' }
  }
  const known = lookupKnownStop(place)
  if (known) return known
  const fetchImpl = options.fetchImpl ?? globalThis.fetch
  if (typeof fetchImpl !== 'function') {
    return { status: 'unavailable', place, reason: 'No fetch available.' }
  }
  const coords = options.coords ?? null
  const langs: Array<'en' | 'zh'> = hasCjkText(place) ? ['zh', 'en'] : ['en', 'zh']
  const titles = wikipediaTitleVariants(place)
  const tried = new Set<string>()
  for (const lang of langs) {
    for (const wikiTitle of titles) {
      let data: WikiSummary
      try {
        data = await fetchWikiSummaryOnce(lang, wikiTitle, fetchImpl, options.signal)
      } catch {
        continue
      }
      const filename = commonsFilenameFromUrl(data.original) ?? commonsFilenameFromUrl(data.image)
      if (!filename || tried.has(filename)) continue
      tried.add(filename)
      const meta = await fetchCommonsMeta(filename, fetchImpl, options.signal)
      let confidence: TripStopImage['confidence'] | null = null
      if (photoMatchesPlace(place, meta.evidence) || photoMatchesPlace(data.pageTitle, meta.evidence)) {
        confidence = 'named'
      } else if (coords && data.coords && geoMeters(coords, data.coords) <= PHOTO_GEO_RADIUS_M) {
        confidence = 'geo'
      } else if (lang === 'zh') {
        const en = await fetchEnglishTitle(data.pageTitle, fetchImpl, options.signal)
        if (en && photoMatchesPlace(en, meta.evidence)) confidence = 'named'
      }
      if (!confidence) continue
      return {
        status: 'available',
        place,
        image_url: data.image,
        artist: cleanArtist(meta.artist),
        license: cleanLicense(meta.license),
        credit_url: commonsFilePageUrl(filename),
        article_url: data.article
          ?? `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(wikiTitle.replace(/ /g, '_'))}`,
        note: 'Photo verified to show this place (Commons metadata / location). It is not a live camera view.',
        source: 'wikipedia',
        confidence,
      }
    }
  }
  if (coords) {
    const geo = await fetchGeoPhoto(place, coords, fetchImpl, options.signal)
    if (geo) {
      return {
        status: 'available',
        place,
        image_url: geo.url,
        artist: cleanArtist(geo.meta.artist),
        license: cleanLicense(geo.meta.license),
        credit_url: commonsFilePageUrl(geo.filename),
        note: `Commons photo of this place, taken within ${PHOTO_GEO_RADIUS_M} m of its coordinates.`,
        source: 'wikipedia',
        confidence: 'geo',
      }
    }
  }
  return { status: 'unavailable', place, reason: NO_CONFIDENT_PHOTO_REASON, confidence: 'none' }
}

/** Resolve 1–8 titles (tool entry). Well-known first for speed, then Wikipedia. */
/** Default Wikipedia/Commons fetch budget (P1-TOOL-TIMEOUT). */
export const TRIP_IMAGES_FETCH_TIMEOUT_MS = 8000

export async function resolveTripStopImages(
  titles: string[],
  options: {
    signal?: AbortSignal
    fetchImpl?: typeof fetch
    preferNetwork?: boolean
    timeoutMs?: number
    /** F12: optional stop coordinates aligned with titles (enables 300 m geo checks). */
    coordinates?: Array<GeoPoint | null | undefined>
  } = {},
): Promise<{ source: string; stops: TripStopImage[] }> {
  if (!Array.isArray(titles) || titles.length < 1 || titles.length > 8) {
    throw new Error('Provide 1–8 nonempty Wikipedia titles, at most 160 characters each.')
  }
  for (const t of titles) {
    if (typeof t !== 'string' || !t.trim() || t.length > 160) {
      throw new Error('Provide 1–8 nonempty Wikipedia titles, at most 160 characters each.')
    }
  }
  const preferNetwork = options.preferNetwork !== false
  const timeoutMs = options.timeoutMs ?? TRIP_IMAGES_FETCH_TIMEOUT_MS
  let signal = options.signal
  if (!signal && preferNetwork && typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    signal = AbortSignal.timeout(timeoutMs)
  }
  const stops = await Promise.all(
    titles.map(async (title, index) => {
      const trimmed = title.trim()
      if (!preferNetwork) {
        return lookupKnownStop(trimmed)
          ?? { status: 'unavailable' as const, place: trimmed, reason: 'No well-known photo.' }
      }
      const fetchOpts: { signal?: AbortSignal; fetchImpl?: typeof fetch; coords?: GeoPoint | null } = {}
      if (signal) fetchOpts.signal = signal
      if (options.fetchImpl) fetchOpts.fetchImpl = options.fetchImpl
      const c = options.coordinates?.[index]
      if (c) fetchOpts.coords = c
      return fetchWikipediaTripImage(trimmed, fetchOpts)
    }),
  )
  return { source: 'Wikipedia / Wikimedia Commons (+ IUI well-known)', stops }
}

function escapeHtmlAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** F12: collapsed attribution — one short link, details in the tooltip, never a file name. */
function creditHtml(img: TripStopImage): string {
  if (img.status !== 'available') return ''
  const href = img.credit_url ? escapeHtmlAttr(img.credit_url) : '#'
  const detail = [img.artist && !looksLikeFilename(img.artist) ? img.artist : '', img.license ?? '']
    .filter(Boolean)
    .join(' · ')
  const label = photoCreditLabel(hasCjkText(img.place))
  return `<div class="iui-photo-credit" data-iui-host-credit="1"><a href="${href}" target="_blank" rel="noopener noreferrer" title="${escapeHtmlAttr(detail || 'Wikimedia Commons')}">${escapeHtmlAttr(label)}</a></div>`
}

/** Card class markers that get Wikimedia enrich / runtime fill (itinerary + covers). */
export const PLACE_MEDIA_CARD_MARKERS = [
  'iui-stop-card',
  'iui-hotel-card',
  'iui-product-card',
  'iui-place-card',
  'iui-cover-card',
] as const

/**
 * Static enrich: inject &lt;img&gt; into empty .photo / .cover bands when the card
 * name / data-place matches WELL_KNOWN_STOPS. Safe on author HTML before srcdoc.
 * Covers itinerary stops AND hotel/product/place/cover cards (P1-OTHER-MEDIA).
 */
export function enrichPlaceMediaHtml(html: string, net?: Partial<NetContext>): string {
  if (!html) return html
  // F3: Wikimedia known-unreachable → no Commons src / credit that can only fail;
  // the in-frame runtime draws place-name map cards instead.
  if ((net ?? getNetContext()).wiki === false) return html
  let out = html
  for (const marker of PLACE_MEDIA_CARD_MARKERS) {
    if (new RegExp(marker, 'i').test(out)) out = enrichCardsWithMarker(out, marker)
  }
  // data-iui-place on arbitrary nodes with empty .photo/.cover
  if (/data-iui-place=/i.test(out)) out = enrichDataPlaceNodes(out)
  return out
}

/** @deprecated alias — use enrichPlaceMediaHtml */
export function enrichItineraryHtml(html: string): string {
  return enrichPlaceMediaHtml(html)
}

function enrichCardsWithMarker(html: string, marker: string): string {
  let out = ''
  let cursor = 0
  while (cursor < html.length) {
    const startAttr = html.toLowerCase().indexOf(marker, cursor)
    if (startAttr < 0) {
      out += html.slice(cursor)
      break
    }
    // find opening tag start
    let tagStart = html.lastIndexOf('<', startAttr)
    if (tagStart < cursor) {
      out += html.slice(cursor, startAttr + marker.length)
      cursor = startAttr + marker.length
      continue
    }
    const tagEnd = html.indexOf('>', startAttr)
    if (tagEnd < 0) {
      out += html.slice(cursor)
      break
    }
    // walk to matching close for this div (depth count)
    let i = tagEnd + 1
    let depth = 1
    while (i < html.length && depth > 0) {
      const nextOpen = html.indexOf('<div', i)
      const nextClose = html.indexOf('</div>', i)
      if (nextClose < 0) break
      if (nextOpen >= 0 && nextOpen < nextClose) {
        depth += 1
        i = nextOpen + 4
      } else {
        depth -= 1
        i = nextClose + 6
      }
    }
    const open = html.slice(tagStart, tagEnd + 1)
    const inner = html.slice(tagEnd + 1, i - 6)
    const close = '</div>'
    out += html.slice(cursor, tagStart)

    const openPlace = open.match(/data-iui-place=["']([^"']+)["']/i)?.[1]
      ?? open.match(/data-place=["']([^"']+)["']/i)?.[1]
    const nameMatch = inner.match(/class=["'][^"']*\bname\b[^"']*["'][^>]*>([^<]+)/i)
      ?? inner.match(/data-place=["']([^"']+)["']/i)
      ?? inner.match(/data-iui-place=["']([^"']+)["']/i)
      ?? inner.match(/<h[234][^>]*>([^<]+)/i)
      ?? open.match(/title=["']([^"']+)["']/i)
    const place = (openPlace ?? nameMatch?.[1] ?? '').trim()
    const known = place ? lookupKnownStop(place) : null
    if (!known?.image_url) {
      out += open + inner + close
      cursor = i
      continue
    }
    let next = inner
    const hasWikiImg = /<img\b[^>]*src=["'][^"']*(?:commons\.wikimedia|upload\.wikimedia|thumb\.wikimedia)/i.test(next)
    if (!hasWikiImg) {
      const imgInner = `<img src="${escapeHtmlAttr(known.image_url)}" alt="${escapeHtmlAttr(place)}" loading="lazy"/>`
      if (/class=["'][^"']*\b(?:photo|cover)\b/i.test(next)) {
        next = next.replace(
          /<div([^>]*class=["'][^"']*\b(?:photo|cover)\b[^"']*["'][^>]*)>[\s\S]*?<\/div>/i,
          `<div$1>${imgInner}</div>`,
        )
      } else {
        next = `<div class="photo">${imgInner}</div>` + next
      }
    }
    if (!/iui-photo-credit/i.test(next)) {
      next += creditHtml(known)
    }
    out += open + next + close
    cursor = i
  }
  return out
}


function enrichDataPlaceNodes(html: string): string {
  // Lightweight: nodes that declare data-iui-place and lack a wiki img.
  return html.replace(
    /<([a-z0-9]+)([^>]*\bdata-iui-place=["']([^"']+)["'][^>]*)>([\s\S]*?)<\/\1>/gi,
    (full, tag, attrs, placeRaw, inner) => {
      const place = String(placeRaw || '').trim()
      const known = place ? lookupKnownStop(place) : null
      if (!known?.image_url) return full
      if (/<img\b[^>]*src=["'][^"']*(?:commons\.wikimedia|upload\.wikimedia|thumb\.wikimedia)/i.test(inner)) {
        return full
      }
      const imgInner = `<img src="${escapeHtmlAttr(known.image_url)}" alt="${escapeHtmlAttr(place)}" loading="lazy"/>`
      let next = inner
      if (/class=["'][^"']*\b(?:photo|cover)\b/i.test(next)) {
        next = next.replace(
          /<div([^>]*class=["'][^"']*\b(?:photo|cover)\b[^"']*["'][^>]*)>[\s\S]*?<\/div>/i,
          `<div$1>${imgInner}</div>`,
        )
      } else {
        next = `<div class="photo">${imgInner}</div>` + next
      }
      if (!/iui-photo-credit/i.test(next)) next += creditHtml(known)
      return `<${tag}${attrs}>${next}</${tag}>`
    },
  )
}

export function buildTripPhotoFillScript(net: Partial<NetContext> = {}): string {
  const map: Record<string, { url: string; artist: string; license: string; credit: string }> = {}
  for (const [key, known] of Object.entries(WELL_KNOWN_STOPS)) {
    const file = known.file.includes('%') ? decodeURIComponent(known.file) : known.file
    map[key] = {
      url: commonsFilePathUrl(file, known.width ?? 480),
      artist: known.artist,
      license: known.license,
      credit: commonsFilePageUrl(file),
    }
  }
  const json = JSON.stringify(map)
  // Runtime: strict well-known cache + confident Wikipedia/Commons lookup (F12).
  // Unconfident → designed placeholder, never another place's photo.
  // F3 (Batch F): Wikimedia unreachable → skip lookups; placeholders become a
  // place-name map card drawn from the active basemap (AMap on mainland networks).
  const netJson = JSON.stringify({ wiki: net.wiki !== false, tiles: net.tiles === 'amap' ? 'amap' : 'default', amap: AMAP_TILE.url })
  return '<script>\n' + GCJ_JS + '\n(function () {\n  var MAP = ' + json + ';\n  var NET = ' + netJson + ';\n' + PHOTO_MATCH_JS + TRIP_PHOTO_RUNTIME_JS + '})();\n<\/script>'
}

/** In-page fill logic (ES5). Uses PHOTO_MATCH_JS helpers (iuiPhotoMatches, iuiGeoMeters…). */
const TRIP_PHOTO_RUNTIME_JS = String.raw`
  var CACHE = Object.create(null);
  var INFLIGHT = Object.create(null);
  var ZH_UI = false;
  try { var docLang = String(document.documentElement.lang || ''); ZH_UI = docLang ? /^zh/i.test(docLang) : /^zh/i.test(String(navigator.language || '')); } catch (eLang) {}
  var CARD_SEL = '.iui-stop-card, .iui-hotel-card, .iui-product-card, .iui-place-card, .iui-cover-card';
  function norm(s) {
    s = String(s || '');
    try { s = s.normalize('NFKC'); } catch (eN) {}
    return s.replace(/[\u3000\s]+/g, ' ').replace(/[·•、,，.。!！?？:：;；"'「」『』【】\[\]()（）]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
  }
  function hasCjk(s) { return /[\u3400-\u9fff]/.test(String(s || '')); }
  /* F12: strict well-known lookup — exact alias, or alias + generic leftovers only. */
  var GENERIC = /^(?:day ?\d+|第 ?\d+ ?[天站日]|[市区县省站]|景区|风景区|景点|一日游|游|打卡|附近|周边|city|downtown|trip|tour|travel|day|area|district|station|[\s\d·•\-–—|\/→>]+)$/i;
  var MAP_KEYS = Object.keys(MAP).sort(function (a, b) { return b.length - a.length; });
  function samePlaceLeftover(leftover, k) {
    var parts = String(leftover || '').replace(/^day ?\d+/i, ' ').replace(/第 ?\d+ ?[天站日]/g, ' ').split(/\s+/);
    var url = MAP[k] && MAP[k].url;
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      if (!p || GENERIC.test(p) || MAP[p]) continue;
      var ok = false;
      if (p.length >= 2) {
        for (var j = 0; j < MAP_KEYS.length; j++) {
          if (MAP[MAP_KEYS[j]].url === url && MAP_KEYS[j].indexOf(p) !== -1) { ok = true; break; }
        }
      }
      if (!ok) return false;
    }
    return true;
  }
  function lookupKnown(place) {
    var key = norm(place);
    if (!key) return null;
    if (MAP[key]) return MAP[key];
    for (var i = 0; i < MAP_KEYS.length; i++) {
      var k = MAP_KEYS[i];
      if (k.length < 2 || key.indexOf(k) === -1) continue;
      if (samePlaceLeftover(key.split(k).join(' ').trim(), k)) return MAP[k];
    }
    return null;
  }
  function placeCandidates(card) {
    var out = [], seen = Object.create(null);
    function push(s) {
      if (!s || s.length < 2 || seen[s]) return;
      seen[s] = 1;
      out.push(s);
    }
    function add(raw) {
      var s = String(raw || '').replace(/\s+/g, ' ').trim();
      if (!s || s.length > 160) return;
      push(s.replace(/^Day\s*\d+\s*/i, '').replace(/^第\s*\d+\s*[天站日]\s*/, '').trim() || s);
      // Compound labels ("苏州 · 拙政园", "Day 2 · Suzhou"). A bare city part is NOT a
      // candidate when the full label names something more specific (「上海 · Seesaw 安福路」).
      var fullKnown = !!lookupKnown(s);
      var parts = s.split(/[·•|/→\-–,，]+/);
      if (parts.length < 2) return;
      for (var i = 0; i < parts.length; i++) {
        var p = String(parts[i] || '').replace(/^Day\s*\d+\s*/i, '').replace(/^第\s*\d+\s*[天站日]\s*/, '').trim();
        if (!p || /^day\s*\d+/i.test(p)) continue;
        if (!fullKnown && lookupKnown(p)) continue;
        push(p);
      }
    }
    add(card.getAttribute('data-iui-place'));
    add(card.getAttribute('data-place'));
    var marked = card.querySelectorAll('[data-iui-place],[data-place]');
    for (var mi = 0; mi < marked.length; mi++) {
      add(marked[mi].getAttribute('data-iui-place'));
      add(marked[mi].getAttribute('data-place'));
    }
    var nameEl = card.querySelector('.name') || card.querySelector('b') || card.querySelector('h3,h4,h2') || card.querySelector('[title]');
    if (nameEl) {
      add(nameEl.getAttribute('title'));
      add(nameEl.textContent);
    }
    var img0 = card.querySelector('.photo img, .cover img, img');
    if (img0) add(img0.getAttribute('alt'));
    return out;
  }
  function cardCoords(card) {
    var els = [card];
    var inner = card.querySelector('[data-lat],[data-iui-lat]');
    if (inner) els.push(inner);
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      var lat = parseFloat(el.getAttribute('data-iui-lat') || el.getAttribute('data-lat') || '');
      var lon = parseFloat(el.getAttribute('data-iui-lng') || el.getAttribute('data-lng') || el.getAttribute('data-lon') || '');
      if (isFinite(lat) && isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) return { lat: lat, lon: lon };
    }
    return null;
  }
  function cleanWikiUrl(url) {
    try {
      var u = new URL(url);
      u.searchParams.delete('utm_source');
      u.searchParams.delete('utm_campaign');
      u.searchParams.delete('utm_content');
      return u.toString();
    } catch (e) { return url; }
  }
  function isUsableWikiUrl(url) {
    if (!url || typeof url !== 'string') return false;
    try {
      var h = new URL(url).hostname;
      return h === 'upload.wikimedia.org' || h === 'thumb.wikimedia.org' || h === 'commons.wikimedia.org';
    } catch (e) { return false; }
  }
  function titleVariants(place) {
    var s = String(place || '').trim();
    var out = [], seen = Object.create(null);
    function push(t) {
      t = String(t || '').trim();
      if (!t || t.length > 120 || seen[t]) return;
      seen[t] = 1;
      out.push(t);
    }
    push(s);
    if (hasCjk(s) && s.length >= 2 && s.length <= 4 && s.indexOf('市') === -1 && s.indexOf('省') === -1 && !/[路街巷道站园寺馆店楼塔桥湖山区县镇村]$/.test(s)) push(s + '市');
    return out;
  }
  function fetchJson(url, cb) {
    var tries = 0;
    function once() {
      tries++;
      var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      var timer = setTimeout(function () { try { if (ctrl) ctrl.abort(); } catch (e) {} }, 5000);
      var opts = { headers: { Accept: 'application/json' }, credentials: 'omit' };
      if (ctrl) opts.signal = ctrl.signal;
      fetch(url, opts).then(function (res) {
        clearTimeout(timer);
        if (res.status === 404) { var nf = new Error('http 404'); nf.final = true; throw nf; }
        if (!res.ok) throw new Error('http ' + res.status);
        return res.json();
      }).then(function (data) { cb(null, data); }).catch(function (err) {
        clearTimeout(timer);
        if (tries < 2 && !(err && err.final)) setTimeout(once, 280 * tries);
        else cb(err || new Error('fetch failed'));
      });
    }
    once();
  }
  function api(host, params) {
    params.format = 'json';
    params.origin = '*';
    return 'https://' + host + '/w/api.php?' + new URLSearchParams(params).toString();
  }
  function fileFromUrl(url) {
    var m = String(url || '').match(/\/wikipedia\/commons\/(?:thumb\/)?[0-9a-f]\/[0-9a-f]{2}\/([^\/?#]+)/i);
    if (!m) return null;
    try { return decodeURIComponent(m[1]).replace(/ /g, '_'); } catch (e) { return m[1]; }
  }
  function stripTags(s) {
    return String(s || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim().slice(0, 300);
  }
  function metaFrom(file, em) {
    em = em || {};
    function v(k) { return em[k] && em[k].value ? String(em[k].value) : ''; }
    return {
      artist: stripTags(v('Artist')),
      license: stripTags(v('LicenseShortName')),
      evidence: [file, stripTags(v('ObjectName')), stripTags(v('ImageDescription')), v('Categories').replace(/\|/g, ' ')].join(' \n ')
    };
  }
  function infoOf(url, file, meta, page) {
    return {
      url: cleanWikiUrl(url),
      artist: meta.artist && !iuiLooksLikeFilename(meta.artist) ? meta.artist : '',
      license: meta.license || 'Wikimedia Commons',
      credit: file ? 'https://commons.wikimedia.org/wiki/File:' + encodeURIComponent(file) : (page || '#')
    };
  }
  function commonsMeta(file, cb) {
    fetchJson(api('commons.wikimedia.org', { action: 'query', prop: 'imageinfo', iiprop: 'extmetadata', titles: 'File:' + file }), function (err, data) {
      var em = null;
      try { var pages = data.query.pages; em = pages[Object.keys(pages)[0]].imageinfo[0].extmetadata; } catch (e) {}
      cb(metaFrom(file, em));
    });
  }
  function englishTitle(zhTitle, cb) {
    fetchJson(api('zh.wikipedia.org', { action: 'query', prop: 'langlinks', lllang: 'en', redirects: '1', titles: zhTitle }), function (err, data) {
      var t = '';
      try { var p = data.query.pages; var ll = p[Object.keys(p)[0]].langlinks[0]; t = ll['*'] || ll.title || ''; } catch (e) {}
      cb(t);
    });
  }
  function wikiSummary(lang, title, cb) {
    var url = 'https://' + lang + '.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(title);
    fetchJson(url, function (err, data) {
      if (err || !data) return cb(err || new Error('empty'));
      var thumb = data.thumbnail && data.thumbnail.source;
      var original = data.originalimage && data.originalimage.source;
      var image = thumb || original;
      if (!isUsableWikiUrl(image)) return cb(new Error('no thumbnail'));
      var page = (data.content_urls && data.content_urls.desktop && data.content_urls.desktop.page)
        || ('https://' + lang + '.wikipedia.org/wiki/' + encodeURIComponent(String(data.title || title).replace(/ /g, '_')));
      var c = data.coordinates;
      cb(null, {
        url: image,
        original: original || image,
        page: page,
        pageTitle: String(data.title || title),
        coords: c && typeof c.lat === 'number' && typeof c.lon === 'number' ? { lat: c.lat, lon: c.lon } : null
      });
    });
  }
  /* Commons files photographed within IUI_PHOTO_GEO_RADIUS_M of the stop. */
  function geoSearch(place, coords, cb) {
    fetchJson(api('commons.wikimedia.org', {
      action: 'query', generator: 'geosearch', ggscoord: coords.lat + '|' + coords.lon,
      ggsradius: String(IUI_PHOTO_GEO_RADIUS_M), ggsnamespace: '6', ggslimit: '8',
      prop: 'imageinfo|coordinates', iiprop: 'url|extmetadata', iiurlwidth: '480'
    }), function (err, data) {
      if (err || !data || !data.query || !data.query.pages) return cb(null);
      var best = null;
      var pages = data.query.pages;
      for (var id in pages) {
        var pg = pages[id];
        var ii = pg.imageinfo && pg.imageinfo[0];
        var url = ii && (ii.thumburl || ii.url);
        var file = String(pg.title || '').replace(/^File:/i, '').replace(/ /g, '_');
        if (!ii || !isUsableWikiUrl(url) || !/\.(jpe?g|png|webp)$/i.test(file)) continue;
        var c = pg.coordinates && pg.coordinates[0];
        var dist = c ? iuiGeoMeters(coords, c) : Infinity;
        if (!(dist <= IUI_PHOTO_GEO_RADIUS_M)) continue;
        var meta = metaFrom(file, ii.extmetadata);
        // Nearby alone is not enough (a concert photo 200 m away is not the café): must also be named.
        if (!iuiPhotoMatches(place, meta.evidence)) continue;
        if (!best || dist < best.dist) best = { dist: dist, info: infoOf(url, file, meta, '') };
      }
      cb(best ? best.info : null);
    });
  }
  /* Last resort: Commons full-text search, accepted only when the file itself names the place. */
  function commonsSearch(place, cb) {
    var q = String(place || '').trim();
    if (!q) return cb(null);
    fetchJson(api('commons.wikimedia.org', {
      action: 'query', generator: 'search', gsrsearch: q, gsrnamespace: '6', gsrlimit: '5',
      prop: 'imageinfo', iiprop: 'url|extmetadata', iiurlwidth: '480'
    }), function (err, data) {
      if (err || !data || !data.query || !data.query.pages) return cb(null);
      var pages = Object.keys(data.query.pages).map(function (id) { return data.query.pages[id]; });
      pages.sort(function (a, b) { return (a.index || 0) - (b.index || 0); });
      for (var i = 0; i < pages.length; i++) {
        var info = pages[i].imageinfo && pages[i].imageinfo[0];
        if (!info) continue;
        var thumb = info.thumburl || info.url;
        if (!isUsableWikiUrl(thumb)) continue;
        var file = String(pages[i].title || '').replace(/^File:/i, '').replace(/ /g, '_');
        var meta = metaFrom(file, info.extmetadata);
        if (!iuiPhotoMatches(q, file + ' ' + stripTags(info.extmetadata && info.extmetadata.ObjectName && info.extmetadata.ObjectName.value))) continue;
        return cb(infoOf(thumb, file, meta, ''));
      }
      cb(null);
    });
  }
  /* F12: confident photo or null (negative-cached). */
  function resolveNetwork(place, coords, cb) {
    var key = norm(place) + (coords ? '@' + coords.lat.toFixed(4) + ',' + coords.lon.toFixed(4) : '');
    if (!norm(place)) return cb(null);
    if (key in CACHE) return cb(CACHE[key] || null);
    if (INFLIGHT[key]) { INFLIGHT[key].push(cb); return; }
    INFLIGHT[key] = [cb];
    var langs = hasCjk(place) ? ['zh', 'en'] : ['en', 'zh'];
    var titles = titleVariants(place);
    var steps = [];
    for (var li = 0; li < langs.length; li++) {
      for (var ti = 0; ti < titles.length; ti++) steps.push({ lang: langs[li], title: titles[ti] });
    }
    var idx = 0;
    var seenFiles = Object.create(null);
    function done(info) {
      CACHE[key] = info || false;
      var waiters = INFLIGHT[key] || [];
      delete INFLIGHT[key];
      for (var i = 0; i < waiters.length; i++) {
        try { waiters[i](info || null); } catch (e) {}
      }
    }
    function next() {
      if (idx >= steps.length) {
        if (coords) {
          geoSearch(place, coords, function (g) {
            if (g) done(g);
            else commonsSearch(place, function (c) { done(c); });
          });
          return;
        }
        commonsSearch(place, function (c) { done(c); });
        return;
      }
      var step = steps[idx++];
      wikiSummary(step.lang, step.title, function (err, s) {
        if (!s) return next();
        var file = fileFromUrl(s.original) || fileFromUrl(s.url);
        if (!file || seenFiles[file]) return next();
        seenFiles[file] = 1;
        commonsMeta(file, function (meta) {
          function accept() { done(infoOf(s.url, file, meta, s.page)); }
          if (iuiPhotoMatches(place, meta.evidence) || iuiPhotoMatches(s.pageTitle, meta.evidence)) return accept();
          if (coords && s.coords && iuiGeoMeters(coords, s.coords) <= IUI_PHOTO_GEO_RADIUS_M) return accept();
          if (step.lang === 'zh') {
            englishTitle(s.pageTitle, function (en) {
              if (en && iuiPhotoMatches(en, meta.evidence)) accept();
              else next();
            });
            return;
          }
          next();
        });
      });
    }
    next();
  }
  /* ---- credits (collapsed: one short link, details in the tooltip) ---- */
  function creditLabel(place) {
    return (hasCjk(place) || ZH_UI) ? 'ⓘ 图片来自 Wikimedia' : 'ⓘ Photo: Wikimedia';
  }
  function setCreditLink(root, href, label, title) {
    if (!root) return null;
    var box = root.classList && root.classList.contains('iui-photo-credit')
      ? root
      : (root.querySelector && root.querySelector('.iui-photo-credit'));
    if (!box) {
      box = document.createElement('div');
      box.className = 'iui-photo-credit';
      (root.appendChild ? root : document.body).appendChild(box);
    }
    box.setAttribute('data-iui-host-credit', '1');
    var a = box.querySelector('a');
    if (!a) {
      a = document.createElement('a');
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      box.insertBefore(a, box.firstChild);
    }
    a.href = href || '#';
    if (label && iuiLooksLikeFilename(label)) label = creditLabel(label);
    if (label) a.textContent = String(label);
    if (title) a.title = String(title);
    return a;
  }
  function ensureCredit(card, info, place) {
    if (!info || !card) return;
    var href = info.credit || '#';
    var existing = card.querySelector('.iui-photo-credit');
    var a = existing && existing.querySelector('a');
    // Host-owned credit already live for this photo — do not rewrite every fill
    // (that retriggers the photo MutationObserver and wedges the tab).
    if (existing && existing.getAttribute('data-iui-host-credit') === '1' && a && a.isConnected && a.getAttribute('href') === href) return;
    if (!existing) {
      existing = document.createElement('div');
      existing.className = 'iui-photo-credit';
      card.appendChild(existing);
    }
    while (existing.firstChild) existing.removeChild(existing.firstChild);
    var detail = [info.artist, info.license].filter(function (x) { return x && !iuiLooksLikeFilename(x); }).join(' · ');
    setCreditLink(existing, href, creditLabel(place), detail || 'Wikimedia Commons');
  }
  /* Model-written credits: collapse Wikimedia ones and never show file names. */
  function sanitizeCredits() {
    var boxes = document.querySelectorAll('.iui-photo-credit:not([data-iui-host-credit]):not([data-iui-credit-clean])');
    for (var i = 0; i < boxes.length; i++) {
      var box = boxes[i];
      box.setAttribute('data-iui-credit-clean', '1');
      var text = String(box.textContent || '').replace(/\s+/g, ' ').trim();
      var a = box.querySelector('a');
      var href = a ? a.getAttribute('href') || '#' : '#';
      if (!iuiLooksLikeFilename(text) && !/wiki(media|pedia)/i.test(href + ' ' + text)) continue;
      var detail = text
        .replace(/(?:File:)?[^\s·|]+\.(?:jpe?g|png|gif|webp|svg|tiff?)\b/gi, '')
        .replace(/(?:\s*·\s*)?(?:Wikimedia(?: Commons)?|Wikipedia)(?:\s*·\s*)?/gi, ' · ')
        .replace(/^[\s·|]+|[\s·|]+$/g, '').replace(/(?:\s*·\s*){2,}/g, ' · ');
      var card = box.closest ? box.closest(CARD_SEL + ', [data-iui-place]') : null;
      var place = card ? (placeCandidates(card)[0] || '') : '';
      while (box.firstChild) box.removeChild(box.firstChild);
      setCreditLink(box, href, creditLabel(place || text), detail || 'Wikimedia Commons');
    }
  }
  /* ---- designed placeholder (no confident photo) ---- */
  var ICONS = {
    pin: '<path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
    food: '<path d="M7 3v18M4.5 3v5a2.5 2.5 0 0 0 5 0V3M17 21V3c-2 1-3.5 3.5-3.5 7v3H17"/>',
    cafe: '<path d="M4 9h12v4a6 6 0 0 1-6 6h0a6 6 0 0 1-6-6V9zM16 10h1.5a2.5 2.5 0 0 1 0 5H16M8 3.5v2.5M12 3.5v2.5"/>',
    museum: '<path d="M3 10l9-6 9 6M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18"/>',
    park: '<path d="M12 3l5 7h-3l4 6H6l4-6H7l5-7zM12 16v5"/>',
    hotel: '<path d="M3 19V6M3 14h18v5M21 14v-1a3 3 0 0 0-3-3h-7v4M7 12.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z"/>',
    shop: '<path d="M5 8h14l-1 12H6L5 8zM9 8V6a3 3 0 0 1 6 0v2"/>',
    transit: '<path d="M7 3h10a2 2 0 0 1 2 2v9a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3V5a2 2 0 0 1 2-2zM5 10h14M8 21l2-4M16 21l-2-4"/>'
  };
  function categoryOf(card) {
    var t = (String(card.className || '') + ' ' + String(card.textContent || '').slice(0, 300)).toLowerCase();
    if (/hotel-card|酒店|旅馆|民宿|宾馆|客栈|hotel|hostel|ryokan|\binn\b/.test(t)) return 'hotel';
    if (/咖啡|茶馆|茶室|酒吧|cafe|café|coffee|tea house|\bbar\b/.test(t)) return 'cafe';
    if (/餐|饭|面馆|小吃|美食|菜|火锅|烧烤|料理|restaurant|bistro|food|ramen|sushi|eat/.test(t)) return 'food';
    if (/博物|美术馆|展览|纪念馆|museum|gallery|exhibit/.test(t)) return 'museum';
    if (/机场|车站|火车|地铁|码头|airport|station|train|metro|ferry/.test(t)) return 'transit';
    if (/商场|市场|购物|店|product-card|mall|market|shop|store/.test(t)) return 'shop';
    if (/公园|园林|山|湖|海滩|森林|park|garden|lake|mountain|beach|forest/.test(t)) return 'park';
    return 'pin';
  }
  function ensurePlaceholder(photo, card) {
    var ph = null;
    for (var c = photo.firstElementChild; c; c = c.nextElementSibling) {
      if (c.classList && c.classList.contains('iui-photo-ph')) { ph = c; break; }
    }
    if (!ph) {
      var cat = categoryOf(card);
      ph = document.createElement('div');
      ph.className = 'iui-photo-ph';
      ph.setAttribute('aria-hidden', 'true');
      ph.setAttribute('data-cat', cat);
      ph.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' + ICONS[cat] + '</svg>';
      photo.insertBefore(ph, photo.firstChild);
    }
    try { if (getComputedStyle(photo).position === 'static') photo.style.position = 'relative'; } catch (e) {}
    return ph;
  }
  function setState(photo, state) {
    if (photo && photo.getAttribute('data-iui-photo-state') !== state) photo.setAttribute('data-iui-photo-state', state);
  }
  function giveUp(photo, img) {
    setState(photo, 'placeholder');
    photo.setAttribute('data-iui-photo-final', '1');
    try { img.removeAttribute('src'); img.removeAttribute('data-iui-photo-ok'); } catch (e) {}
    try { addMapThumb(photo); } catch (eM) {}
  }
  /* F3: place-name map card — a few basemap tiles centred on the stop + pin + name. */
  function tileUrl(x, y, z, inChina) {
    if (NET.tiles === 'amap' && inChina) return NET.amap.replace('{s}', String(1 + ((x + y) % 4))).replace('{x}', x).replace('{y}', y).replace('{z}', z);
    if (inChina) return 'https://' + 'abc'.charAt((x + y) % 3) + '.tile.openstreetmap.fr/hot/' + z + '/' + x + '/' + y + '.png';
    return 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/' + z + '/' + y + '/' + x;
  }
  function addMapThumb(photo) {
    if (!photo || photo.querySelector('.iui-photo-map')) return;
    var card = (photo.closest && photo.closest(CARD_SEL + ', [data-iui-place]')) || photo.parentElement;
    var c = card ? cardCoords(card) : null;
    var ph = null;
    for (var k = photo.firstElementChild; k; k = k.nextElementSibling) {
      if (k.classList && k.classList.contains('iui-photo-ph')) { ph = k; break; }
    }
    if (!ph) ph = ensurePlaceholder(photo, card || photo);
    var name = card ? String(placeCandidates(card)[0] || '') : '';
    var box = document.createElement('div');
    box.className = 'iui-photo-map';
    box.setAttribute('aria-hidden', 'true');
    if (c) {
      var inChina = !!(window.__iuiInChina && window.__iuiInChina(c.lat, c.lon));
      var lat = c.lat, lng = c.lon;
      if (NET.tiles === 'amap' && inChina && window.__iuiWgs2Gcj) { var g = window.__iuiWgs2Gcj(lat, lng); lat = g[0]; lng = g[1]; }
      var z = 15, n = Math.pow(2, z), rad = lat * Math.PI / 180;
      var px = (lng + 180) / 360 * n * 256;
      var py = (1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2 * n * 256;
      var tx = Math.floor(px / 256), ty = Math.floor(py / 256);
      var x0 = tx - 1, y0 = (py - ty * 256) < 128 ? ty - 1 : ty;
      var grid = document.createElement('div');
      grid.className = 'iui-photo-map-grid';
      grid.style.left = 'calc(50% - ' + Math.round(px - x0 * 256) + 'px)';
      grid.style.top = 'calc(50% - ' + Math.round(py - y0 * 256) + 'px)';
      for (var j = 0; j < 2; j++) {
        for (var i = 0; i < 3; i++) {
          var t = document.createElement('img');
          t.alt = '';
          t.decoding = 'async';
          t.loading = 'lazy';
          t.referrerPolicy = 'no-referrer';
          t.style.left = (i * 256) + 'px';
          t.style.top = (j * 256) + 'px';
          t.onerror = function () { this.style.visibility = 'hidden'; };
          t.src = tileUrl(((x0 + i) % n + n) % n, y0 + j, z, inChina);
          grid.appendChild(t);
        }
      }
      box.appendChild(grid);
      box.setAttribute('data-iui-map-tiles', NET.tiles === 'amap' && inChina ? 'amap' : inChina ? 'osm' : 'esri');
      var attr = document.createElement('span');
      attr.className = 'iui-photo-map-attr';
      attr.textContent = NET.tiles === 'amap' && inChina ? '© 高德地图' : inChina ? '© OpenStreetMap' : '© Esri';
      box.appendChild(attr);
    }
    var label = document.createElement('div');
    label.className = 'iui-photo-map-label';
    label.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + ICONS.pin + '</svg>';
    if (name) {
      var nm = document.createElement('span');
      nm.textContent = name.slice(0, 40);
      label.appendChild(nm);
    }
    box.appendChild(label);
    ph.appendChild(box);
    ph.setAttribute('data-iui-photo-map', c ? '1' : '0');
  }
  function wireImage(img, photo, card, info, placeLabel, coords, allowNetworkFallback) {
    if (!img || !info || !info.url) return;
    var srcNow = img.getAttribute('src') || '';
    if (img.getAttribute('data-iui-photo-wired') === '1' && srcNow && img.getAttribute('data-iui-photo-wired-src') === srcNow) {
      ensureCredit(card, info, placeLabel);
      return;
    }
    img.setAttribute('data-iui-photo-wired', '1');
    img.setAttribute('data-iui-photo-wired-src', srcNow);
    img.setAttribute('data-iui-photo-host', '1');
    img.loading = 'eager';
    try { img.decoding = 'async'; } catch (e) {}
    img.alt = String(placeLabel || img.alt || 'destination').trim() || 'destination';
    if (photo) photo.style.backgroundImage = '';
    var attempt = 0;
    function apply(url) {
      attempt++;
      img.setAttribute('data-iui-photo-attempt', String(attempt));
      img.src = url;
      img.setAttribute('data-iui-photo-wired-src', url);
    }
    function onBroken() {
      if (img.getAttribute('data-iui-photo-recovering') === '1' || photo.getAttribute('data-iui-photo-final') === '1') return;
      img.setAttribute('data-iui-photo-recovering', '1');
      if (attempt < 2) {
        setTimeout(function () {
          img.removeAttribute('data-iui-photo-recovering');
          apply(info.url + (info.url.indexOf('?') >= 0 ? '&' : '?') + 'iui_retry=' + attempt);
        }, 200);
        return;
      }
      if (!allowNetworkFallback) {
        img.removeAttribute('data-iui-photo-recovering');
        giveUp(photo, img);
        return;
      }
      allowNetworkFallback = false;
      resolveNetwork(placeLabel, coords, function (net) {
        img.removeAttribute('data-iui-photo-recovering');
        if (!net || !net.url || net.url === info.url) { giveUp(photo, img); return; }
        info = net;
        attempt = 0;
        ensureCredit(card, net, placeLabel);
        apply(net.url);
      });
    }
    img.addEventListener('error', onBroken);
    apply(info.url);
    setTimeout(function () { if (img.getAttribute('src') && img.complete && img.naturalWidth === 0) onBroken(); }, 900);
    setTimeout(function () { if (img.getAttribute('src') && img.complete && img.naturalWidth === 0) onBroken(); }, 2200);
    ensureCredit(card, info, placeLabel);
  }
  function srcLooksAuthorOwned(img) {
    var src = String((img && img.getAttribute && img.getAttribute('src')) || '').trim();
    if (!src || src === '#' || src.indexOf('javascript:') === 0) return false;
    var marked = img.getAttribute('data-iui-photo-wired-src') || '';
    if (marked && marked !== src) {
      try {
        img.removeAttribute('data-iui-photo-host');
        img.removeAttribute('data-iui-photo-wired');
        img.removeAttribute('data-iui-photo-wired-src');
        img.removeAttribute('data-iui-photo-recovering');
        img.removeAttribute('data-iui-photo-attempt');
      } catch (eDrop) {}
    }
    // Broken decode → host may refill. Loading or healthy → author src is truth.
    if (img.complete && img.naturalWidth === 0) return false;
    return true;
  }
  function fillCard(card) {
    if (!card || card.nodeType !== 1) return false;
    if (card.matches && card.matches('img')) {
      card = card.closest(CARD_SEL + ', [data-iui-place]') || card.parentElement;
      if (!card) return false;
    }
    var candidates = placeCandidates(card);
    if (!candidates.length) return false;
    var photo = card.querySelector('.photo') || card.querySelector('.cover');
    if (!photo) {
      photo = document.createElement('div');
      photo.className = 'photo';
      card.insertBefore(photo, card.firstChild);
    }
    // F3: skip the map-card tiles drawn inside the placeholder.
    var img = null;
    var imgs = photo.getElementsByTagName('img');
    for (var q = 0; q < imgs.length; q++) {
      if (!(imgs[q].closest && imgs[q].closest('.iui-photo-ph'))) { img = imgs[q]; break; }
    }
    if (!img) {
      img = document.createElement('img');
      photo.appendChild(img);
    }
    // Author already pointed this img at a URL (gallery next/prev, explicit Wikimedia).
    // Never overwrite from data-iui-place — that is what made next look dead.
    // F3: Wikimedia known-unreachable → an author-pointed Wikimedia URL can only fail.
    var deadWiki = NET.wiki === false && /(^|[\/.])(wikimedia|wikipedia)\.org\//i.test(String(img.getAttribute('src') || ''));
    if (deadWiki) { try { img.removeAttribute('src'); } catch (eW) {} }
    if (!deadWiki && srcLooksAuthorOwned(img)) {
      if (img.complete && img.naturalWidth > 0) img.setAttribute('data-iui-photo-ok', '1');
      if (photo.hasAttribute('data-iui-photo-state') && !(photo.getAttribute('data-iui-photo-final') === '1' && !(img.naturalWidth > 0))) setState(photo, 'photo');
      return true;
    }
    ensurePlaceholder(photo, card);
    if (photo.getAttribute('data-iui-photo-final') === '1') { setState(photo, 'placeholder'); return true; }
    if (photo.getAttribute('data-iui-photo-state') !== 'photo') setState(photo, 'loading');
    // Rebuilt cards clone the host-fill flag onto a new img with empty src.
    if (img.getAttribute('data-iui-photo-host') === '1' && (!img.getAttribute('src') || (img.complete && img.naturalWidth === 0))) {
      img.removeAttribute('data-iui-photo-host');
      img.removeAttribute('data-iui-photo-recovering');
      img.removeAttribute('data-iui-photo-attempt');
      card.removeAttribute('data-iui-photo-net');
    }
    if (img.getAttribute('data-iui-photo-host') === '1' && img.naturalWidth > 0 && img.complete) return true;
    if (NET.wiki === false) { giveUp(photo, img); return true; }
    var coords = cardCoords(card);
    for (var i = 0; i < candidates.length; i++) {
      var known = lookupKnown(candidates[i]);
      if (known) {
        wireImage(img, photo, card, known, candidates[i], coords, true);
        return true;
      }
    }
    if (card.getAttribute('data-iui-photo-net') === '1') return false;
    card.setAttribute('data-iui-photo-net', '1');
    var ci = 0;
    function tryNext() {
      if (ci >= candidates.length) { giveUp(photo, img); return; }
      var label = candidates[ci++];
      resolveNetwork(label, coords, function (net) {
        if (net) wireImage(img, photo, card, net, label, coords, false);
        else tryNext();
      });
    }
    tryNext();
    return true;
  }
  function run() {
    var cards = document.querySelectorAll(CARD_SEL);
    var filled = 0;
    for (var i = 0; i < cards.length; i++) {
      try { if (fillCard(cards[i])) filled++; } catch (e) {}
    }
    var loose = document.querySelectorAll('[data-iui-place]');
    for (var j = 0; j < loose.length; j++) {
      var el = loose[j];
      if (el.closest && el.closest(CARD_SEL)) continue;
      try { if (fillCard(el)) filled++; } catch (e) {}
    }
    try { sanitizeCredits(); } catch (eC) {}
    if (filled > 0) {
      try {
        if (window.iuiSandbox && window.iuiSandbox.measure) window.iuiSandbox.measure();
      } catch (e) {}
    }
  }
  function onImgEvent(ev) {
    var t = ev.target;
    if (!t || t.tagName !== 'IMG') return;
    var p = t.parentElement;
    if (ev.type === 'load' && t.naturalWidth > 0) {
      t.setAttribute('data-iui-photo-ok', '1');
      if (p && p.hasAttribute('data-iui-photo-state')) { setState(p, 'photo'); p.removeAttribute('data-iui-photo-final'); }
    } else if (ev.type === 'error') {
      t.removeAttribute('data-iui-photo-ok');
    }
  }
  function installStyle() {
    if (document.getElementById('iui-photo-ph-style')) return;
    var st = document.createElement('style');
    st.id = 'iui-photo-ph-style';
    st.textContent = '[data-iui-photo-state]{position:relative}'
      + '.iui-photo-ph{position:absolute;inset:0;z-index:0;display:flex;align-items:center;justify-content:center;pointer-events:none;'
      + 'color:var(--accent,var(--color-text-info,#2563eb));background:var(--color-background-secondary,#f3f4f6);'
      + 'background:linear-gradient(135deg,color-mix(in srgb,var(--accent,var(--color-text-info,#2563eb)) 20%,var(--color-background-secondary,#f3f4f6)),color-mix(in srgb,var(--accent,var(--color-text-info,#2563eb)) 5%,var(--color-background-secondary,#f3f4f6)))}'
      + '.iui-photo-ph svg{width:30px;height:30px;opacity:.8}'
      + '[data-iui-photo-state="loading"] .iui-photo-ph svg{animation:iuiPhPulse 1.4s ease-in-out infinite}'
      + '@keyframes iuiPhPulse{50%{opacity:.35}}'
      + '[data-iui-photo-state]>img{position:relative;z-index:1}'
      + '[data-iui-photo-state]>img:not([data-iui-photo-ok]){opacity:0}'
      + '[data-iui-photo-state="photo"]>.iui-photo-ph{display:none}'
      + '.iui-photo-ph[data-iui-photo-map]>svg{display:none}'
      + '.iui-photo-map{position:absolute;inset:0;overflow:hidden}'
      + '.iui-photo-map-grid{position:absolute;width:768px;height:512px}'
      + '.iui-photo-map-grid img{position:absolute!important;width:256px!important;height:256px!important;max-width:none!important;max-height:none!important;min-width:0!important;object-fit:fill!important;margin:0!important;padding:0!important;border:0!important;border-radius:0!important;transform:none!important;display:block!important;filter:saturate(.75) contrast(.95);opacity:.9}'
      + '.iui-photo-map::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,transparent 35%,color-mix(in srgb,var(--color-background-primary,#fff) 70%,transparent))}'
      + '.iui-photo-map-label{position:absolute;left:50%;top:50%;z-index:1;transform:translate(-50%,-100%);display:flex;flex-direction:column;align-items:center;gap:2px;color:var(--accent,var(--color-text-info,#2563eb))}'
      + '.iui-photo-map-label svg{width:30px;height:30px;fill:var(--color-background-primary,#fff);filter:drop-shadow(0 1px 2px rgba(0,0,0,.35))}'
      + '.iui-photo-map-label span{position:absolute;top:100%;margin-top:4px;white-space:nowrap;max-width:220px;overflow:hidden;text-overflow:ellipsis;font:600 12px/1.3 system-ui,sans-serif;color:var(--color-text-primary,#111);background:color-mix(in srgb,var(--color-background-primary,#fff) 88%,transparent);padding:2px 8px;border-radius:999px;box-shadow:0 1px 3px rgba(0,0,0,.18)}'
      + '.iui-photo-map-attr{position:absolute;right:4px;bottom:2px;z-index:1;font:10px/1.2 system-ui,sans-serif;color:var(--color-text-secondary,#555);opacity:.85}'
      + '[data-iui-scheme="dark"] .iui-photo-map-grid img{filter:brightness(.6) saturate(.6) contrast(1.1)}'
      + '@media (prefers-reduced-motion:reduce){.iui-photo-ph svg{animation:none!important}}';
    (document.head || document.documentElement).appendChild(st);
  }
  function watch() {
    installStyle();
    try {
      document.addEventListener('load', onImgEvent, true);
      document.addEventListener('error', onImgEvent, true);
    } catch (eL) {}
    run();
    try {
      var root = document.getElementById('iui-preview-root') || document.body;
      if (root && !root.__iuiPhotoObs) {
        var obsTimer = null;
        var obs = new MutationObserver(function () {
          if (obsTimer) return;
          obsTimer = setTimeout(function () { obsTimer = null; run(); }, 48);
        });
        obs.observe(root, { childList: true, subtree: true });
        root.__iuiPhotoObs = obs;
      }
    } catch (e) {}
    try {
      window.iuiSandbox = window.iuiSandbox || {};
      window.iuiSandbox.fillPhotos = run;
      window.iuiSandbox.setCredit = function (el, href, label) {
        return setCreditLink(el, href, label);
      };
    } catch (e2) {}
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watch);
  else watch();
  window.addEventListener('load', function () { setTimeout(run, 80); setTimeout(run, 400); setTimeout(run, 1200); });
`

/** Serialize well-known table for tests / docs. */
export function listWellKnownStopKeys(): string[] {
  return Object.keys(WELL_KNOWN_STOPS).sort()
}

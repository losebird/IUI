/**
 * Trip / destination photos — OpenIntelligentUI get_trip_stop_images parity.
 *
 * Layers:
 * 1. WELL_KNOWN_STOPS — baked Commons URLs (host fill + tool fallback)
 * 2. fetchWikipediaTripImage — Node Wikipedia REST + Commons attribution (tool)
 * 3. enrichItineraryHtml — static HTML rewrite before srcdoc
 * 4. buildTripPhotoFillScript — runtime fill after author JS creates cards
 */
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
  // —— California coast (OIU reference) ——
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

/** Resolve a place name against WELL_KNOWN_STOPS (exact + contains). */
export function lookupKnownStop(place: string): TripStopImage | null {
  const key = normalizePlaceKey(place)
  if (!key) return null
  const direct = WELL_KNOWN_STOPS[key]
  if (direct) return knownToAvailable(place, direct)
  // contains: prefer longer keys
  const keys = Object.keys(WELL_KNOWN_STOPS).sort((a, b) => b.length - a.length)
  for (const k of keys) {
    if (key.includes(k) || k.includes(key)) {
      return knownToAvailable(place, WELL_KNOWN_STOPS[k]!)
    }
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

/** Fetch one destination photo via Wikipedia REST + Commons attribution (Node). */
export async function fetchWikipediaTripImage(
  title: string,
  options: { signal?: AbortSignal; fetchImpl?: typeof fetch } = {},
): Promise<TripStopImage> {
  const place = title.trim()
  if (!place || place.length > 160) {
    return { status: 'unavailable', place, reason: 'Invalid Wikipedia title.' }
  }
  const known = lookupKnownStop(place)
  // Prefer network for precise titles; fall back to well-known on failure.
  const fetchImpl = options.fetchImpl ?? globalThis.fetch
  if (typeof fetchImpl !== 'function') {
    return known ?? { status: 'unavailable', place, reason: 'No fetch available.' }
  }
  try {
    const summaryUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(place)}`
    const summaryInit: RequestInit = {
      headers: { 'User-Agent': WIKI_UA, Accept: 'application/json' },
    }
    if (options.signal) summaryInit.signal = options.signal
    const summaryRes = await fetchImpl(summaryUrl, summaryInit)
    if (!summaryRes.ok) throw new Error(`summary ${summaryRes.status}`)
    const data = (await summaryRes.json()) as {
      thumbnail?: { source?: string }
      originalimage?: { source?: string }
      content_urls?: { desktop?: { page?: string } }
    }
    const image = data.thumbnail?.source ?? ''
    const original = data.originalimage?.source ?? image
    for (const url of [image, original]) {
      if (!url) continue
      const host = new URL(url).hostname
      if (!IMAGE_HOSTS.has(host)) throw new Error('unsupported image host')
    }
    if (!image) throw new Error('no thumbnail')
    const filename = commonsFilenameFromUrl(original) ?? commonsFilenameFromUrl(image)
    if (!filename) throw new Error('not commons-backed')
    const metaInit: RequestInit = {
      headers: { 'User-Agent': WIKI_UA, Accept: 'application/json' },
    }
    if (options.signal) metaInit.signal = options.signal
    const metaRes = await fetchImpl(
      `https://commons.wikimedia.org/w/api.php?${new URLSearchParams({
        action: 'query',
        format: 'json',
        prop: 'imageinfo',
        iiprop: 'extmetadata',
        titles: `File:${filename}`,
        origin: '*',
      }).toString()}`,
      metaInit,
    )
    if (!metaRes.ok) throw new Error(`commons ${metaRes.status}`)
    const metaJson = (await metaRes.json()) as {
      query?: { pages?: Record<string, { imageinfo?: Array<{ extmetadata?: Record<string, { value?: string }> }> }> }
    }
    const pages = metaJson.query?.pages ?? {}
    const info = Object.values(pages)[0]?.imageinfo?.[0]?.extmetadata ?? {}
    const artist = stripHtml(info.Artist?.value ?? '')
    const license = stripHtml(info.LicenseShortName?.value ?? '')
    if (!artist || !license || !(license.startsWith('CC') || license === 'Public domain')) {
      throw new Error('attribution unavailable')
    }
    return {
      status: 'available',
      place,
      image_url: image,
      artist,
      license,
      credit_url: commonsFilePageUrl(filename),
      article_url: data.content_urls?.desktop?.page
        ?? `https://en.wikipedia.org/wiki/${encodeURIComponent(place.replace(/ /g, '_'))}`,
      note: 'Photo from this Wikipedia article; confirm the pictured subject fits the destination. It is not a live camera view.',
      source: 'wikipedia',
    }
  } catch {
    return known ?? {
      status: 'unavailable',
      place,
      reason: 'The photo source or reusable attribution could not be retrieved. Use a text card or host well-known fill for this stop.',
    }
  }
}

/** Resolve 1–8 titles (tool entry). Well-known first for speed, then Wikipedia. */
/** Default Wikipedia/Commons fetch budget (P1-TOOL-TIMEOUT). */
export const TRIP_IMAGES_FETCH_TIMEOUT_MS = 8000

export async function resolveTripStopImages(
  titles: string[],
  options: { signal?: AbortSignal; fetchImpl?: typeof fetch; preferNetwork?: boolean; timeoutMs?: number } = {},
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
    titles.map(async (title) => {
      const trimmed = title.trim()
      if (!preferNetwork) {
        return lookupKnownStop(trimmed)
          ?? { status: 'unavailable' as const, place: trimmed, reason: 'No well-known photo.' }
      }
      // Parallel: try network; known used as soft fallback inside fetchWikipediaTripImage
      const fetchOpts: { signal?: AbortSignal; fetchImpl?: typeof fetch } = {}
      if (signal) fetchOpts.signal = signal
      if (options.fetchImpl) fetchOpts.fetchImpl = options.fetchImpl
      return fetchWikipediaTripImage(trimmed, fetchOpts)
    }),
  )
  return { source: 'Wikipedia / Wikimedia Commons (+ IUI well-known)', stops }
}

function escapeHtmlAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function creditHtml(img: TripStopImage): string {
  if (img.status !== 'available' || !img.artist || !img.license) return ''
  const href = img.credit_url ? escapeHtmlAttr(img.credit_url) : '#'
  return `<div class="iui-photo-credit"><a href="${href}" target="_blank" rel="noopener noreferrer">${escapeHtmlAttr(img.artist)}</a> · ${escapeHtmlAttr(img.license)} · Wikimedia</div>`
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
export function enrichPlaceMediaHtml(html: string): string {
  if (!html) return html
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

export function buildTripPhotoFillScript(): string {
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
  return `<script>
(function () {
  var MAP = ${json};
  function norm(s) {
    return String(s || '').replace(/[\\u3000\\s]+/g, ' ').replace(/[·•、,，.。!！?？:：;；"'「」『』【】\\[\\]()（）]/g, ' ').trim().toLowerCase();
  }
  function lookup(place) {
    var key = norm(place);
    if (!key) return null;
    if (MAP[key]) return MAP[key];
    var best = null, bestLen = 0;
    for (var k in MAP) {
      if (!Object.prototype.hasOwnProperty.call(MAP, k)) continue;
      if (key.indexOf(k) !== -1 || k.indexOf(key) !== -1) {
        if (k.length > bestLen) { best = MAP[k]; bestLen = k.length; }
      }
    }
    return best;
  }
  function ensureCredit(card, info) {
    if (card.querySelector('.iui-photo-credit')) return;
    var c = document.createElement('div');
    c.className = 'iui-photo-credit';
    var a = document.createElement('a');
    a.href = info.credit;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = info.artist;
    c.appendChild(a);
    c.appendChild(document.createTextNode(' · ' + info.license + ' · Wikimedia'));
    card.appendChild(c);
  }
  function fillCard(card) {
    var nameEl = card.querySelector('.name') || card.querySelector('[data-place]');
    var place = (nameEl && (nameEl.getAttribute('data-place') || nameEl.getAttribute('data-iui-place') || nameEl.textContent)) || card.getAttribute('data-place') || card.getAttribute('data-iui-place') || '';
    var info = lookup(place);
    if (!info) return false;
    var photo = card.querySelector('.photo') || card.querySelector('.cover');
    if (!photo) {
      photo = document.createElement('div');
      photo.className = 'photo';
      card.insertBefore(photo, card.firstChild);
    }
    var img = photo.querySelector('img');
    var src = img && img.getAttribute('src');
    var hasWiki = src && /wikimedia|commons\.wikimedia/i.test(src);
    if (!img) {
      img = document.createElement('img');
      img.loading = 'lazy';
      photo.appendChild(img);
    }
    // Prefer host well-known URL whenever missing/non-wiki OR already-broken wiki src.
    // Models often emit 404 Commons filenames; Special:FilePath then yields broken icons.
    var shouldForce = !hasWiki || img.getAttribute('data-iui-photo-host') === '1';
    if (shouldForce || !src) {
      img.setAttribute('data-iui-photo-host', '1');
      img.src = info.url;
      img.alt = String(place).trim() || 'destination';
      photo.style.backgroundImage = '';
    }
    (function (el, placeInfo) {
      function swap() {
        if (el.getAttribute('data-iui-photo-fallback') === '1' && el.getAttribute('src') === placeInfo.url) return;
        el.setAttribute('data-iui-photo-fallback', '1');
        el.setAttribute('data-iui-photo-host', '1');
        el.src = placeInfo.url;
      }
      el.addEventListener('error', swap);
      if (el.complete && el.naturalWidth === 0) swap();
      // Late decode failure / cached broken icon
      setTimeout(function () {
        if (el.naturalWidth === 0) swap();
      }, 1200);
    })(img, info);
    ensureCredit(card, info);
    return true;
  }
  function run() {
    var cards = document.querySelectorAll('.iui-stop-card, .iui-hotel-card, .iui-product-card, .iui-place-card, .iui-cover-card, [data-iui-place]');
    var filled = 0;
    for (var i = 0; i < cards.length; i++) {
      try { if (fillCard(cards[i])) filled++; } catch (e) {}
    }
    if (filled > 0) {
      try {
        if (window.iuiSandbox && window.iuiSandbox.measure) window.iuiSandbox.measure();
      } catch (e) {}
    }
  }
  function watch() {
    run();
    var n = 0;
    var t = setInterval(function () {
      run();
      if (++n > 40) clearInterval(t);
    }, 250);
    try {
      var root = document.getElementById('iui-preview-root') || document.body;
      var obs = new MutationObserver(function () { run(); });
      obs.observe(root, { childList: true, subtree: true });
      setTimeout(function () { try { obs.disconnect(); } catch (e) {} }, 12000);
    } catch (e) {}
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watch);
  else watch();
  window.addEventListener('load', function () { setTimeout(run, 80); setTimeout(run, 400); });
})();
<\/script>`
}

/** Serialize well-known table for tests / docs. */
export function listWellKnownStopKeys(): string[] {
  return Object.keys(WELL_KNOWN_STOPS).sort()
}

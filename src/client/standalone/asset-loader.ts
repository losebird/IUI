type StandaloneAssets = { __GenuiAssets__?: Record<string, unknown> }

/** 从启动代码预先载入的全局资源读取引擎。 */
export function loadGenuiAsset<T>(name: 'mermaid' | 'three' | 'echarts-core' | 'echarts-full'): Promise<T> {
  const key = name.replace(/-(\w)/g, (_match, character: string) => character.toUpperCase())
  const asset = (window as unknown as StandaloneAssets).__GenuiAssets__?.[key]
  if (asset === undefined) return Promise.reject(new Error(`standalone asset '${name}' was not preloaded`))
  return Promise.resolve(asset as T)
}

/**
 * Standalone builds have no plugin asset HTTP route. Callers that only need
 * a URL string (e.g. runtime-config fetch) get a relative stub; fetch will
 * fail soft and keep defaults (frameChannelMount stays true).
 */
export function assetUrl(file: string): string {
  return `./iui-assets/${file.replace(/^\/+/, '')}`
}

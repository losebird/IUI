/**
 * C10: 「连通性」— last connectivity probe from the plugin (jsDelivr /
 * npmmirror / unpkg / Wikipedia / Wikimedia / map tiles) with a re-check
 * button and preset advice. The probe itself runs on the plugin (Node) side.
 */
import { useEffect, useState } from 'react'
import { probeAdvice, type NetworkProbeSnapshot, type ProbeTargetId } from '../../shared/network-probe.ts'
import type { CdnPreset } from '../../shared/vendor-registry.ts'
import { DEFAULT_AUTO_CDN_ORDER } from '../../shared/vendor-registry.ts'
import { cdnOrderFromProbe, decideNetContext, type MapTilesSetting } from '../../shared/net-context.ts'
import { setNetworkProbeSnapshot } from '../runtime-config.ts'
import { assetUrl } from '../asset-loader.ts'
import { getRuntimeConfigSnapshot } from '../runtime-config.ts'
import styles from './IuiSettingsSection.module.css'

type LocaleT = (key: string) => string

const LABEL_KEY: Record<ProbeTargetId, string> = {
  jsdelivr: 'netProbe.jsdelivr',
  npmmirror: 'netProbe.npmmirror',
  unpkg: 'netProbe.unpkg',
  zstatic: 'netProbe.zstatic',
  staticfile: 'netProbe.staticfile',
  amap: 'netProbe.amap',
  wikipedia: 'netProbe.wikipedia',
  wikimedia: 'netProbe.wikimedia',
  tiles: 'netProbe.tiles',
}

function isSnapshot(v: unknown): v is NetworkProbeSnapshot {
  return !!v && typeof v === 'object' && typeof (v as NetworkProbeSnapshot).at === 'number' && Array.isArray((v as NetworkProbeSnapshot).results)
}

async function fetchProbe(refresh: boolean): Promise<NetworkProbeSnapshot | null> {
  const url = new URL(assetUrl('network-probe.json'), globalThis.location?.href ?? 'http://localhost/')
  if (refresh) url.searchParams.set('refresh', '1')
  const res = await fetch(url.href, { cache: 'no-store' })
  if (!res.ok) return null
  const data = await res.json() as { networkProbe?: unknown }
  return isSnapshot(data.networkProbe) ? data.networkProbe : null
}

export function NetworkProbeCard({ t, preset, mapTiles = 'auto', initial }: { t: LocaleT; preset: CdnPreset; mapTiles?: MapTilesSetting; initial?: NetworkProbeSnapshot | null }) {
  const [snap, setSnap] = useState<NetworkProbeSnapshot | null>(() => {
    if (initial !== undefined) return initial
    const fromConfig = (getRuntimeConfigSnapshot() as { networkProbe?: unknown }).networkProbe
    return isSnapshot(fromConfig) ? fromConfig : null
  })
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  const run = (refresh: boolean): void => {
    if (typeof fetch === 'undefined') return
    setBusy(true)
    setFailed(false)
    void fetchProbe(refresh)
      .then((s) => { if (s) { setSnap(s); setNetworkProbeSnapshot(s) } else setFailed(true) })
      .catch(() => setFailed(true))
      .finally(() => setBusy(false))
  }
  // First open without a cached result: ask the plugin (it probes once, ≤ 2 s).
  useEffect(() => { if (initial === undefined && snap === null) run(false) }, [])

  const advice = probeAdvice(snap, preset)
  // Batch F: what「自动」resolves to on this network.
  const ctx = decideNetContext(snap, mapTiles)
  const ranked = cdnOrderFromProbe(snap)
  const order = (snap ? ranked : [...DEFAULT_AUTO_CDN_ORDER]).map((id) => t(LABEL_KEY[id])).join(' → ') || t('netProbeDown')
  const when = snap ? new Date(snap.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''
  return (
    <div className={styles.switchCard} data-iui-network-probe={snap ? snap.results.filter((r) => r.ok).length + '/' + snap.results.length : busy ? 'busy' : 'none'}>
      <div className={styles.switchCopy}>
        <div className={styles.switchTitle}>{t('netProbeTitle')}</div>
        <p className={styles.switchHint}>
          {busy ? t('netProbeChecking') : failed ? t('netProbeFailed') : snap ? t('netProbeAt').replace('{time}', when) : t('netProbeNone')}
        </p>
        {snap && (
          <div className={styles.inlineActions}>
            {snap.results.map((r) => (
              <span key={r.id} data-iui-probe={r.id} data-ok={r.ok ? '1' : '0'}
                className={`${styles.healthChip} ${r.ok ? styles.healthOk : styles.healthBad}`}
              >
                {t(LABEL_KEY[r.id])} · {r.ok ? `${r.ms} ms` : t('netProbeDown')}
              </span>
            ))}
          </div>
        )}
        {snap && (
          <ul className={styles.switchHint} data-iui-net-auto={`${ctx.tiles}|${ctx.wiki ? 'wiki' : 'map'}|${ranked.join(',')}`} style={{ margin: '6px 0 0', paddingLeft: 18 }}>
            {preset === 'auto' && <li>{t('netAutoLibs').replace('{order}', order)}</li>}
            <li>{t('netAutoTiles').replace('{tiles}', t(ctx.tiles === 'amap' ? 'netAutoTilesAmap' : 'netAutoTilesDefault'))}</li>
            <li>{t('netAutoPhotos').replace('{photos}', t(ctx.wiki ? 'netAutoPhotosWiki' : 'netAutoPhotosMap'))}</li>
          </ul>
        )}
        {advice.map((a) => (
          <p key={a} className={a === 'switch-china' || a === 'switch-global' || a === 'cdn-all-down' ? styles.warn : styles.switchHint} data-iui-probe-advice={a}>
            {t(`netProbeAdvice.${a}`)}
          </p>
        ))}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
        <button type="button" className={styles.secondaryBtn} style={{ whiteSpace: 'nowrap' }} data-iui-probe-recheck="1" disabled={busy} onClick={() => run(true)}>
          {t('netProbeRecheck')}
        </button>
      </div>
    </div>
  )
}

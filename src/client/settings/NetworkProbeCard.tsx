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
import { ChromeIcon } from '../chrome/icons.tsx'
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
  models: 'netProbe.models',
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
  const okCount = snap ? snap.results.filter((r) => r.ok).length : 0
  const status = busy ? t('netProbeChecking') : failed ? t('netProbeFailed') : snap ? t('netProbeAt').replace('{time}', when) : t('netProbeNone')
  return (
    <div className={styles.probe} data-iui-network-probe={snap ? okCount + '/' + snap.results.length : busy ? 'busy' : 'none'}>
      <div className={styles.switchCard}>
        <div className={styles.switchCopy}>
          <div className={styles.switchTitle}>{t('netProbeTitle')}</div>
          <p className={styles.switchHint}>
            {status}
            {snap && !busy ? ` · ${t('netProbeSummary').replace('{ok}', String(okCount)).replace('{total}', String(snap.results.length))}` : ''}
          </p>
        </div>
        <div className={styles.rowControl}>
          <button type="button" className={styles.secondaryBtn} data-iui-probe-recheck="1" disabled={busy} onClick={() => run(true)}>
            <ChromeIcon name={busy ? 'loader-circle' : 'refresh-cw'} size={13} />
            {t('netProbeRecheck')}
          </button>
        </div>
      </div>
      {(snap || advice.length > 0) && (
        <div className={styles.probeBody}>
          {snap && (
            <div className={styles.probeGrid}>
              {snap.results.map((r) => (
                <span key={r.id} data-iui-probe={r.id} data-ok={r.ok ? '1' : '0'} className={styles.probeCell}>
                  <i className={`${styles.probeDot} ${r.ok ? (r.ms > 1000 ? styles.probeSlow : styles.probeOk) : styles.probeBad}`} aria-hidden="true" />
                  <span className={styles.probeName}>{t(LABEL_KEY[r.id])}</span>
                  <span className={styles.probeMs}>{r.ok ? `${r.ms} ms` : t('netProbeDown')}</span>
                </span>
              ))}
            </div>
          )}
          {snap && (
            <ul className={styles.probeNotes} data-iui-net-auto={`${ctx.tiles}|${ctx.wiki ? 'wiki' : 'map'}|${ranked.join(',')}`}>
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
      )}
    </div>
  )
}

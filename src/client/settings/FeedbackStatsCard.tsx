/**
 * G16: 「反馈统计」— local 👍/👎 + self-check counts, with an explicit-consent
 * anonymous export (JSON download) and a clear button. Nothing is uploaded.
 */
import { useEffect, useState } from 'react'
import { clearFeedback, exportFeedback, subscribeFeedback, summarizeFeedback, type FeedbackSummary } from '../feedback-store.ts'
import { currentLocale } from '../i18n/index.ts'
import { IUI_VERSION } from '../../shared/version.ts'
import styles from './IuiSettingsSection.module.css'

type LocaleT = (key: string) => string

function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in values ? String(values[k]) : m))
}

/** One-line digest, e.g. "12 pages · 👍 5 · 👎 2 · 3 with layout issues". */
export function feedbackDigest(t: LocaleT, s: FeedbackSummary): string {
  if (s.pages === 0) return t('feedbackEmpty')
  return fill(t('feedbackDigest'), { pages: s.pages, up: s.up, down: s.down, serious: s.pagesWithSerious })
}

export function FeedbackStatsCard({ t }: { t: LocaleT }) {
  const [summary, setSummary] = useState<FeedbackSummary>(() => summarizeFeedback())
  const [consent, setConsent] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  useEffect(() => subscribeFeedback(() => setSummary(summarizeFeedback())), [])

  const topChecks = Object.entries(summary.checks).sort((a, b) => b[1] - a[1]).slice(0, 3)
  const topReasons = Object.entries(summary.reasons).sort((a, b) => b[1] - a[1]).slice(0, 3)

  const download = (): void => {
    try {
      const json = exportFeedback({ version: IUI_VERSION, locale: currentLocale() })
      const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }))
      const a = document.createElement('a')
      a.href = url
      a.download = `iui-feedback-${new Date().toISOString().slice(0, 10)}.json`
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 4000)
      setNotice(t('feedbackExported'))
    } catch {
      setNotice(t('feedbackExportFailed'))
    }
  }

  return (
    <div className={styles.switchCard} data-iui-feedback-stats={summary.pages}>
      <div className={styles.switchCopy}>
        <div className={styles.switchTitle}>{t('feedbackStats')}</div>
        <p className={styles.switchHint}>{notice ?? feedbackDigest(t, summary)}</p>
        {(topChecks.length > 0 || topReasons.length > 0) && (
          <p className={styles.switchHint}>
            {topReasons.map(([k, n]) => `${t(`feedbackReason.${k}`)} ${n}`).concat(
              topChecks.map(([k, n]) => `${t(`feedbackCheck.${k}`)} ${n}`),
            ).join(' · ')}
          </p>
        )}
        <p className={styles.switchHint}>{t('feedbackPrivacy')}</p>
        <label className={styles.switchHint} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
          <input type="checkbox" data-iui-feedback-consent="1" checked={consent} onChange={(e) => setConsent(e.currentTarget.checked)} />
          {t('feedbackConsent')}
        </label>
      </div>
      <div className={styles.rowControl}>
        <button type="button" className={styles.secondaryBtn} data-iui-feedback-export="1"
          disabled={!consent || summary.pages === 0} onClick={download}
        >
          {t('feedbackExport')}
        </button>
        <button type="button" className={styles.secondaryBtn} data-iui-feedback-clear="1"
          disabled={summary.pages === 0}
          onClick={() => { clearFeedback(); setNotice(t('feedbackCleared')) }}
        >
          {t('feedbackClear')}
        </button>
      </div>
    </div>
  )
}

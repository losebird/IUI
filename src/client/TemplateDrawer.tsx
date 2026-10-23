/**
 * TemplateDrawer — sandbox-first template center.
 * Catalog GenuiBlock previews removed (P1-DEAD-SURFACE); starters insert ```iui-html prompts.
 */
import { useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { genuiTemplates, TEMPLATE_CATEGORIES, categoryLabelKey, type GenuiTemplate, type TemplateCategory } from './templates.ts'
import { currentLocale, useLocaleRevision, useT } from './i18n/index.ts'
import { listHtmlSandboxStarters } from '../shared/html-sandbox.ts'
import { deleteUserTemplate, getUserTemplates, subscribeUserTemplates } from './user-template-store.ts'
import { userTemplatePrompt, type UserTemplate } from './settings/user-templates.ts'
import { writeIuiConfigField } from './settings/index.ts'
import { ChromeIcon } from './chrome/icons.tsx'
import css from './TemplateDrawer.module.css'

export interface TemplateDrawerProps {
  onUse: (instruction: string) => void
  /** Kept for API compatibility; the achievements tab was a dead entry (visual ⑪). */
  tab?: 'templates'
}

type ThumbKind = TemplateCategory | 'mine' | 'map' | 'table' | 'board' | 'cover' | 'calendar' | 'scene'

/** visual(⑪): which mini preview a built-in starter page gets. */
function starterThumb(id: string): ThumbKind {
  if (/itinerary|route|map/.test(id)) return 'map'
  if (/weather|chart/.test(id)) return 'chart'
  if (/pricing|compare/.test(id)) return 'data'
  if (/hotel|cover|gallery/.test(id)) return 'cover'
  if (/grid|sheet|table/.test(id)) return 'table'
  if (/mermaid|mindmap|flow/.test(id)) return 'flow'
  if (/scene|3d/.test(id)) return 'scene'
  if (/room|calendar|meeting/.test(id)) return 'calendar'
  if (/kanban|board/.test(id)) return 'board'
  return 'dashboard'
}

/** visual(⑪): a tiny drawn preview so cards are not plain text. Purely decorative. */
function TemplateThumb({ kind }: { kind: ThumbKind }) {
  const bars = (heights: number[], hot = -1) => heights.map((h, i) => <i key={i} className={i === hot ? css.tInk : undefined} style={{ height: `${h}%` }} />)
  let body
  switch (kind) {
    case 'dashboard':
      body = <span className={css.tDash}><span><i /><i /><i /></span><b /></span>
      break
    case 'data':
      body = <span className={css.tCols}><i /><i className={css.tOn} /><i /></span>
      break
    case 'flow':
      body = <span className={css.tFlow}><i className={css.tInk} /><i className={css.tInk} /><i /><i /><i /></span>
      break
    case 'chart':
      body = <span className={css.tBars}><s />{bars([30, 55, 40, 75, 50, 95], 5)}</span>
      break
    case 'quiz':
      body = <span className={css.tQuiz}><i /><i className={css.tOk} /><i /></span>
      break
    case 'interactive':
      body = <span className={css.tCtrl}><i /><b /><i /></span>
      break
    case 'mine':
    case 'map':
      body = <span className={css.tLine}><svg viewBox="0 0 60 30" aria-hidden="true"><path d="M4 24 L18 14 L30 19 L44 8 L56 12" /></svg><span><i /><i /><i /></span></span>
      break
    case 'table':
      body = <span className={css.tTable}>{Array.from({ length: 4 }, (_, i) => <i key={i} />)}</span>
      break
    case 'board':
      body = <span className={css.tCols}><i /><i /><i /></span>
      break
    case 'cover':
      body = <span className={css.tCover}><i /><i /><i /></span>
      break
    case 'calendar':
      body = <span className={css.tTable}>{Array.from({ length: 3 }, (_, i) => <i key={i} />)}</span>
      break
    default:
      body = <span className={css.tDash}><span><i /><i /></span><b /></span>
  }
  return <span className={css.thumb} aria-hidden="true" data-genui-template-thumb={kind}>{body}</span>
}

const CATEGORIES = ['all', 'mine', ...TEMPLATE_CATEGORIES] as const
type Category = TemplateCategory | 'all' | 'mine'

function copyText(text: string): Promise<void> {
  if (navigator.clipboard !== undefined) return navigator.clipboard.writeText(text)
  return new Promise((resolve, reject) => {
    try {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      ta.remove()
      resolve()
    } catch (error) {
      reject(error instanceof Error ? error : new Error(String(error)))
    }
  })
}

/** G13: every whitespace-separated term appears in one of the fields. */
export function templateMatches(q: string, ...fields: string[]): boolean {
  const hay = fields.join('\n').toLowerCase()
  return q.split(/\s+/).filter(Boolean).every(term => hay.includes(term))
}

export function TemplateDrawer({ onUse }: TemplateDrawerProps) {
  const t = useT()
  const localeRevision = useLocaleRevision()
  const [category, setCategory] = useState<Category>('all')
  // G13: free-text search across name / description / instruction.
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<GenuiTemplate | null>(null)
  // S6: 「我的模板」 (saved pages) — same list as Settings → IUI → 模板.
  const mineAll = useSyncExternalStore(subscribeUserTemplates, getUserTemplates, getUserTemplates)
  const [selectedMine, setSelectedMine] = useState<UserTemplate | null>(null)
  const [copied, setCopied] = useState(false)
  const timer = useRef(0)
  // F17: follow the plugin locale, not the browser language.
  const zh = currentLocale() === 'zh'

  const q = query.trim().toLowerCase()
  const mine = useMemo(() => {
    if (category !== 'all' && category !== 'mine') return []
    return q ? mineAll.filter(tpl => templateMatches(q, tpl.name, tpl.description ?? '', tpl.source ?? '', tpl.instruction ?? '')) : [...mineAll]
  }, [category, q, mineAll])

  const items = useMemo(() => {
    if (category === 'mine') return []
    const all = genuiTemplates()
    const inCat = category === 'all' ? [...all] : all.filter(tpl => tpl.category === category)
    return q ? inCat.filter(tpl => templateMatches(q, tpl.name, tpl.description, tpl.instruction)) : inCat
  }, [category, localeRevision, q])

  const starters = useMemo(() => {
    const all = listHtmlSandboxStarters()
    // Starters are free pages: they show under 全部 / 看板 and in search results.
    if (category !== 'all' && category !== 'dashboard') return []
    return q ? all.filter(s => templateMatches(q, s.title, s.summary, s.id)) : all
  }, [category, q])

  const copy = async (text: string): Promise<void> => {
    try {
      await copyText(text)
      setCopied(true)
      window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => setCopied(false), 1500)
    } catch { /* ignore */ }
  }

  return (
    <div className={css.wrap} data-genui-templates>
      <div className={css.bar}>
        <div className={css.cats} role="tablist" aria-label={t('tpl.categories.aria')}>
          {CATEGORIES.map(c => (
            <button
              key={c}
              type="button"
              role="tab"
              aria-selected={category === c}
              className={`${css.cat}${category === c ? ` ${css.catActive}` : ''}`}
              data-genui-template-cat={c}
              onClick={() => { setCategory(c); setSelected(null); setSelectedMine(null) }}
            >
              {t(categoryLabelKey(c))}
            </button>
          ))}
        </div>
        <label className={css.searchBox}>
          <ChromeIcon name="search" size={14} />
          <input
            type="search"
            className={css.search}
            data-genui-template-search
            value={query}
            placeholder={t('tpl.search')}
            aria-label={t('tpl.search')}
            onChange={(e) => { setQuery(e.target.value); setSelected(null); setSelectedMine(null) }}
          />
        </label>
      </div>
      <div className={css.list}>
        {category === 'mine' && mineAll.length === 0 && (
          <p className={css.empty} data-genui-template-mine-empty>{t('tpl.mine.empty')}</p>
        )}
        {items.length === 0 && starters.length === 0 && mine.length === 0 && !(category === 'mine' && mineAll.length === 0) && (
          <p className={css.empty} data-genui-template-empty>{t('tpl.noMatch')}</p>
        )}
        {mine.map(tpl => (
          <button
            key={`mine-${tpl.id}`}
            type="button"
            data-genui-template-mine={tpl.id}
            className={`${css.card}${selectedMine?.id === tpl.id ? ` ${css.cardActive}` : ''}`}
            onClick={() => { setSelected(null); setSelectedMine(prev => (prev?.id === tpl.id ? null : tpl)) }}
          >
            <TemplateThumb kind="mine" />
            <span className={css.cardHead}>
              <span className={css.cardName}>{tpl.name}</span>
              <span className={css.cardMeta}>{t('tpl.mine.badge')}</span>
            </span>
            <span className={css.cardDesc}>{tpl.description ?? (tpl.createdAt ? tpl.createdAt.slice(0, 10) : '')}</span>
          </button>
        ))}
        {items.map(tpl => (
          <button
            key={tpl.id}
            type="button"
            className={`${css.card}${selected?.id === tpl.id ? ` ${css.cardActive}` : ''}`}
            onClick={() => { setSelectedMine(null); setSelected(prev => (prev?.id === tpl.id ? null : tpl)) }}
          >
            <TemplateThumb kind={tpl.category} />
            <span className={css.cardHead}>
              <span className={css.cardName}>{tpl.name}</span>
              <span className={css.cardMeta}>{t(categoryLabelKey(tpl.category))}</span>
            </span>
            <span className={css.cardDesc}>{tpl.description}</span>
          </button>
        ))}
        {starters.map(s => (
          <button
            key={`starter-${s.id}`}
            type="button"
            className={`${css.card}${selected?.id === `starter:${s.id}` ? ` ${css.cardActive}` : ''}`}
            onClick={() => { setSelectedMine(null); setSelected({
              id: `starter:${s.id}`,
              name: s.title,
              description: s.summary,
              category: 'dashboard',
              instruction: `请用闭合的 \`\`\`iui-html 自由页实现：${s.title}（starter=${s.id}）。${s.summary}`,
              demo: { items: [] },
            }) }}
          >
            <TemplateThumb kind={starterThumb(s.id)} />
            <span className={css.cardHead}>
              <span className={css.cardName}>{s.title}</span>
              <span className={css.cardMeta}>{t('tpl.starter.badge')}</span>
            </span>
            <span className={css.cardDesc}>{s.summary}</span>
          </button>
        ))}
      </div>
      {selectedMine !== null && (
        <div className={css.detail} data-genui-template-preview="mine">
          <div className={css.toolbar}>
            <span className={css.toolbarTitle}>{selectedMine.name}</span>
            <button type="button" className={css.try} onClick={() => onUse(userTemplatePrompt(selectedMine, zh))}>
              {t('tpl.try')}
            </button>
            <button type="button" className={css.copy} onClick={() => void copy(userTemplatePrompt(selectedMine, zh))}>
              {copied ? t('tpl.copied') : t('tpl.copy')}
            </button>
            <button
              type="button"
              className={css.copy}
              data-genui-template-mine-delete={selectedMine.id}
              onClick={() => { void deleteUserTemplate(selectedMine.id, writeIuiConfigField); setSelectedMine(null) }}
            >
              {t('tpl.mine.delete')}
            </button>
          </div>
          <div className={css.preview}>
            <p className={css.previewDesc}>{t('tpl.mine.preview')}</p>
            <pre className={css.previewPre}>{(selectedMine.source ?? selectedMine.instruction ?? '').slice(0, 4000)}</pre>
          </div>
        </div>
      )}
      {selected !== null && (
        <div className={css.detail} data-genui-template-preview>
          <div className={css.toolbar}>
            <span className={css.toolbarTitle}>{selected.name}</span>
            <button type="button" className={css.try} onClick={() => onUse(selected.instruction)}>
              {t('tpl.try')}
            </button>
            <button type="button" className={css.copy} onClick={() => void copy(selected.instruction)}>
              {copied ? t('tpl.copied') : t('tpl.copy')}
            </button>
          </div>
          <div className={css.preview}>
            <p className={css.previewDesc}>{selected.description}</p>
            <pre className={css.previewPre}>{selected.instruction}</pre>
          </div>
        </div>
      )}
    </div>
  )
}

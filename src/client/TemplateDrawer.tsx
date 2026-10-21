/**
 * TemplateDrawer — sandbox-first template center.
 * Catalog GenuiBlock previews removed (P1-DEAD-SURFACE); starters insert ```iui-html prompts.
 */
import { useMemo, useRef, useState } from 'react'
import { genuiTemplates, TEMPLATE_CATEGORIES, categoryLabelKey, type GenuiTemplate, type TemplateCategory } from './templates.ts'
import { currentLocale, useLocaleRevision, useT } from './i18n/index.ts'
import { listHtmlSandboxStarters } from '../shared/html-sandbox.ts'
import css from './TemplateDrawer.module.css'

export interface TemplateDrawerProps {
  onUse: (instruction: string) => void
  tab: 'templates' | 'achievements'
}

const CATEGORIES = ['all', ...TEMPLATE_CATEGORIES] as const
type Category = TemplateCategory | 'all'

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

export function TemplateDrawer({ onUse, tab }: TemplateDrawerProps) {
  const t = useT()
  const localeRevision = useLocaleRevision()
  const [category, setCategory] = useState<Category>('all')
  // G13: free-text search across name / description / instruction.
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<GenuiTemplate | null>(null)
  const [copied, setCopied] = useState(false)
  const timer = useRef(0)
  // F17: follow the plugin locale, not the browser language.
  const zh = currentLocale() === 'zh'

  const q = query.trim().toLowerCase()
  const items = useMemo(() => {
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

  if (tab === 'achievements') {
    return (
      <div className={css.wrap} data-genui-templates="achievements">
        <div className={css.achievements} data-genui-achievements data-iui-legacy-catalog="1">
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: 'var(--dsw-alias-label-secondary, #374151)' }}>
            {zh
              ? '成就面板的目录组件卡已移除。继续用 ```iui-html 自由页即可。'
              : 'Achievement catalog cards removed. Keep using ```iui-html sandbox pages.'}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className={css.wrap} data-genui-templates>
      <div className={css.cats} role="tablist" aria-label={t('tpl.categories.aria')}>
        {CATEGORIES.map(c => (
          <button
            key={c}
            type="button"
            role="tab"
            aria-selected={category === c}
            className={`${css.cat}${category === c ? ` ${css.catActive}` : ''}`}
            onClick={() => { setCategory(c); setSelected(null) }}
          >
            {t(categoryLabelKey(c))}
          </button>
        ))}
      </div>
      <input
        type="search"
        className={css.search}
        data-genui-template-search
        value={query}
        placeholder={t('tpl.search')}
        aria-label={t('tpl.search')}
        onChange={(e) => { setQuery(e.target.value); setSelected(null) }}
      />
      <div className={css.list}>
        {items.length === 0 && starters.length === 0 && (
          <p className={css.empty} data-genui-template-empty>{t('tpl.noMatch')}</p>
        )}
        {items.map(tpl => (
          <button
            key={tpl.id}
            type="button"
            className={`${css.card}${selected?.id === tpl.id ? ` ${css.cardActive}` : ''}`}
            onClick={() => setSelected(prev => (prev?.id === tpl.id ? null : tpl))}
          >
            <span className={css.cardName}>{tpl.name}</span>
            <span className={css.cardMeta}>{t(categoryLabelKey(tpl.category))}</span>
            <span className={css.cardDesc}>{tpl.description}</span>
          </button>
        ))}
        {starters.map(s => (
          <button
            key={`starter-${s.id}`}
            type="button"
            className={`${css.card}${selected?.id === `starter:${s.id}` ? ` ${css.cardActive}` : ''}`}
            onClick={() => setSelected({
              id: `starter:${s.id}`,
              name: s.title,
              description: s.summary,
              category: 'dashboard',
              instruction: `请用闭合的 \`\`\`iui-html 自由页实现：${s.title}（starter=${s.id}）。${s.summary}`,
              demo: { items: [] },
            })}
          >
            <span className={css.cardName}>{s.title}</span>
            <span className={css.cardMeta}>iui-html</span>
            <span className={css.cardDesc}>{s.summary}</span>
          </button>
        ))}
      </div>
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
          <div className={css.preview} data-iui-legacy-catalog="1">
            <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: 'var(--dsw-alias-label-secondary, #374151)' }}>
              {zh
                ? '目录组件预览已移除。请用「试用」把指令插入输入框，模型会输出 ```iui-html 自由页。'
                : 'Catalog previews removed. Use Try to insert a prompt; the model emits ```iui-html sandbox pages.'}
            </p>
            <pre style={{ marginTop: 8, fontSize: 12, whiteSpace: 'pre-wrap', opacity: 0.85 }}>{selected.instruction}</pre>
          </div>
        </div>
      )}
    </div>
  )
}

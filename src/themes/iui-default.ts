import type { ThemePack } from '../config/types.ts'

/**
 * IUI Default theme for sandbox chrome.
 *
 * Visual intents:
 * - One soft outer shell; sections breathe with gap/hairlines, not nested bordered boxes
 * - Near-monochrome (ink / muted / wash); green accent for progress & success
 * - Primary CTA = solid ink pill; secondary = outlined pill
 * - Radius ~16px surfaces, pill controls; calm 4/8/12/16/20 spacing
 */
export const iuiDefaultTheme: ThemePack = {
  id: 'iui-default',
  label: 'IUI 柔和',
  description:
    '柔和外壳、单色墨、绿色强调、胶囊控件。',
  tokens: {
    /* Radius — soft product, not bubbly toy */
    '--dsl-g-radius-surface': '16px',
    /* 999px = pill for CONTROLS only (button / input / chip). Containers
       (table frame, media, tooltip, details, quiz options…) use
       var(--radius-box, var(--dsl-g-radius-sm)) so they never turn into ovals. */
    '--dsl-g-radius-control': '999px',
    '--dsl-g-radius-sm': '10px',
    '--dsl-g-radius-pill': '999px',

    /* Type — ChatGPT-like calm scale */
    '--dsl-g-font-hero': '32px',
    '--dsl-g-font-display': '24px',
    '--dsl-g-font-h1': '18px',
    '--dsl-g-font-h2': '16px',
    '--dsl-g-font-h3': '15px',
    '--dsl-g-font-body': '14px',
    '--dsl-g-font-title': '14px',
    '--dsl-g-font-meta': '12px',
    '--dsl-g-font-data': '13px',

    /* Spacing — 4 / 8 / 12 / 16 / 20 */
    '--dsl-g-gap-lg': '20px',
    '--dsl-g-gap-md': '16px',
    '--dsl-g-gap-sm': '10px',
    '--dsl-g-gap-xs': '6px',

    /* ChatGPT green accent (public Intelligent UI demos) */
    '--dsl-g-accent': '#10A37F',
    '--dsl-g-accent-2': '#1A7F64',
    '--dsl-g-ink': '#0D0D0D',
    '--dsl-g-success': '#10A37F',
    '--dsl-g-warning': '#D97706',
    '--dsl-g-danger': '#E24C4C',
    '--dsl-g-tint': '6%',
    '--dsl-g-tint-strong': '12%',

    /* Surfaces — whisper borders, almost no shadow */
    '--dsl-g-border-surface': 'rgba(0, 0, 0, 0.08)',
    '--dsl-g-border-subtle': 'rgba(0, 0, 0, 0.06)',
    '--dsl-g-wash': 'rgba(0, 0, 0, 0.03)',
    '--dsl-g-shadow-card': '0 1px 2px rgba(0, 0, 0, 0.04), 0 4px 16px rgba(0, 0, 0, 0.04)',
    '--dsl-g-shadow-hover': '0 2px 8px rgba(0, 0, 0, 0.06)',

    /* Component metrics */
    '--dsl-g-stat-accent-width': '0px',
    '--dsl-g-stat-padding': '14px 16px',
    '--dsl-g-progress-height': '6px',
    '--dsl-g-banner-weight': '600',
    '--dsl-g-banner-size': '15px',
    '--dsl-g-banner-border': '1px solid rgba(16, 163, 127, 0.18)',
    '--dsl-g-block-margin': '10px 0',

    /* Motion — soft product ease */
    '--dsl-g-ease': 'cubic-bezier(0.25, 1, 0.5, 1)',
    '--dsl-g-duration': '180ms',
    '--dsl-g-duration-slow': '320ms',
  },
  darkTokens: {
    '--dsl-g-accent': '#1FCB9A',
    '--dsl-g-accent-2': '#10A37F',
    '--dsl-g-ink': '#F5F5F5',
    '--dsl-g-border-surface': 'rgba(255, 255, 255, 0.12)',
    '--dsl-g-border-subtle': 'rgba(255, 255, 255, 0.08)',
    '--dsl-g-wash': 'rgba(255, 255, 255, 0.06)',
    '--dsl-g-shadow-card': '0 1px 2px rgba(0, 0, 0, 0.35)',
    '--dsl-g-shadow-hover': '0 2px 8px rgba(0, 0, 0, 0.4)',
  },
}

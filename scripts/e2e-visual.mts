#!/usr/bin/env node
/**
 * visual(⑥): superseded by scripts/dsh-visual.mts (`pnpm run test:dsh-visual`).
 *
 * This script used to inject the old `dsh-ui` component-gallery fence into the chat DOM and
 * assert on catalog components. The catalog renderer is gone (old fences now show the
 * 「目录组件卡已移除」 notice, F16), so those assertions could never pass again. The replacement
 * replays fixed conversations in a real `dsh web` and covers iui-html templates / state page,
 * iui-patch (ok + failed), svg, host KaTeX, Mermaid, ECharts, AG Grid, mindmap, 3D, the frame
 * chrome (toolbar / menu / appearance), exports (offline HTML, PNG), the template drawer, the
 * settings page and the legacy notice, each in light 688 / dark 688 / 390.
 *
 * Kept as a forwarder so old notes and muscle memory still work: arguments pass through.
 */
import { spawnSync } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'

const here = dirname(resolve(process.argv[1] ?? ''))
const r = spawnSync(process.execPath, [...process.execArgv, join(here, 'dsh-visual.mts'), ...process.argv.slice(2)], { stdio: 'inherit' })
process.exit(r.status ?? 1)

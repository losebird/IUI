目标版本：`0.13.0-iui.18`（沙箱优先 P0→P3；硬墙见 HARD-WALLS.md）。

# IUI Acceptance Checklist (`@losebird/iui`)

Product path: **dsh plugin only** — free HTML/CSS/JS via ```iui-html sandbox. No MCP Host product path. No catalog packs / DIL / Gateway.

Version under test: see `package.json` → `version` (target line for this doc: **0.13.0-iui.18**).

Use this as the gate before calling a build “demo-ready” or prep for npm publish.  
Check items with `[x]` only after evidence (log line, screenshot, or CI green).

---

## A. Install & mount (hard gate)

- [ ] Profile depends on `@losebird/iui` only for Intelligent UI (no MCP IUI Host, no second GenUI fighting the fence).
- [ ] `pnpm install && pnpm run build` produces `lib/index.js` + `lib/client.js`.
- [ ] Web console shows `[iui] client active; fence-channel=registry|dom` (or theme line).
- [ ] ```iui-html fence in an assistant bubble mounts sandbox iframe (not a raw code block).
- [ ] Alias ```dsh-ui still mounts (compat); legacy ```iui JSON degrades to sandbox or tip (no pack trees).
- [ ] Streaming: css-complete opens preview; html partial updates; js runs on final.
- [ ] Stage chrome shows placeholder → css → html → js without crashing the bubble.

## B. Settings & config (hard gate)

- [ ] Settings sidebar shows **IUI**.
- [ ] Default theme is **iui-default** (neutral sandbox theme; no pack picker).
- [ ] Save persists theme / fenceFeedback / formatReferee / templates / optional Jev / Structured Outputs.
- [ ] No Settings controls for pack / Gateway / DIL / instance-store / frames.sse (deleted in 0.13).
- [ ] Custom template: save → preview → insert into composer (clipboard fallback OK if host blocks).

## C. Decision / content fit (hard gate for demo)

- [ ] Visual ask「做个会动的排序可视化」→ ```iui-html sandbox (not bare Markdown list).
- [ ] Resource / weather / dashboard-style asks prefer ```iui-html.
- [ ] Fact-only asks (e.g. capital city) stay plain text.
- [ ] Format referee on: same-turn steer toward ```iui-html; does not spin host “retry 1/5” loops.
- [ ] No leftover catalog-card UI from a previous turn.

## D. Presentation & UX (sandbox)

- [ ] Shared theme CSS + DS kit classes inject into sandbox.
- [ ] CDN importmap allowlist holds (chart.js / d3 / three / leaflet as applicable).
- [ ] Size-cap / CSP failure shows clear error chrome, not a blank bubble.
- [ ] Bridge: `sendPrompt` / `openLink` (and `data-iui-send-prompt` / `data-iui-open-link`) work; illegal links rejected.
- [ ] Starters load (sort-viz / bento / particle / leaflet / echarts / ds-kit / …).
- [ ] ≥1 HD sandbox screenshot proof for a common intent.

## E. Automation (CI / local)

- [ ] `pnpm run smoke:fence` green (referee, sandbox, templates, format-router, structured-outputs, map-embed, …).
- [ ] `pnpm run smoke:fence-empty -- --url '<dsh URL>'` green when web is up.
- [ ] `pnpm run pack:dry` green (tarball size sane).
- [ ] `pnpm run e2e:session -- --url '<dsh URL>'` green when FreeLLMAPI quota allows.
- [ ] No `e2e:frame-store` / dil-schema / gateway compile gates (paths deleted).

## F. Publish prep (pre-npm only)

- [ ] `docs/PUBLISH.md` version target matches `package.json` (**0.13.0-iui.18**).
- [ ] CHANGELOG has an entry for this version.
- [ ] `ACCEPTANCE.md` + `HARD-WALLS.md` + `REDESIGN-SANDBOX-FIRST.zh-CN.md` included in package `files`.
- [ ] No `npm publish` until A–E hard gates pass on a clean profile install **and** Ace provides npm token.
- [ ] No merge to upstream main unless Ace explicitly says so. Rollback tag: `0.12.0-iui.46`.

## G. Explicit non-goals / honest gaps (do **not** check as done)

- **Not** logits / grammar constrained decoding — soft prompt/steer ≠ sampling constraint.
- Weak free models may still Markdown first; referee/rescue mitigate, do not guarantee first-token fence.
- MCP alone has no renderer — cannot be the product path.
- Sandbox is CSP/CDN-limited, not a full IDE / CopilotKit twin.
- No catalog packs / DIL / Gateway / instance-store / frames (hard-deleted in 0.13).
- Full model→fence→action host e2e with live credentials is ambient QA when quota allows.

---

## Quick commands

```bash
pnpm install && pnpm run build
pnpm run smoke:fence
pnpm run pack:dry
bash scripts/sync-to-dsh-profile.sh
# after dsh web is up:
pnpm run smoke:fence-empty -- --url 'http://127.0.0.1:3080/?token=…'
pnpm run e2e:session -- --url 'http://127.0.0.1:3080/?token=…'
```

Installer: [INSTALL.md](./INSTALL.md). Publish: [PUBLISH.md](./PUBLISH.md). Walls: [HARD-WALLS.md](./HARD-WALLS.md). Remodel: [REDESIGN-SANDBOX-FIRST.zh-CN.md](./REDESIGN-SANDBOX-FIRST.zh-CN.md).

## Evidence log (0.13.0-iui.18)

- Target version: **0.13.0-iui.18** (`package.json` + CHANGELOG).
- Scope: P0 hard-delete packs/DIL/Gateway/whitelist-gate/weak-model hard guarantees; P1 streaming contract; P2 sendPrompt/openLink; P3 starters + HD shots.
- `src/packs` absent; default fence `iui-html`; default theme `iui-default`.
- **Ace hard-refresh acceptance pending** (this checklist).
- **npm publish not run** (no npm token / Ace go-ahead).

# IUI — Intelligent UI for DeepSeek Harness

**English** · [简体中文](./README.zh-CN.md)

**IUI** (`@losebird/iui`) is a **dsh plugin**. It turns a normal chat reply into a **bubble-native, free-form HTML/CSS/JS page** — charts, maps, itineraries, pricing boards, little tools — rendered inside an isolated iframe, not as a separate app and not as a catalog of fixed components.

| | |
|---|---|
| **Version** | `0.13.0-iui.18` (sandbox-first) |
| **Shape** | dsh plugin only — **not** an MCP product |
| **Fence** | `` ```iui-html `` (stream: css → html → js) |
| **License** | MIT (fork lineage from [`omdsh-dev/dsh-genui`](https://github.com/omdsh-dev/dsh-genui)) |

> **Repo note.** This GitHub project ([losebird/IUI](https://github.com/losebird/IUI)) previously hosted an MCP / catalog stack. That content was cleared and replaced with the IUI plugin. The package name stays `@losebird/iui`; the product path is the plugin sandbox, not “install an MCP and you’re done.”

---

## What you get

Ask something visual — *“plan a three-day coastal trip”*, *“compare these three plans”*, *“show rainfall for the week”* — and the model can answer with a **living page** inside the assistant bubble:

- **Free HTML/CSS/JS** in a sandboxed iframe (no same-origin; CSP + size caps)
- **Streaming mount** — placeholder → CSS preview → HTML → JS final
- **Shared design system** injected into every sandbox (theme tokens, typography, trip/pricing/map helpers inspired by OpenIntelligentUI patterns)
- **CDN allowlist** (jsDelivr, cdnjs, esm.sh, unpkg over HTTPS) + import map for common libs (Chart.js, D3, Three, Leaflet, …)
- **Host bridges** — `sendPrompt`, `openLink`, resize / ready / error
- **Trip & place images** — Wikimedia-backed tools / enrich for stop cards and covers
- **Soft guidance only** — system prompt, pre-step, steer, stream hints; no sampling hard-card in the plugin

**Not in 0.13:** component pack catalogs, DIL compile, Gateway / IR / frames, whitelist-as-gate, weak-model hard guarantees. Those paths were removed on purpose so the product stays one clear story: **model writes a page → plugin sandboxes it.**

---

## How it works

```
You ask something visual
  → dsh (unchanged) + your model
  → IUI soft constraints (prompt / steer / stream hints)
  → model emits a closed ```iui-html fence
  → client parses the fence as it streams
       1. optional placeholder chrome
       2. css complete → shared theme + author CSS → preview iframe
       3. html streams → preview updates
       4. js runs in the final sandboxed iframe
  → iframe ↔ host (resize, sendPrompt, openLink, theme)
```

Mount works on stock dsh builds: **fence-registry** when the host exposes it, otherwise a **DOM MutationObserver** channel. Either way you should see:

```text
[iui] client active; fence-channel=registry|dom
```

---

## Install

**Requirements:** DeepSeek Harness `dsh` on PATH (or `npx @deepseek-ai/dsh` / `pnpm dsh` from a harness checkout), Node `^22.19 || >=24`, a working web profile.

You do **not** need to clone this repository first. `dsh plugin add` fetches the package into the profile.

### Recommended: GitHub into a profile

```bash
dsh plugin --profile <profile> add github:losebird/IUI
dsh web   # or: dsh --profile <profile>
```

Replace `<profile>` with the profile you actually use (often `web`). If you started the UI with `npx` and have no `dsh` on PATH:

```bash
npx @deepseek-ai/dsh plugin --profile <profile> add github:losebird/IUI
npx @deepseek-ai/dsh web
```

From a DeepSeek Harness source checkout, prefix with `pnpm`:

```bash
pnpm dsh plugin --profile <profile> add github:losebird/IUI
```

This repository ships `lib/`, so a git install does not need a local build. Do **not** run `npm dsh` or `pnpm dsh` from your home directory. `npx` does not install a global `dsh` command.

Open the web URL **with the `?token=` from the start log**. Console should show `[iui] client active…`; Settings should list **IUI**.

### After npm publish

Once `@losebird/iui` is on the registry:

```bash
dsh plugin --profile <profile> add @losebird/iui
```

> **npm status.** First publish is still blocked: the `@losebird` npm org does not exist yet (registry returns *Scope not found*). Creating that org is a one-time step on [npmjs.com](https://www.npmjs.com/) — the CLI cannot create orgs. Until then, use the GitHub install above.

### Desktop / Electron profile

Some desktop hosts (DeepSeek Harness desktop, DSHEAC AIO, etc.) manage a profile exclusively and refuse CLI writes such as `dsh plugin add` (you may see `profile "desktop" is managed exclusively by the Electron application` or a profile-upgrade gate that rejects unexpected symlinks / `link:` deps). In that case use the **in-app plugin manager** (Settings → Plugins), or install as a **real directory** under the profile’s `node_modules` — not a `link:` / junction. See notes in [`dsh-our-free-model`](https://github.com/Ebony-Vinyl/dsh-our-free-model) for the same desktop constraints.

### Clone only for development

```bash
git clone https://github.com/losebird/IUI.git
cd IUI
pnpm install
pnpm run build
dsh plugin --profile <profile> add .
# or sync into an existing install:
# bash scripts/sync-to-dsh-profile.sh . /path/to/profile/node_modules/@losebird/iui
```

Do **not** run `@changfenhuang/dsh-genui` (or another GenUI fork) alongside IUI — they fight over the same fence surface.

More detail: [docs/INSTALL.md](./docs/INSTALL.md) · [docs/SETTINGS.md](./docs/SETTINGS.md) · [docs/PILOT.zh-CN.md](./docs/PILOT.zh-CN.md)

## Try it

1. New chat, pick a capable model (see [Models](#models--honesty) below).
2. Ask for something that should look like a page, not a Markdown table — e.g. *“做一个加州海岸三日行程页，带地图和景点横滑卡”*.
3. The assistant reply should contain a closed `` ```iui-html `` fence that mounts as an **iframe**, not as raw JSON or a code block left on the page.
4. Streaming chrome (CSS / HTML / JS “loading”) should clear when the fence settles.

### Fence shape (what the model writes)

```iui-html
{
  "title": "California coast · 3 days",
  "height": 560,
  "placeholder": "Building the trip board…",
  "css": "/* page-specific styles; prefer CSS variables */",
  "html": "<div class=\"iui-itinerary\">…</div>",
  "js": "/* runs after html is ready */"
}
```

Field order matters for streaming: **title → height → placeholder → css → html → js**. The host already injects the design-system base, import map, and helpers such as `createTripAnimator`. Author CSS should prefer theme variables; CDN scripts must stay on the allowlist.

Full authoring contract: [SKILL.md](./SKILL.md)

---

## Models & honesty

| Topic | Reality |
|---|---|
| **Recommended (pilot)** | **Muse Spark 1.3** via `dsh-our-free-model` — strong on trip / pricing / weather-style pages in our checks |
| **Locked?** | **No.** Any OpenAI-compatible model can be selected; quality varies |
| **Model long-tail** | Broken JS, missing fences, rate limits — **not** in the plugin SLA. Use regenerate / re-ask |
| **Third-party tiles & photos** | Esri / OSM / Wikimedia availability is **not** contractually guaranteed |
| **Host wipe** | If the host clears a bubble (`contentWiped`), the sandbox remounts; simple form state is restored when possible, complex animation state may reset |

Pilot ops notes (Chinese): [docs/PILOT.zh-CN.md](./docs/PILOT.zh-CN.md)

---

## Settings (short)

Under **Settings → IUI** you can toggle theme tokens, fence-repair feedback, the format referee (steers visual asks toward `` ```iui-html ``), optional user HTML starters, and an optional TypeSafe / Jev format router (**off** unless you supply a key).

There is **no** pack picker, Gateway sidecar, or DIL endpoint in 0.13. See [docs/SETTINGS.md](./docs/SETTINGS.md).

---

## Docs map

| Doc | What it is |
|---|---|
| [docs/REDESIGN-SANDBOX-FIRST.zh-CN.md](./docs/REDESIGN-SANDBOX-FIRST.zh-CN.md) | Why sandbox-first, what was deleted, architecture |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Short English architecture snapshot |
| [docs/INSTALL.md](./docs/INSTALL.md) | Install & verify |
| [docs/SETTINGS.md](./docs/SETTINGS.md) | Settings & soft-fence path |
| [docs/PILOT.zh-CN.md](./docs/PILOT.zh-CN.md) | Pilot ops, models, known tails |
| [SKILL.md](./SKILL.md) | Model-facing fence / pattern contract |
| [docs/ACCEPTANCE.md](./docs/ACCEPTANCE.md) | Acceptance checklist |
| [CHANGELOG.md](./CHANGELOG.md) | Version history |

---

## Lineage & license

MIT. Mounting and fence plumbing descend from [`omdsh-dev/dsh-genui`](https://github.com/omdsh-dev/dsh-genui). Themes, sandbox contract, bridges, trip tools, and the 0.13 product cut are IUI’s own.

Upstream GenUI demos and catalog-component docs describe a **different** product path (JSON component trees / packs). Do not treat those as screenshots of this plugin.

See [LICENSE](./LICENSE) and [NOTICE](./NOTICE).

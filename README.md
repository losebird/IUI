# IUI

**English** · [简体中文](./README.zh-CN.md)

**IUI** (`@losebird/iui`) is a [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (**dsh**) plugin. When a reply should look like a page — charts, maps, itineraries, pricing boards, small tools — the model can emit a free-form HTML/CSS/JS document and IUI mounts it inside the chat bubble in an isolated sandbox iframe.

---

## Examples

| Itinerary | Weather |
|---|---|
| ![Itinerary page](./assets/examples/live-itinerary.jpg) | ![Weather page](./assets/examples/live-weather.jpg) |

| Pricing | Hotels |
|---|---|
| ![Pricing board](./assets/examples/live-pricing.jpg) | ![Hotel cards](./assets/examples/live-hotels.jpg) |

| Pomodoro | Kanban |
|---|---|
| ![Pomodoro timer](./assets/examples/live-pomodoro.jpg) | ![Kanban board](./assets/examples/live-kanban.jpg) |

| Mortgage calculator |
|---|
| ![Mortgage calculator](./assets/examples/live-mortgage.jpg) |

---

## Install

Needs `dsh` on your PATH (or `npx @deepseek-ai/dsh`), Node `^22.19 || >=24`, and a web profile. You do **not** need to clone this repo first.

```bash
dsh plugin --profile <profile> add github:losebird/IUI
dsh web
```

Replace `<profile>` with yours (often `web`). Without a global `dsh`:

```bash
npx @deepseek-ai/dsh plugin --profile <profile> add github:losebird/IUI
npx @deepseek-ai/dsh web
```

Open the URL from the start log **including `?token=`**. Hard-refresh the browser. Console should show:

```text
[iui] client active; fence-channel=registry|dom
```

Settings should list **IUI**.

Full install notes: [docs/INSTALL.md](./docs/INSTALL.md)

---

## Quick use

1. Start a new chat and pick a model that follows instructions well.
2. Ask for something that should look like a page, for example: *“Build a three-day coastal trip page with a map and stop cards.”*
3. When the model closes an `` ```iui-html `` fence, IUI mounts an interactive page in the bubble — not a leftover code block.

Plain text replies stay plain text. Only fences become pages.

### Fence

```iui-html
{
  "title": "California coast · 3 days",
  "height": 560,
  "css": "/* page styles */",
  "html": "<div>…</div>",
  "js": "/* runs after html is ready */"
}
```

Authoring details: [SKILL.md](./SKILL.md)

---

## Docs

| Doc | |
|---|---|
| [docs/INSTALL.md](./docs/INSTALL.md) | Install & verify |
| [docs/SETTINGS.md](./docs/SETTINGS.md) | Plugin settings |
| [SKILL.md](./SKILL.md) | Fence & authoring contract |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Architecture overview |
| [CHANGELOG.md](./CHANGELOG.md) | Releases |

---

## License

MIT. See [LICENSE](./LICENSE) and [NOTICE](./NOTICE).

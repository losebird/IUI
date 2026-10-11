# Format router

## Rules (default)

`src/config/referee-rules.ts` → `classifyIntentAsk` / `routeFormatSync`.
Catalog-driven; no hard-coded call-site intent lists.

## Optional Jev (TypeSafe System One)

Config: `jevEnabled` + `jevApiKey` (secret). Optional `jevBaseUrl`, `jevModel`.

- Endpoint: `POST {base}/v1/systemone`
- Criteria built from `listIntentRules()` + `none`
- On timeout / HTTP / unknown choice / low confidence → **rules fallback**
- Never generates UI text

Status (no secrets): `GET …/assets/format-router.json`

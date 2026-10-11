#!/usr/bin/env bash
# Sync built @losebird/iui into a dsh profile node_modules (pnpm file: is not a live link).
# Hardened: require build artifacts, print client.js hash, copy package surface only (no tests/).
set -euo pipefail
SRC="${1:-/workspace/dsh-genui-fork}"
DST="${2:-/home/box/.dsh/profiles/web/node_modules/@losebird/iui}"

test -f "$SRC/package.json" || { echo "missing package.json in $SRC"; exit 1; }
test -f "$SRC/lib/index.js" || { echo "build first: npm run build (missing lib/index.js)"; exit 1; }
test -f "$SRC/lib/client.js" || { echo "build first: npm run build (missing lib/client.js)"; exit 1; }

CLIENT_HASH="$(sha256sum "$SRC/lib/client.js" | awk '{print substr($1,1,12)}')"
VERSION="$(node -p "require('$SRC/package.json').version")"

rm -rf "$DST"
mkdir -p "$DST"

cp "$SRC/package.json" "$DST/"
cp -a "$SRC/lib" "$DST/"
if [[ -d "$SRC/src" ]]; then
  mkdir -p "$DST/src"
  # Copy src without dumping node_modules-style junk; skip *.spec.*
  (cd "$SRC/src" && find . -type f ! -name '*.spec.ts' ! -name '*.spec.tsx' ! -path '*/__tests__/*' -print0 \
    | tar --null -T - -cf -) | (cd "$DST/src" && tar -xf -)
fi
for f in SKILL.md README.md README.zh-CN.md CHANGELOG.md LICENSE NOTICE demo-prompts.md cordis.patch.yml tsconfig.json tsdown.config.ts; do
  [[ -f "$SRC/$f" ]] && cp "$SRC/$f" "$DST/" || true
done
if [[ -d "$SRC/docs" ]]; then
  mkdir -p "$DST/docs"
  for f in INSTALL.md SETTINGS.md PILOT.zh-CN.md ACCEPTANCE.md; do
    [[ -f "$SRC/docs/$f" ]] && cp "$SRC/docs/$f" "$DST/docs/" || true
  done
fi
if [[ -d "$SRC/assets" ]]; then
  cp -a "$SRC/assets" "$DST/"
fi

echo "synced $VERSION client.js@$CLIENT_HASH → $DST"

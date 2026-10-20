// C6: copy pinned sandbox libraries from node_modules into lib/assets/vendor/<pkg>@<version>/...
// Run after tsdown (see package.json "build"). Fails loudly on version drift.
import { cpSync, existsSync, mkdirSync, readFileSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(join(root, 'package.json'))
const src = readFileSync(join(root, 'src/shared/vendor-registry.ts'), 'utf8')
// Parse VENDOR_LIBS without a TS loader: { pkg: '..', version: '..', js: '..', css: [..], extra: [..] }
const libs = [...src.matchAll(/\{\s*pkg:\s*'([^']+)',\s*version:\s*'([^']+)'([^}]*)\}/g)].map(([, pkg, version, rest]) => {
  const cdnOnly = /cdnJs:\s*'([^']+)'/.exec(rest)?.[1]
  const files = [...rest.matchAll(/'([^']+\/[^']+)'/g)].map((m) => m[1]).filter((f) => f !== cdnOnly)
  return { pkg, version, files: [...new Set(files)] }
})
let bytes = 0
for (const { pkg, version, files } of libs) {
  const pkgDir = require.resolve.paths(pkg).map((d) => join(d, pkg)).find((d) => existsSync(join(d, 'package.json')))
  if (!pkgDir) throw new Error(`vendor ${pkg}: not installed (add it to devDependencies)`)
  const installed = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8')).version
  if (installed !== version) throw new Error(`vendor ${pkg}: registry pins ${version} but ${installed} is installed`)
  for (const f of files) {
    const from = join(pkgDir, f)
    if (!existsSync(from)) throw new Error(`vendor ${pkg}: missing ${f}`)
    const to = join(root, 'lib/assets/vendor', `${pkg}@${version}`, f)
    mkdirSync(dirname(to), { recursive: true })
    cpSync(from, to, { recursive: true })
    bytes += statSync(from).isDirectory() ? 0 : statSync(from).size
  }
}
console.log(`vendor-assets: ${libs.length} libs, ${(bytes / 1048576).toFixed(1)} MB → lib/assets/vendor`)

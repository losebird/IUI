#!/usr/bin/env node
/**
 * Cross-platform `prepack` wrapper: rebuild lib before packing, but keep the
 * build's stdout OFF the process stdout. `npm pack --json` parses stdout as
 * JSON, so any tsdown banner leaking to stdout corrupts the pack gate and
 * tooling that drives npm pack programmatically. Build progress is forwarded
 * to stderr instead.
 *
 * Prefers `npm run build` so scoped environments without writable corepack
 * cache still pack (pnpm via corepack may EACCES on /usr/local/share/corepack).
 */
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const isWindows = process.platform === 'win32'
const localPnpm = join(root, 'node_modules', '.bin', isWindows ? 'pnpm.cmd' : 'pnpm')

function run(cmd, args) {
  return spawnSync(cmd, args, {
    cwd: root,
    env: {
      ...process.env,
      // Keep corepack off the critical path when it cannot write its cache.
      COREPACK_HOME: process.env.COREPACK_HOME || join(root, '.corepack-home'),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
}

let result = null
if (!isWindows && existsSync(localPnpm)) {
  result = run(localPnpm, ['run', 'build'])
}
if (result === null || result.status !== 0) {
  // Fall back to npm (already used for pack) — does not need corepack.
  result = run(isWindows ? (process.env.ComSpec || 'cmd.exe') : 'npm', isWindows
    ? ['/d', '/s', '/c', 'npm run build']
    : ['run', 'build'])
}

if (result.stdout?.length) process.stderr.write(result.stdout)
if (result.stderr?.length) process.stderr.write(result.stderr)
if (result.error) throw result.error
if (result.status !== 0) process.exit(result.status ?? 1)

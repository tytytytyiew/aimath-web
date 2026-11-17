// Bundles the Express API into a single Vercel Node.js function using the
// Build Output API (https://vercel.com/docs/build-output-api/v3).
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { build } from 'esbuild'

const apiDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = resolve(apiDir, '.vercel/output')
const funcDir = resolve(outDir, 'functions/index.func')

rmSync(outDir, { recursive: true, force: true })
mkdirSync(funcDir, { recursive: true })

await build({
  entryPoints: [resolve(apiDir, 'src/vercel.ts')],
  outfile: resolve(funcDir, 'index.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  external: ['pg-native'],
  // Allow bundled CommonJS dependencies to call require() inside an ES module
  banner: {
    js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);",
  },
  logLevel: 'info',
})

writeFileSync(
  resolve(funcDir, '.vc-config.json'),
  JSON.stringify({ runtime: 'nodejs22.x', handler: 'index.mjs', launcherType: 'Nodejs' }, null, 2),
)

writeFileSync(
  resolve(outDir, 'config.json'),
  JSON.stringify({ version: 3, routes: [{ src: '/(.*)', dest: '/index' }] }, null, 2),
)

console.log('[vercel] Build output written to', outDir)

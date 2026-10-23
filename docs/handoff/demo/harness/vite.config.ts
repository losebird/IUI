import { defineConfig } from 'vite'
export default defineConfig({
  root: __dirname,
  base: './',
  logLevel: 'warn',
  resolve: { alias: { '@deepseek-ai/dsh-util-workspace-path': __dirname + '/stub-path.ts' } },
  esbuild: { jsx: 'automatic' },
  build: { outDir: 'dist', emptyOutDir: true, minify: false, target: 'es2022', chunkSizeWarningLimit: 99999, modulePreload: false },
})

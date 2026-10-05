import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs'
import postcss from 'postcss'

export default defineConfig({
  plugins: [react(), {
    name: 'dsh-module-and-scoped-css',
    resolveId(id) { if (id === 'virtual:gitviz-tree-css') return '\0gitviz-tree-css' },
    load(id) {
      if (id !== '\0gitviz-tree-css') return
      const css = postcss.parse(fs.readFileSync('src/version-tree/version-tree.css', 'utf8'))
      css.walkRules(rule => {
        if (rule.parent.type === 'atrule' && rule.parent.name.endsWith('keyframes')) return
        if (rule.selector.includes('html') || rule.selector === 'body' || rule.selector.startsWith('body.vscode-light')) { rule.remove(); return }
        rule.selectors = rule.selectors.map(selector => `.gitviz-dsh ${selector}`)
      })
      return `export default ${JSON.stringify(css.toString())}`
    },
    generateBundle(_, bundle) {
      for (const chunk of Object.values(bundle)) if (chunk.type === 'chunk') {
        chunk.code = `window.__ModuleLoader__.load({id:'@fisharly/gitviz-dsh',factory(require){var module={exports:{}};var exports=module.exports;\n${chunk.code}\nreturn module.exports;}});`
      }
    },
    closeBundle() { for (const file of ['git-service.cjs', 'git-process.cjs', 'operation-journal.cjs']) fs.copyFileSync(`extensions/vscode/${file}`, `extensions/dsh/dist/${file}`) },
  }],
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  build: {
    copyPublicDir: false,
    outDir: 'extensions/dsh/dist', emptyOutDir: true,
    lib: { entry: 'extensions/dsh/client.jsx', formats: ['cjs'], fileName: () => 'client.js' },
    rollupOptions: { external: ['react', 'react/jsx-runtime'] },
  },
})

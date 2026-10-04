import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  build: {
    outDir: 'extensions/vscode/media', emptyOutDir: true,
    lib: { entry: 'extensions/vscode/webview.jsx', name: 'GitvizTree', formats: ['iife'], fileName: () => 'tree.js', cssFileName: 'tree' },
    cssCodeSplit: false,
  },
})

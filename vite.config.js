import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Tauri 桌面版：所有 git 操作走 Rust 后端 (gix)，无需 Buffer / process polyfill。
// vite-plugin-node-polyfills 已在 P-Tauri-1 移除。
export default defineConfig({
  plugins: [react()],
  // Tauri 的 dev server 配置：固定端口 + 不自动打开浏览器（窗口由 Tauri 起）
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
  },
})

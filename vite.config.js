import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

// isomorphic-git 在浏览器跑时需要 node globals (Buffer / process 等)
// FileSystem.read 内部 Buffer.from(uint8Array) 没 polyfill 会 throw → 错误被 swallow → 报 "Could not find <oid>"
// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    nodePolyfills({
      include: ['buffer', 'process'],
      globals: { Buffer: true, process: true },
    }),
  ],
})

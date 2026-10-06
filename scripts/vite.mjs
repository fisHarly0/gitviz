import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

// Match CI's bounded native build settings before Rolldown is loaded.
// The Monaco dependency graph exceeds the default Windows worker stack.
const result = spawnSync(process.execPath, [fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url)), ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: {
    ...process.env,
    RUST_MIN_STACK: process.env.RUST_MIN_STACK || '8388608',
    RAYON_NUM_THREADS: process.env.RAYON_NUM_THREADS || '2',
  },
})
if (result.error) console.error(result.error.message)
process.exitCode = result.status ?? 1

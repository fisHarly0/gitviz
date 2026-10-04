import fs from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import path from 'node:path'

await fs.mkdir('artifacts', { recursive: true })
const diffLicense = await fs.readFile('node_modules/diff/LICENSE', 'utf8')
await fs.writeFile('extensions/dsh/THIRD_PARTY_NOTICES.txt', `Bundled dependency: diff (jsdiff)\n${diffLicense}\nReact is supplied by the DSH host and is not bundled.\n`)
// npm's CLI is a JS file on every platform; avoid shell command interpolation.
if (!process.env.npm_execpath) throw new Error('请通过 npm run dsh:package 运行。')
const result = spawnSync(process.execPath, [process.env.npm_execpath, 'pack', '--ignore-scripts', '--pack-destination', path.resolve('artifacts')], {
  cwd: path.resolve('extensions/dsh'), stdio: 'inherit', windowsHide: true,
  env: { ...process.env, npm_config_cache: process.env.npm_config_cache || (process.platform === 'win32' ? 'F:/dev/cache/npm' : undefined) },
})
if (result.status !== 0) process.exit(result.status || 1)

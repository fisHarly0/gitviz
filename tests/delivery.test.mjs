import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import JSZip from 'jszip'
import { checkVersion, projectRoot } from '../scripts/version.mjs'
import { checkPackages } from '../scripts/check-packages.mjs'

const scratch = process.env.GITVIZ_DELIVERY_TEST_ROOT || (process.platform === 'win32' ? 'F:/Codex/work/gitviz-product/delivery-tests' : path.join(os.tmpdir(), 'gitviz-delivery-tests'))
const run = (script, env) => {
  const result = spawnSync(process.execPath, [path.join(projectRoot, script)], { cwd: projectRoot, env: { ...process.env, ...env }, encoding: 'utf8', windowsHide: true })
  assert.equal(result.status, 0, result.stderr || result.error?.message)
}
const hash = buffer => createHash('sha256').update(buffer).digest('hex')

test('version guard rejects a stale host manifest and stale locks', async () => {
  await fs.mkdir(scratch, { recursive: true })
  const root = await fs.mkdtemp(path.join(scratch, 'versions-'))
  for (const file of ['package.json', 'package-lock.json', 'extensions/vscode/package.json', 'extensions/dsh/package.json', 'src-tauri/tauri.conf.json', 'src-tauri/Cargo.toml', 'src-tauri/Cargo.lock']) {
    await fs.mkdir(path.dirname(path.join(root, file)), { recursive: true }); await fs.copyFile(path.join(projectRoot, file), path.join(root, file))
  }
  const version = await checkVersion(root)
  const target = path.join(root, 'extensions/vscode/package.json'), original = await fs.readFile(target, 'utf8')
  await fs.writeFile(target, original.replace(`"version": "${version}"`, '"version": "0.0.1"'))
  await assert.rejects(checkVersion(root), /extensions\/vscode\/package.json/)
  await fs.writeFile(target, original)
  const lock = path.join(root, 'src-tauri/Cargo.lock'), text = await fs.readFile(lock, 'utf8')
  await fs.writeFile(lock, text.replace(`name = "gitviz"\nversion = "${version}"`, 'name = "gitviz"\nversion = "0.0.1"'))
  await assert.rejects(checkVersion(root), /Cargo.lock/)
})

test('built plugin packages are complete, deterministic and reject a missing worker', async () => {
  assert.ok(process.env.npm_execpath, 'Run via npm run delivery:test after building both plugin frontends')
  await fs.mkdir(scratch, { recursive: true })
  const root = await fs.mkdtemp(path.join(scratch, 'packages-')), one = path.join(root, 'one'), two = path.join(root, 'two')
  for (const folder of [one, two]) {
    const env = { GITVIZ_ARTIFACTS_DIR: folder }
    run('scripts/package-extension.mjs', env); run('scripts/package-dsh.mjs', env)
    await checkPackages(folder)
  }
  const version = await checkVersion()
  for (const name of [`gitviz-${version}.vsix`, `fisharly-gitviz-dsh-${version}.tgz`]) assert.equal(hash(await fs.readFile(path.join(one, name))), hash(await fs.readFile(path.join(two, name))), `${name} must be reproducible`)
  const vsix = path.join(two, `gitviz-${version}.vsix`), archive = await JSZip.loadAsync(await fs.readFile(vsix))
  archive.remove('extension/operation-worker.cjs')
  await fs.writeFile(vsix, await archive.generateAsync({ type: 'nodebuffer' }))
  await assert.rejects(checkPackages(two), /VSIX missing operation-worker/)
})

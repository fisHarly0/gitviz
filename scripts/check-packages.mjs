import fs from 'node:fs/promises'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'
import JSZip from 'jszip'
import { checkVersion, projectRoot } from './version.mjs'

export async function checkPackages(directory = process.env.GITVIZ_ARTIFACTS_DIR || path.join(projectRoot, 'artifacts')) {
  const version = await checkVersion(), rootLicense = (await fs.readFile(path.join(projectRoot, 'LICENSE'), 'utf8')).replaceAll('\r\n', '\n')
  const zip = await JSZip.loadAsync(await fs.readFile(path.join(directory, `gitviz-${version}.vsix`)))
  const vscode = JSON.parse(await zip.file('extension/package.json').async('string'))
  assert.equal(vscode.version, version); assert.equal(vscode.license, 'MIT')
  const xml = await zip.file('extension.vsixmanifest').async('string')
  assert.ok(xml.includes(`Version="${version}"`) && xml.includes('<License>extension/LICENSE</License>'))
  for (const file of ['extension.cjs', 'git-service.cjs', 'git-process.cjs', 'operation-journal.cjs', 'operation-host.cjs', 'operation-worker.cjs', 'media/tree.js', 'media/tree.css', 'README.md', 'LICENSE', 'THIRD_PARTY_NOTICES.txt']) {
    assert.ok((await zip.file(`extension/${file}`)?.async('nodebuffer'))?.length, `VSIX missing ${file}`)
  }
  assert.equal((await zip.file('extension/LICENSE').async('string')).replaceAll('\r\n', '\n'), rootLicense)
  const archive = path.resolve(directory, `fisharly-gitviz-dsh-${version}.tgz`)
  const entries = execFileSync('tar', ['-tf', archive], { encoding: 'utf8' }).trim().split(/\r?\n/)
  assert.equal(new Set(entries).size, entries.length, 'Duplicate archive paths')
  for (const name of entries) assert.ok(/^package\//.test(name) && !name.split('/').includes('..') && !/\.(env|map)$/.test(name), `Unexpected archive path: ${name}`)
  const read = file => execFileSync('tar', ['-xOf', archive, `package/${file}`], { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 })
  const dsh = JSON.parse(read('package.json'))
  assert.equal(dsh.version, version); assert.equal(dsh.license, 'MIT')
  for (const file of ['index.mjs', 'host.mjs', 'cordis.patch.yml', 'dist/client.js', 'dist/git-service.cjs', 'dist/git-process.cjs', 'dist/operation-journal.cjs', 'dist/operation-host.cjs', 'dist/operation-worker.cjs', 'README.md', 'LICENSE', 'THIRD_PARTY_NOTICES.txt']) assert.ok(read(file).length, `DSH missing ${file}`)
  assert.equal(read('LICENSE').replaceAll('\r\n', '\n'), rootLicense)
  for (const file of ['git-service.cjs', 'git-process.cjs', 'operation-journal.cjs', 'operation-host.cjs', 'operation-worker.cjs']) {
    assert.equal(read(`dist/${file}`).replaceAll('\r\n', '\n'), (await zip.file(`extension/${file}`).async('string')).replaceAll('\r\n', '\n'), `Hosts ship different ${file}`)
  }
  return version
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) console.log(`Package contents verified: ${await checkPackages()}`)

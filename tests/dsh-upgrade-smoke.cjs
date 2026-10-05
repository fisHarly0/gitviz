// Installed DSH plugin upgrade/restart in an isolated home and Integrated Browser.
/* global document */
const fs = require('node:fs/promises'), path = require('node:path'), assert = require('node:assert/strict')
const { execFileSync } = require('node:child_process'), { createHash } = require('node:crypto')
const { setTimeout: delay } = require('node:timers/promises')
const { chromium } = require(process.env.PLAYWRIGHT_CORE_PATH || 'playwright-core')
const { GitService } = require('../extensions/vscode/git-service.cjs')
const out = process.env.GITVIZ_DSH_UPGRADE_ROOT, phase = process.argv[2]
if (!out || !path.isAbsolute(out) || !['old', 'upgraded', 'restarted'].includes(phase)) throw Error('Explicit scratch and DSH upgrade phase required')
const sha = value => createHash('sha256').update(value).digest('hex')
const save = (name, data) => fs.writeFile(path.join(out, name + '.json'), JSON.stringify(data, null, 2))
const read = name => fs.readFile(path.join(out, name + '.json'), 'utf8').then(JSON.parse)
;(async () => {
  const profile = path.join(out, 'home/profiles/web'), installed = path.join(profile, 'node_modules/@fisharly/gitviz-dsh')
  const manifest = JSON.parse(await fs.readFile(path.join(installed, 'package.json'), 'utf8'))
  assert.equal(manifest.version, phase === 'old' ? '0.2.0' : '0.3.0')
  const config = JSON.parse(await fs.readFile(path.join(profile, 'package.json'), 'utf8'))
  assert.equal(config.dsh.profile.bundles.filter(name => name === '@fisharly/gitviz-dsh').length, 1, 'upgrade retains a single enabled plugin bundle')
  const archive = path.resolve(process.env[phase === 'old' ? 'GITVIZ_OLD_DSH' : 'GITVIZ_NEW_DSH'])
  const tarOptions = { cwd: path.dirname(archive), maxBuffer: 20 * 1024 * 1024, windowsHide: true }
  const entries = execFileSync('tar', ['-tf', path.basename(archive)], { ...tarOptions, encoding: 'utf8' }).trim().split(/\r?\n/)
  for (const entry of entries.filter(name => !name.endsWith('/'))) {
    assert.ok(entry.startsWith('package/') && !entry.split('/').includes('..'))
    assert.equal(sha(await fs.readFile(path.join(installed, entry.slice('package/'.length)))), sha(execFileSync('tar', ['-xOf', path.basename(archive), entry], tarOptions)), `installed package bytes: ${entry}`)
  }
  if (phase === 'old' && !await fs.stat(path.join(out, 'fixture.json')).catch(error => { if (error.code === 'ENOENT') return null; throw error })) {
    process.env.GITVIZ_LARGE_TEST_ROOT = out
    const f = await require('./helpers/large-repo.cjs').largeRepo(25)
    await save('fixture', { root: f.root, first: f.first, head: await f.git.head(), refs: await f.git.command(['show-ref']), index: sha(await fs.readFile(path.join(f.root, '.git/index'))), content: await fs.readFile(path.join(f.root, 'counter.txt'), 'utf8') })
  }
  const f = await read('fixture'), relative = path.relative(out, f.root)
  assert.ok(relative && !relative.startsWith('..') && !path.isAbsolute(relative))
  const git = new GitService(f.root), hook = path.join(f.root, '.git/hooks/pre-commit')
  const pid = Number((await fs.readFile(path.join(out, 'dsh.pid'), 'utf8')).trim())
  if (phase !== 'old') assert.notEqual(pid, (await read(`result-${phase === 'upgraded' ? 'old' : 'upgraded'}`)).serverPid, 'DSH backend actually restarted')
  const browser = await chromium.connectOverCDP(process.env.GITVIZ_CDP_URL || 'http://127.0.0.1:9235')
  try {
    const page = browser.contexts().flatMap(context => context.pages()).find(p => p.url().startsWith('http://127.0.0.1:3087/'))
    assert.ok(page, 'DSH is open in the same Integrated Browser tab')
    if (phase !== 'old') {
      let url
      const deadline = Date.now() + 45000
      while (!url && Date.now() < deadline) {
        const log = await fs.readFile(path.join(out, `server-${phase}.log`), 'utf8')
        url = log.match(/http:\/\/127\.0\.0\.1:3087\/\S*/)?.[0].split(String.fromCharCode(27))[0]
        if (!url) await delay(200)
      }
      assert.ok(url, 'isolated server launch URL available')
      await page.goto(url)
    }
    const button = name => page.getByRole('button', { name, exact: true })
    if (await button('继续').isVisible()) await button('继续').click()
    // The optional model setup appears asynchronously after the welcome notice.
    try { await button('稍后配置').waitFor({ timeout: 5000 }); await button('稍后配置').click() }
    catch (error) { if (error.name !== 'TimeoutError') throw error }
    await button('Gitviz 版本树').click()
    if (phase === 'old') {
      await page.locator('.repo-picker').click()
      await page.getByLabel('本机仓库的绝对路径').fill(f.root); await button('展开版本树').click()
    }
    await page.waitForFunction(root => document.querySelector('.repo-picker')?.title.replaceAll('\\', '/') === root.replaceAll('\\', '/'), f.root)
    await page.waitForFunction(() => document.querySelector('.history-controls')?.textContent.includes('25 / 25'))
    const client = await require('./helpers/dsh-client-source.cjs')(page, installed)
    assert.equal((await page.evaluate(() => sessionStorage.getItem('gitviz.dsh.repository'))).replaceAll('\\', '/'), f.root.replaceAll('\\', '/'))
    assert.equal(await page.locator('style[data-plugin="@fisharly/gitviz-dsh"]').count(), 1)
    if (phase !== 'restarted') {
      assert.equal(await git.head(), f.head); assert.equal(await git.status(), '')
      assert.equal(await git.command(['show-ref']), f.refs)
      assert.equal(sha(await fs.readFile(path.join(f.root, '.git/index'))), f.index)
      assert.equal(await fs.readFile(path.join(f.root, 'counter.txt'), 'utf8'), f.content)
      await page.locator('.map-viewport').press('End')
      await page.locator(`.save-node.selected[data-oid="${f.first}"]`).waitFor()
      assert.equal(await git.head(), f.head); assert.equal(await git.status(), '')
    }
    if (phase === 'upgraded') {
      await page.locator('.folded-node').first().waitFor()
      await fs.writeFile(hook, '#!/bin/sh\necho dsh-upgrade-hook-rejected >&2\nexit 1\n', { mode: 0o755 })
      await button('恢复此存档').click(); await button('备份并恢复为新提交').click()
      await page.locator('.tree-message[role=alert]').filter({ hasText: 'dsh-upgrade-hook-rejected' }).waitFor()
      const failed = (await git.operations()).records[0]
      assert.equal(failed.state, 'failed'); assert.equal(failed.attempts, 1)
      assert.equal(await git.head(), f.head)
      assert.equal(failed.checkpoint.tree, (await git.command(['rev-parse', `${f.first}^{tree}`])).trim())
      await save('failed-checkpoint', failed)
    } else if (phase === 'restarted') {
      const failed = await read('failed-checkpoint')
      assert.deepEqual((await git.operations()).records[0], failed)
      await page.locator('.operation-history > summary').click()
      await page.locator('.operation-record summary').filter({ hasText: '恢复存档 · 未完成' }).click()
      await fs.unlink(hook)
      await button('检查并继续提交').click()
      await page.getByRole('dialog').getByRole('button', { name: '检查并继续提交', exact: true }).click()
      await page.locator('.operation-record summary').filter({ hasText: '恢复存档 · 已完成' }).waitFor()
      assert.equal(await git.status(), '')
      assert.equal((await git.command(['rev-parse', 'HEAD^'])).trim(), f.head)
      assert.equal((await git.command(['rev-parse', 'HEAD^{tree}'])).trim(), failed.checkpoint.tree)
      assert.equal((await git.command(['rev-parse', failed.backup])).trim(), f.head)
      const done = (await git.operations()).records[0]
      assert.equal(done.id, failed.id); assert.equal(done.state, 'completed'); assert.equal(done.attempts, 2)
    }
    await page.screenshot({ path: path.join(out, `dsh-${phase}.png`) })
    await save(`result-${phase}`, { ...client, version: manifest.version, packageSHA256: sha(await fs.readFile(archive)), serverPid: pid, installedBytesVerified: true, enabledBundlePreserved: true, selectedRepositoryPreserved: true, passed: true, head: await git.head(), restartRecovery: phase === 'restarted' })
    console.log(`PASS DSH ${phase}: ${manifest.version}, native page, installed package, real Git`)
  } finally { await browser.close().catch(() => {}) }
})().catch(error => { console.error(String(error.stack || error).replace(/https?:\/\/\S+/g, '[URL]')); process.exitCode = 1 })

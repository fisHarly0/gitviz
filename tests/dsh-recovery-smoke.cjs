// Real DSH page hosted in an isolated VS Code Integrated Browser.
/* global document */
const fs = require('node:fs/promises'), path = require('node:path'), assert = require('node:assert/strict')
const out = process.env.GITVIZ_DESKTOP_TEST_ROOT
if (!out || !path.isAbsolute(out)) throw new Error('Explicit absolute scratch directory required')
const { chromium } = require(process.env.PLAYWRIGHT_CORE_PATH || 'playwright-core')
process.env.GITVIZ_LARGE_TEST_ROOT = out
const { largeRepo } = require('./helpers/large-repo.cjs')
;(async () => {
  const fixture = await largeRepo(25), git = fixture.git, original = await git.head()
  const browser = await chromium.connectOverCDP(process.env.GITVIZ_CDP_URL || 'http://127.0.0.1:9235')
  const page = browser.contexts().flatMap(context => context.pages()).find(page => page.url().startsWith('http://127.0.0.1:3087/'))
  if (!page) throw new Error('Open the isolated DSH server in the Integrated Browser first')
  const button = name => page.getByRole('button', { name, exact: true }), dialog = page.getByRole('dialog')
  const errors = [], rejectedRequests = []; page.on('pageerror', error => errors.push(error.message))
  page.on('response', response => {
    if (response.url().endsWith('/_gitviz/api') && !response.ok()) rejectedRequests.push(response.json().then(body => ({ status: response.status(), error: body.error })))
  })
  page.on('console', message => {
    if (message.type() !== 'error') return
    // The two intentionally rejected Git writes return HTTP 400. Validate their
    // response bodies below; rendering and other resource errors must still fail.
    if (message.location().url?.endsWith('/_gitviz/api') && message.text() === 'Failed to load resource: the server responded with a status of 400 (Bad Request)') return
    errors.push(message.text())
  })
  const dismissSetup = async () => {
    try { await button('稍后配置').waitFor({ timeout: 5000 }); await button('稍后配置').click() }
    catch (error) { if (error.name !== 'TimeoutError') throw error }
  }
  await dismissSetup()
  await button('Gitviz 版本树').click(); await page.locator('.repo-picker').click()
  await page.getByLabel('本机仓库的绝对路径').fill(fixture.root); await button('展开版本树').click()
  await page.waitForFunction(root => document.querySelector('.repo-picker')?.getAttribute('title')?.replaceAll('\\', '/') === root.replaceAll('\\', '/'), fixture.root)
  await page.waitForFunction(() => document.querySelector('.version-tree')?.getAttribute('aria-busy') === 'false')
  await page.waitForFunction(() => document.querySelector('.history-controls')?.textContent.includes('25 / 25'))
  await page.locator('.map-viewport').press('End')
  await page.locator(`.save-node.selected[data-oid="${fixture.first}"]`).waitFor()
  const hook = path.join(fixture.root, '.git/hooks/pre-commit')
  await fs.writeFile(hook, '#!/bin/sh\necho dsh-recovery-hook-rejected >&2\nexit 1\n', { mode: 0o755 })
  await button('恢复此存档').click(); await button('保留历史并恢复').click()
  await page.locator('.tree-message[role=alert]').filter({ hasText: 'dsh-recovery-hook-rejected' }).waitFor()
  const history = page.locator('.operation-history')
  await history.locator(':scope > summary').click()
  await history.locator('.operation-record summary').filter({ hasText: '恢复存档 · 未完成' }).click()
  await button('检查并继续提交').click(); await dialog.waitFor()
  await button('取消').click(); await dialog.waitFor({ state: 'hidden' })
  const failed = (await git.operations()).records.find(record => record.action === 'restore')
  assert.equal(failed.attempts, 1); assert.equal(await git.head(), original)
  await button('检查并继续提交').click(); await dialog.waitFor()
  await fs.writeFile(path.join(fixture.root, 'counter.txt'), 'external after preview\n')
  await dialog.getByRole('button', { name: '检查并继续提交', exact: true }).click()
  await history.getByRole('alert').waitFor()
  assert.equal(await git.head(), original)
  assert.equal(await fs.readFile(path.join(fixture.root, 'counter.txt'), 'utf8'), 'external after preview\n')
  await git.command(['restore', '--worktree', '--', 'counter.txt']); await fs.unlink(hook)
  await button('检查并继续提交').click(); await dialog.waitFor()
  await page.screenshot({ path: path.join(out, 'recovery-dsh-confirm.png') })
  await dialog.getByRole('button', { name: '检查并继续提交', exact: true }).click()
  await history.locator('summary').filter({ hasText: '恢复存档 · 已完成' }).waitFor()
  const head = await git.head()
  await page.waitForFunction(oid => document.querySelector('.journey-bar')?.textContent.includes(oid), head.slice(0, 7))
  assert.equal(await git.status(), '')
  assert.equal((await git.command(['rev-parse', 'HEAD^'])).trim(), original)
  assert.equal((await git.command(['rev-parse', 'HEAD^{tree}'])).trim(), failed.checkpoint.tree)
  assert.equal((await git.command(['rev-parse', failed.backup])).trim(), original)
  // A full page reload reopens the same repository and persistent operation log.
  await page.reload(); await dismissSetup(); await button('Gitviz 版本树').click()
  await page.locator('.operation-history > summary').click()
  await page.locator('.operation-record summary').filter({ hasText: '恢复存档 · 已完成' }).waitFor()
  const rejections = await Promise.all(rejectedRequests)
  assert.equal(rejections.length, 2)
  assert.ok(rejections.every(response => response.status === 400))
  assert.match(rejections[0].error, /dsh-recovery-hook-rejected/)
  assert.match(rejections[1].error, /工作文件/)
  assert.deepEqual(errors, [])
  await fs.writeFile(path.join(out, 'recovery-dsh-result.json'), JSON.stringify({ root: fixture.root, installedPackageAfterRestart: true, confirmation: true, cancelReadOnly: true, changedFilesRejected: true, exactTreeParentBackup: true, persistedAfterPageReload: true, errors }, null, 2))
  console.log('PASS DSH installed package, confirmation, recovery, stale files and page reload persistence')
  await browser.close()
})().catch(error => { console.error(error); process.exit(1) })

// Actual DSH plugin management UI, installed package, real Git hook and worker.
/* global document */
const fs = require('node:fs/promises'), path = require('node:path'), assert = require('node:assert/strict')
const { setTimeout: delay } = require('node:timers/promises')
const { chromium } = require(process.env.PLAYWRIGHT_CORE_PATH || 'playwright-core')
const out = process.env.GITVIZ_DESKTOP_TEST_ROOT
if (!out || !path.isAbsolute(out)) throw Error('Explicit absolute scratch directory required')
process.env.GITVIZ_LARGE_TEST_ROOT = out
const { largeRepo } = require('./helpers/large-repo.cjs')
;(async () => {
  const f = await largeRepo(25), original = await f.git.head()
  const browser = await chromium.connectOverCDP(process.env.GITVIZ_CDP_URL || 'http://127.0.0.1:9235')
  try {
    const page = browser.contexts().flatMap(context => context.pages()).find(p => p.url().startsWith('http://127.0.0.1:3087/'))
    assert.ok(page, 'Isolated DSH is open')
    const button = name => page.getByRole('button', { name, exact: true })
    const toggle = page.getByRole('switch', { name: '启用 Gitviz 版本树', exact: true })
    const wait = async (check, label) => {
      const deadline = Date.now() + 45000
      while (Date.now() < deadline) { if (await check()) return; await delay(100) }
      throw Error('Timed out: ' + label)
    }
    await button('Gitviz 版本树').click(); await page.locator('.repo-picker').click()
    await page.getByLabel('本机仓库的绝对路径').fill(f.root); await button('展开版本树').click()
    await page.waitForFunction(root => document.querySelector('.repo-picker')?.title.replaceAll('\\', '/') === root.replaceAll('\\', '/'), f.root)
    await page.waitForFunction(() => document.querySelector('.history-controls')?.textContent.includes('25 / 25'))
    await page.locator('.map-viewport').press('End')
    await page.locator(`.save-node.selected[data-oid="${f.first}"]`).waitFor()
    const quote = value => "'" + value.replaceAll('\\', '/').replaceAll("'", "'\\''") + "'"
    await fs.writeFile(path.join(f.root, '.git/hooks/pre-commit'), `#!/bin/sh\nexec ${quote(process.execPath)} ${quote(path.join(__dirname, 'helpers/gated-git-hook.cjs'))}\n`, { mode: 0o755 })
    await button('恢复此存档').click(); await button('备份并恢复为新提交').click()
    await wait(() => fs.stat(path.join(f.root, '.git/lifecycle-entered')).then(() => true, () => false), 'hook entered')
    const workerPid = Number(await fs.readFile(path.join(f.root, '.git/gitviz-operation.lock'), 'utf8'))
    assert.equal((await f.git.operations()).records[0].state, 'running')
    await button('插件').click(); await button('查看 Gitviz 版本树').click()
    assert.equal(await toggle.getAttribute('aria-checked'), 'true')
    await toggle.click()
    await page.waitForFunction(() => document.querySelector('[role="switch"][aria-label="启用 Gitviz 版本树"]')?.getAttribute('aria-checked') === 'false')
    await button('Gitviz 版本树').waitFor({ state: 'hidden' })
    assert.equal(await page.locator('style[data-plugin="@fisharly/gitviz-dsh"]').count(), 0)
    process.kill(workerPid, 0)
    await fs.writeFile(path.join(f.root, '.git/lifecycle-release'), '')
    await wait(async () => (await f.git.operations()).records[0]?.state === 'completed', 'disabled worker completed')
    await wait(() => fs.stat(path.join(f.root, '.git/gitviz-operation.lock')).then(() => false, () => true), 'lock released')
    assert.equal((await f.git.command(['rev-parse', 'HEAD^'])).trim(), original)
    assert.equal((await f.git.command(['rev-parse', 'HEAD^{tree}'])).trim(), (await f.git.command(['rev-parse', `${f.first}^{tree}`])).trim())
    assert.equal(await f.git.status(), '')
    await page.screenshot({ path: path.join(out, 'dsh-disabled-worker-completed.png') })
    await toggle.click()
    await button('Gitviz 版本树').click(); await page.locator('.save-node').first().waitFor()
    await page.locator('.operation-history > summary').click()
    await page.locator('.operation-record summary').filter({ hasText: '恢复存档 · 已完成' }).waitFor()
    assert.equal((await f.git.operations()).records.length, 1)
    await fs.writeFile(path.join(out, 'dsh-lifecycle-native.json'), JSON.stringify({ root: f.root, installedPackage: true, pluginManagerDisabledDuringHook: true, sidebarAndStylesReleased: true, workerPid, completedWhileDisabled: true, reEnabledRecordVisible: true, exactParentAndTree: true, clean: true, lockReleased: true }, null, 2))
    console.log('PASS real DSH plugin manager disable during hook, worker completes, re-enable shows completed record')
  } finally {
    await fs.writeFile(path.join(f.root, '.git/lifecycle-release'), '')
    await browser.close().catch(() => {})
  }
})().catch(error => { console.error(error); process.exitCode = 1 })

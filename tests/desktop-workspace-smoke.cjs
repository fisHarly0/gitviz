// Real desktop/WebView2 and isolated Git repository; no standalone browser.
/* global document, innerWidth */
const assert = require('node:assert/strict'), fs = require('node:fs/promises'), path = require('node:path')
const { spawn, execFile } = require('node:child_process'), { promisify } = require('node:util')
const { setTimeout: delay } = require('node:timers/promises')
const out = process.env.GITVIZ_DESKTOP_TEST_ROOT, executable = process.env.GITVIZ_DESKTOP_EXECUTABLE
if (process.platform !== 'win32' || !out || !path.isAbsolute(out) || !executable || !path.isAbsolute(executable)) throw Error('Windows and absolute fixture/output executable paths required')
const { chromium } = require(process.env.PLAYWRIGHT_CORE_PATH || 'playwright-core')
process.env.GITVIZ_LARGE_TEST_ROOT = out
const { largeRepo } = require('./helpers/large-repo.cjs')
const cdp = 'http://127.0.0.1:9248', results = {}, errors = []
const until = async (check, label) => {
  const end = Date.now() + 45000
  while (Date.now() < end) { if (await check()) return; await delay(100) }
  throw Error(`Timed out: ${label}`)
}
;(async () => {
  assert.equal(await fetch(`${cdp}/json/version`).then(() => true, () => false), false, 'CDP port must be unused')
  await fs.mkdir(out, { recursive: true })
  const f = await largeRepo(2000), original = await f.git.head()
  const longBranch = 'if-试验路线-' + 'long-branch-'.repeat(8)
  await f.git.command(['branch', longBranch])
  const profile = await fs.mkdtemp(path.join(out, 'profile-'))
  const child = spawn(executable, [], { cwd: out, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, TEMP: out, TMP: out, WEBVIEW2_USER_DATA_FOLDER: profile, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: '--remote-debugging-port=9248' } })
  let exited = false, exitCode, log = '', browser, p
  child.on('error', error => { log += error.message; exited = true })
  child.on('exit', code => { exited = true; exitCode = code })
  child.stdout.on('data', value => { log += value }); child.stderr.on('data', value => { log += value })
  try {
    await until(async () => { if (exited) throw Error(`App exited: ${log}`); return fetch(`${cdp}/json/version`).then(r => r.ok, () => false) }, 'native startup')
    browser = await chromium.connectOverCDP(cdp)
    await until(() => { p = browser.contexts().flatMap(c => c.pages()).find(page => /tauri\.localhost/.test(page.url())); return p }, 'Tauri page')
    p.on('pageerror', error => errors.push(error.message))
    const button = name => p.getByRole('button', { name, exact: true })
    await p.getByLabel('本机仓库路径').fill(f.root)
    await button('打开仓库').click()
    await p.locator('.save-node').first().waitFor()
    await button('连续加载全部').click()
    await p.locator('.history-progress').getByText('本机可达历史已载完', { exact: false }).waitFor()
    const disclosure = p.locator('.branch-disclosure'), summary = disclosure.locator(':scope > summary')
    assert.equal(await disclosure.getAttribute('open'), null)
    for (const width of [1280, 960]) {
      await p.setViewportSize({ width, height: width === 960 ? 600 : 800 })
      await p.locator('.map-viewport').press('Home')
      const bounds = await p.locator('.map-viewport').boundingBox()
      assert.ok(bounds.height >= (width === 960 ? 140 : 320), `usable map height at ${width}: ${bounds.height}`)
      assert.equal(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
      results[`map${width}`] = bounds
      await p.screenshot({ path: path.join(out, `map-${width}.png`) })
    }
    await summary.focus(); await p.keyboard.press('Enter')
    await p.locator('.branch-chip').filter({ hasText: longBranch }).waitFor()
    await p.locator('.branch-chip').filter({ hasText: longBranch }).click()
    await button('确认操作').click()
    await until(async () => (await f.git.branch()) === longBranch, 'confirmed branch switch')
    await p.waitForFunction(branch => document.querySelector('.desktop-history-position')?.textContent.includes(branch), longBranch)
    if (await button('连续加载全部').isVisible()) {
      await button('连续加载全部').click()
      await p.locator('.history-progress').getByText('本机可达历史已载完', { exact: false }).waitFor()
    }
    await summary.click()
    await until(async () => (await summary.textContent()).includes(longBranch), 'current branch label')
    assert.equal(await disclosure.getAttribute('open'), null)
    assert.equal(await p.locator('.export-btn').isVisible(), true, 'export remains visible with branch list collapsed')
    assert.equal(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
    assert.ok((await p.locator('.map-viewport').boundingBox()).height >= 180)
    await p.screenshot({ path: path.join(out, 'long-branch-960.png') })
    assert.equal(await f.git.head(), original)
    assert.equal(await f.git.status(), '')
    await summary.focus(); await p.keyboard.press('Enter'); await summary.press('Enter')
    assert.equal(await summary.evaluate(element => document.activeElement === element), true)
    assert.equal(await p.locator('.branch-chip.main').isVisible(), false)
    results.branchDisclosureKeyboardAndExport = true

    // A real rejected commit must remain recoverable through the new direct link.
    await p.locator('.map-viewport').press('End')
    const hook = path.join(f.root, '.git/hooks/pre-commit')
    await fs.writeFile(hook, '#!/bin/sh\necho workspace-hook-rejected >&2\nexit 1\n')
    await button('恢复此存档').click(); await button('备份并恢复').click()
    const alert = p.locator('.desktop-action-error')
    await alert.waitFor()
    assert.equal(await alert.locator('details').getAttribute('open'), null)
    await alert.locator('summary').focus(); await p.keyboard.press('Enter')
    assert.match(await alert.innerText(), /workspace-hook-rejected/)
    await alert.locator('summary').press('Enter')
    await button('查看操作记录').click()
    const history = p.locator('.operation-history')
    await until(async () => await history.getAttribute('open') !== null, 'records expanded')
    assert.equal(await history.locator(':scope > summary').evaluate(element => document.activeElement === element), true)
    const failed = history.locator('.operation-record').filter({ hasText: '恢复存档 · 未完成' })
    await failed.locator('summary').click()
    await p.screenshot({ path: path.join(out, 'failure-recovery-960.png') })
    assert.equal(await f.git.head(), original)
    await fs.unlink(hook)
    await button('检查并继续提交').click()
    await p.getByRole('dialog').getByRole('button', { name: '检查并继续提交', exact: true }).click()
    await history.locator('summary').filter({ hasText: '恢复存档 · 已完成' }).waitFor()
    assert.equal(await p.locator('.desktop-action-error').count(), 0)
    assert.equal((await f.git.command(['rev-parse', 'HEAD^'])).trim(), original)
    assert.equal((await f.git.command(['rev-parse', 'HEAD^{tree}'])).trim(), (await f.git.command(['rev-parse', `${f.first}^{tree}`])).trim())
    assert.equal(await f.git.status(), '')
    results.directRecoveryFocusAndGitOutcome = true
    assert.deepEqual(errors, [])
    await promisify(execFile)('powershell.exe', ['-NoProfile', '-File', path.join(__dirname, 'helpers/request-desktop-close.ps1'), '-AppProcessId', String(child.pid), '-ExpectedExecutable', executable], { windowsHide: true })
    await until(() => exited, 'normal close'); assert.equal(exitCode, 0)
    await fs.writeFile(path.join(out, 'result.json'), JSON.stringify({ ...results, fixture: f.root, original, errors, exitCode }, null, 2))
    console.log('PASS desktop map space, branch disclosure, export, keyboard and real failed-commit recovery')
  } catch (error) {
    if (p && !p.isClosed()) {
      await p.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {})
      await fs.writeFile(path.join(out, 'failure.txt'), await p.locator('.app').textContent().catch(() => 'WebView unavailable'))
    }
    throw error
  } finally {
    await browser?.close().catch(() => {})
    if (!exited) child.kill()
    await fs.writeFile(path.join(out, 'native.log'), log)
  }
})().catch(error => { console.error(error); process.exitCode = 1 })

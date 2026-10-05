// Connect to an isolated VS Code installation with a generated fixture open.
/* global document */
const fs = require('node:fs/promises'), path = require('node:path'), assert = require('node:assert/strict')
const out = process.env.GITVIZ_DESKTOP_TEST_ROOT, fixturePath = process.env.GITVIZ_HOST_FIXTURE
if (!out || !path.isAbsolute(out) || !fixturePath || !path.isAbsolute(fixturePath)) throw new Error('Explicit scratch directory and fixture JSON required')
const { chromium } = require(process.env.PLAYWRIGHT_CORE_PATH || 'playwright-core')
const { GitService } = require('../extensions/vscode/git-service.cjs')
;(async () => {
  const fixture = JSON.parse(await fs.readFile(fixturePath, 'utf8')), git = new GitService(fixture.root)
  const relative = path.relative(out, fixture.root)
  if (!relative || relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) throw new Error('Fixture repository must be inside the scratch directory')
  const browser = await chromium.connectOverCDP(process.env.GITVIZ_CDP_URL || 'http://127.0.0.1:9235')
  const page = browser.contexts().flatMap(context => context.pages()).find(page => page.url().startsWith('vscode-file:'))
  const webview = await page.waitForSelector('iframe.webview', { state: 'attached' })
  const frame = await webview.contentFrame(), dialog = page.getByRole('dialog')
  if (!frame) throw new Error('VS Code Webview is not attached yet')
  const read = () => frame.evaluate(() => document.querySelector('#active-frame')?.contentDocument?.body.innerText || '')
  const click = async (label, selector = 'button') => {
    await wait(() => frame.evaluate(({ label, selector }) => {
      const d = document.querySelector('#active-frame').contentDocument
      return [...d.querySelectorAll(selector)].some(element => !element.disabled && (element.textContent.trim() === label || element.getAttribute('aria-label') === label))
    }, { label, selector }))
    return frame.evaluate(({ label, selector }) => {
    const d = document.querySelector('#active-frame').contentDocument
    const element = [...d.querySelectorAll(selector)].find(element => element.textContent.trim() === label || element.getAttribute('aria-label') === label)
    if (!element || element.disabled) throw Error('Unavailable: ' + label)
    element.click()
    }, { label, selector })
  }
  const wait = async predicate => {
    const until = Date.now() + 30000
    while (Date.now() < until) { if (await predicate()) return; await new Promise(resolve => setTimeout(resolve, 150)) }
    throw Error('Timed out: ' + (await read()).slice(-1800))
  }
  await wait(async () => (await read()).includes('25 / 25'))
  await wait(() => frame.evaluate(root => document.querySelector('#active-frame')?.contentDocument?.querySelector('.repo-picker')?.getAttribute('title')?.replaceAll('\\', '/') === root.replaceAll('\\', '/'), fixture.root))
  const original = await git.head(), hook = path.join(fixture.root, '.git/hooks/pre-commit')
  await frame.evaluate(() => { const d = document.querySelector('#active-frame').contentDocument; d.querySelector('.map-viewport').dispatchEvent(new d.defaultView.KeyboardEvent('keydown', { key: 'End', bubbles: true })) })
  await wait(async () => (await read()).includes('root-marker'))
  await fs.writeFile(hook, '#!/bin/sh\necho vscode-recovery-hook-rejected >&2\nexit 1\n', { mode: 0o755 })
  await click('恢复此存档'); await page.getByRole('button', { name: '备份并恢复为新提交', exact: true }).click()
  await wait(async () => (await read()).includes('vscode-recovery-hook-rejected'))
  await click('操作记录与恢复', '.operation-history > summary')
  await wait(async () => (await read()).includes('恢复存档 · 未完成'))
  await click('恢复存档 · 未完成', '.operation-record summary > span')
  await click('检查并继续提交'); await dialog.waitFor()
  assert.match(await dialog.innerText(), /counter.txt/)
  await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'hidden' })
  const failed = (await git.operations()).records.find(record => record.action === 'restore')
  assert.equal(failed.attempts, 1); assert.equal(await git.head(), original)
  await click('检查并继续提交'); await dialog.waitFor()
  await fs.writeFile(path.join(fixture.root, 'counter.txt'), 'external after preview\n')
  await page.getByRole('button', { name: '检查并继续提交', exact: true }).click()
  await wait(async () => (await read()).includes('工作文件'))
  assert.equal(await git.head(), original)
  assert.equal(await fs.readFile(path.join(fixture.root, 'counter.txt'), 'utf8'), 'external after preview\n')
  await git.command(['restore', '--worktree', '--', 'counter.txt']); await fs.unlink(hook)
  await click('检查并继续提交'); await dialog.waitFor()
  await page.getByRole('button', { name: '检查并继续提交', exact: true }).click()
  await wait(async () => (await read()).includes('恢复存档 · 已完成'))
  assert.equal(await git.status(), '')
  assert.equal((await git.command(['rev-parse', 'HEAD^'])).trim(), original)
  assert.equal((await git.command(['rev-parse', 'HEAD^{tree}'])).trim(), failed.checkpoint.tree)
  assert.equal((await git.command(['rev-parse', failed.backup])).trim(), original)
  await page.screenshot({ path: path.join(out, 'recovery-vscode.png') })
  await fs.writeFile(path.join(out, 'recovery-vscode-result.json'), JSON.stringify({ root: fixture.root, installedPackage: true, nativeConfirmation: true, cancelReadOnly: true, externalChangesRejected: true, restoreResumed: true, exactTreeParentBackup: true }, null, 2))
  console.log('PASS VS Code installed package, native recovery confirmation, cancellation and external change protection')
  await browser.close()
})().catch(error => { console.error(error); process.exit(1) })

// Installed VSIX in an isolated VS Code profile; no simulated Git or extension messages.
/* global document */
const fs = require('node:fs/promises'), path = require('node:path'), assert = require('node:assert/strict')
const { setTimeout: delay } = require('node:timers/promises')
const { chromium } = require(process.env.PLAYWRIGHT_CORE_PATH || 'playwright-core')
const { GitService } = require('../extensions/vscode/git-service.cjs')
const out = process.env.GITVIZ_DESKTOP_TEST_ROOT, fixturePath = process.env.GITVIZ_HOST_FIXTURE
if (!out || !path.isAbsolute(out) || !fixturePath || !path.isAbsolute(fixturePath)) throw new Error('Explicit scratch and fixture paths required')
;(async () => {
  const fixture = JSON.parse(await fs.readFile(fixturePath, 'utf8'))
  const relative = path.relative(out, fixture.root)
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Fixture must be inside scratch directory')
  const git = await GitService.open(fixture.root), original = await git.head()
  const browser = await chromium.connectOverCDP(process.env.GITVIZ_CDP_URL || 'http://127.0.0.1:9235')
  const page = browser.contexts().flatMap(context => context.pages()).find(p => p.url().startsWith('vscode-file:'))
  try {
  const welcome = page.getByRole('button', { name: 'Continue without Signing In', exact: true })
  if (await welcome.isVisible()) await welcome.click()
  const next = page.getByRole('button', { name: 'Continue', exact: true })
  if (await next.isVisible()) await next.click()
  const start = page.getByRole('button', { name: 'Get Started', exact: true })
  if (await start.isVisible()) await start.click()
  const wait = async (check, label) => {
    const end = Date.now() + 45000
    while (Date.now() < end) { if (await check()) return; await delay(100) }
    throw new Error(`Timed out: ${label}`)
  }
  const command = async title => {
    await page.keyboard.press('F1')
    await page.locator('.quick-input-widget input').fill('>' + title)
    await page.keyboard.press('Enter')
  }
  const getFrame = async () => (await page.waitForSelector('iframe.webview', { state: 'attached' })).contentFrame()
  let frame
  const read = () => frame.evaluate(() => document.querySelector('#active-frame')?.contentDocument?.body.innerText || '')
  const click = label => frame.evaluate(label => {
    const doc = document.querySelector('#active-frame').contentDocument
    const button = [...doc.querySelectorAll('button')].find(b => b.textContent.trim() === label)
    if (!button || button.disabled) throw Error('Unavailable: ' + label)
    button.click()
  }, label)
  await command('Gitviz: 打开交互式版本树'); frame = await getFrame()
  await wait(async () => (await read()).includes('25 / 25'), 'map loaded')
  await frame.evaluate(() => {
    const doc = document.querySelector('#active-frame').contentDocument
    doc.querySelector('.map-viewport').dispatchEvent(new doc.defaultView.KeyboardEvent('keydown', { key: 'End', bubbles: true }))
  })
  await wait(async () => (await read()).includes('root-marker'), 'oldest selected')
  const quote = value => "'" + value.replaceAll('\\', '/').replaceAll("'", "'\\''") + "'"
  await fs.writeFile(path.join(fixture.root, '.git/hooks/pre-commit'), `#!/bin/sh\nexec ${quote(process.execPath)} ${quote(path.join(__dirname, 'helpers/gated-git-hook.cjs'))}\n`, { mode: 0o755 })
  try {
    await click('恢复此存档')
    const dialog = page.getByRole('dialog')
    assert.ok((await dialog.innerText()).replaceAll('\\', '/').includes(fixture.root.replaceAll('\\', '/')))
    await page.getByRole('button', { name: '备份并恢复为新提交', exact: true }).click()
    await wait(() => fs.stat(path.join(fixture.root, '.git/lifecycle-entered')).then(() => true, () => false), 'real worker hook')
    const workerPid = Number(await fs.readFile(path.join(fixture.root, '.git/gitviz-operation.lock'), 'utf8'))
    assert.equal((await git.operations()).records[0].state, 'running')
    await page.keyboard.press('Control+w')
    await wait(() => frame.isDetached(), 'panel closed')
    await command('Gitviz: 打开交互式版本树'); frame = await getFrame()
    await wait(async () => (await read()).includes('有未提交修改'), 'reopened panel sees worktree')
    await page.screenshot({ path: path.join(out, 'lifecycle-vscode-running.png') })
    const disconnected = new Promise(resolve => browser.once('disconnected', resolve))
    await command('Gitviz Fixture Quit')
    await Promise.race([disconnected, delay(15000).then(() => { throw Error('VS Code did not close') })])
    process.kill(workerPid, 0)
    await fs.writeFile(path.join(fixture.root, '.git/lifecycle-release'), '')
    await wait(async () => (await git.operations()).records[0]?.state === 'completed', 'worker finished after VS Code quit')
    await wait(() => fs.stat(path.join(fixture.root, '.git/gitviz-operation.lock')).then(() => false, () => true), 'lock released')
    const record = (await git.operations()).records[0]
    assert.equal((await git.command(['rev-parse', 'HEAD^'])).trim(), original)
    assert.equal((await git.command(['rev-parse', 'HEAD^{tree}'])).trim(), (await git.command(['rev-parse', `${fixture.first}^{tree}`])).trim())
    assert.equal(await git.status(), '')
    await fs.writeFile(path.join(out, 'lifecycle-vscode-result.json'), JSON.stringify({ installedPackage: true, nativeConfirmation: true, panelCloseAndReopen: true, applicationQuitDuringHook: true, workerPid, completed: record.id, head: await git.head(), lockReleased: true }, null, 2))
    console.log('PASS installed VSIX: panel close/reopen, actual VS Code quit, independent worker completed')
  } finally { await fs.writeFile(path.join(fixture.root, '.git/lifecycle-release'), '') }
  } finally { await browser.close().catch(() => {}) }
})().catch(error => { console.error(error); process.exitCode = 1 })

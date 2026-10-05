// Installed VSIX: bad git.path -> useful native error -> corrected setting -> actual map.
/* global document */
const fs = require('node:fs/promises'), path = require('node:path'), assert = require('node:assert/strict')
const { setTimeout: delay } = require('node:timers/promises')
const { GitService } = require('../extensions/vscode/git-service.cjs')
const out = process.env.GITVIZ_FIRST_USE_PLUGIN_ROOT
if (!out || !path.isAbsolute(out)) throw Error('Explicit isolated profile required')
const { chromium } = require(process.env.PLAYWRIGHT_CORE_PATH || 'playwright-core')
const wait = async (check, label) => { const deadline = Date.now() + 45000; while (Date.now() < deadline) { if (await check()) return; await delay(100) } throw Error('Timed out: ' + label) }
;(async () => {
  const fixture = JSON.parse(await fs.readFile(path.join(out, 'fixture.json'), 'utf8')), git = new GitService(fixture.repo)
  const head = await git.head(), refs = await git.command(['show-ref']), status = await git.status()
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9235')
  try {
    let page = browser.contexts().flatMap(c => c.pages()).find(p => p.url().startsWith('vscode-file:'))
    const command = async title => {
      await wait(async () => {
        for (const label of ['Continue without Signing In', 'Continue', 'Get Started']) { const button = page.getByRole('button', { name: label, exact: true }); if (await button.isVisible()) await button.click() }
        await page.keyboard.press('F1')
        return page.locator('.quick-input-widget input').waitFor({ timeout: 1000 }).then(() => true, () => false)
      }, 'command palette')
      await page.locator('.quick-input-widget input').fill('>' + title)
      await page.locator('.quick-input-list .monaco-list-row').filter({ hasText: title }).first().click()
    }
    await command('Gitviz: 打开交互式版本树')
    const notice = page.locator('.notification-list-item').filter({ hasText: 'Gitviz：无法启动 Git' }).first()
    await notice.waitFor()
    const text = await notice.innerText()
    assert.match(text, /git --version/); assert.match(text, /PATH/); assert.match(text, /git.path/)
    await page.screenshot({ path: path.join(out, 'missing-git.png') })
    const settingsFile = path.join(out, 'profile/User/settings.json'), settings = JSON.parse(await fs.readFile(settingsFile, 'utf8'))
    settings['git.path'] = fixture.git
    await fs.writeFile(settingsFile, JSON.stringify(settings, null, 2))
    await command('Developer: Reload Window')
    await delay(1500)
    await wait(() => { page = browser.contexts().flatMap(c => c.pages()).find(p => p.url().startsWith('vscode-file:')); return !!page }, 'reloaded workbench')
    await command('Gitviz: 打开交互式版本树')
    const frame = await (await page.waitForSelector('iframe.webview', { state: 'attached' })).contentFrame()
    await wait(() => frame.evaluate(oid => document.querySelector('#active-frame')?.contentDocument?.querySelector('.journey-bar')?.textContent.includes(oid), head.slice(0, 7)), 'actual history after correction')
    assert.equal(await git.head(), head); assert.equal(await git.command(['show-ref']), refs); assert.equal(await git.status(), status)
    await page.screenshot({ path: path.join(out, 'recovered.png') })
    await fs.writeFile(path.join(out, 'result.json'), JSON.stringify({ realMissingExecutable: true, actionableNativeNotification: true, correctedGitPathAndReload: true, actualHistoryLoaded: true, gitUnchanged: true }, null, 2))
    console.log('PASS installed VS Code missing Git diagnosis and configuration recovery')
    await page.locator('.menubar-menu-button').filter({ hasText: /^File$/ }).click()
    await page.locator('.monaco-menu .action-label').filter({ hasText: /^Exit$/ }).click()
  } finally { await browser.close().catch(() => {}) }
})().catch(error => { console.error(error); process.exitCode = 1 })

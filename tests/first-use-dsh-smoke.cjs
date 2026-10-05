// Real DSH service started with missing Git, then restarted with normal PATH.
/* global document */
const fs = require('node:fs/promises'), path = require('node:path'), assert = require('node:assert/strict')
const { setTimeout: delay } = require('node:timers/promises')
const { GitService } = require('../extensions/vscode/git-service.cjs')
const out = process.env.GITVIZ_FIRST_USE_DSH_ROOT, phase = process.argv[2]
if (!out || !path.isAbsolute(out) || !['missing', 'restored'].includes(phase)) throw Error('Explicit scratch and missing|restored required')
const { chromium } = require(process.env.PLAYWRIGHT_CORE_PATH || 'playwright-core')
const wait = async (check, label) => { const deadline = Date.now() + 45000; while (Date.now() < deadline) { if (await check()) return; await delay(100) } throw Error('Timed out: ' + label) }
;(async () => {
  const fixture = JSON.parse(await fs.readFile(path.join(out, 'fixture.json'), 'utf8')), git = new GitService(fixture.repo)
  const head = await git.head(), refs = await git.command(['show-ref']), status = await git.status()
  let url
  await wait(async () => { url = (await fs.readFile(path.join(out, `server-${phase}.log`), 'utf8')).match(/http:\/\/127\.0\.0\.1:3087\/\S*/)?.[0].split(String.fromCharCode(27))[0]; return !!url }, 'server ready')
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9235')
  try {
    let page = browser.contexts().flatMap(c => c.pages()).find(p => p.url().startsWith('http://127.0.0.1:3087/'))
    if (!page) {
      const shell = browser.contexts().flatMap(c => c.pages()).find(p => p.url().startsWith('vscode-file:'))
      await wait(async () => {
        for (const name of ['Continue without Signing In', 'Continue', 'Get Started']) { const button = shell.getByRole('button', { name, exact: true }); if (await button.isVisible()) await button.click() }
        await shell.keyboard.press('F1')
        return shell.locator('.quick-input-widget input').waitFor({ timeout: 1000 }).then(() => true, () => false)
      }, 'browser workbench ready')
      await shell.keyboard.press('F1'); await shell.locator('.quick-input-widget input').fill('>Browser: Open Integrated Browser')
      await shell.locator('.quick-input-list .monaco-list-row').filter({ hasText: 'Browser: Open Integrated Browser' }).first().click()
      const address = shell.locator('input[aria-label="Search or enter URL"]')
      await address.fill(url); await address.press('Enter')
      await wait(() => { page = browser.contexts().flatMap(c => c.pages()).find(p => p.url().startsWith('http://127.0.0.1:3087/')); return !!page }, 'DSH integrated page')
    } else await page.goto(url)
    const button = name => page.getByRole('button', { name, exact: true })
    if (await button('继续').isVisible()) await button('继续').click()
    try { await button('稍后配置').waitFor({ timeout: 4000 }); await button('稍后配置').click() } catch (error) { if (error.name !== 'TimeoutError') throw error }
    await button('Gitviz 版本树').click(); await page.locator('.repo-picker').click()
    await page.getByLabel('本机仓库的绝对路径').fill(fixture.repo); await button('展开版本树').click()
    if (phase === 'missing') {
      const notice = page.locator('.tree-message[role=alert]').filter({ hasText: '无法启动 Git' }); await notice.waitFor()
      const text = await notice.innerText(); assert.match(text, /git --version/); assert.match(text, /PATH/); assert.match(text, /重新打开/)
      const state = await page.locator('.journey-bar').innerText()
      assert.match(state, /尚未打开仓库/); assert.doesNotMatch(state, /工作区干净|当前位置与工作文件一致/)
      assert.match(await page.locator('.tree-status').innerText(), /尚未读取历史/)
    } else await page.waitForFunction(oid => document.querySelector('.journey-bar')?.textContent.includes(oid), head.slice(0, 7))
    const client = await require('./helpers/dsh-client-source.cjs')(page, path.join(process.env.GITVIZ_FIRST_USE_DSH_HOME, 'profiles/web/node_modules/@fisharly/gitviz-dsh'))
    assert.equal(await git.head(), head); assert.equal(await git.command(['show-ref']), refs); assert.equal(await git.status(), status)
    await page.screenshot({ path: path.join(out, phase + '.png') })
    await fs.writeFile(path.join(out, `result-${phase}.json`), JSON.stringify({ phase, passed: true, actualNativePanel: true, gitUnchanged: true, ...client }, null, 2))
    console.log(`PASS DSH first use ${phase}: actual panel and unchanged repository`)
  } finally { await browser.close().catch(() => {}) }
})().catch(error => { console.error(error.name + ': ' + error.message.replace(/http:\/\/127\.0\.0\.1:3087\/\S+/g, '[isolated DSH URL]')); process.exitCode = 1 })

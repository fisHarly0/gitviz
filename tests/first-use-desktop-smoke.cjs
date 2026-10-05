// Real packaged desktop, keyboard entry and missing Git in an isolated process PATH.
/* global document, window */
const fs = require('node:fs/promises'), path = require('node:path'), assert = require('node:assert/strict')
const { spawn, execFile } = require('node:child_process'), { promisify } = require('node:util')
const { setTimeout: delay } = require('node:timers/promises')
const { GitService } = require('../extensions/vscode/git-service.cjs')
const out = process.env.GITVIZ_FIRST_USE_ROOT, executable = process.env.GITVIZ_DESKTOP_EXECUTABLE
if (process.platform !== 'win32' || !out || !path.isAbsolute(out) || !executable || !path.isAbsolute(executable)) throw Error('Windows, new absolute scratch and executable required')
const execute = promisify(execFile), endpoint = 'http://127.0.0.1:9348'
const wait = async (check, label) => { const until = Date.now() + 45000; while (Date.now() < until) { if (await check()) return; await delay(100) } throw Error('Timed out: ' + label) }
const { chromium } = require(process.env.PLAYWRIGHT_CORE_PATH || 'playwright-core')
async function withApp(name, env, run) {
  assert.equal(await fetch(endpoint + '/json/version').then(() => true, () => false), false)
  const child = spawn(executable, [], { cwd: out, windowsHide: true, stdio: 'ignore', env: { ...process.env, TEMP: out, TMP: out, WEBVIEW2_USER_DATA_FOLDER: path.join(out, name + '-profile'), WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: '--remote-debugging-port=9348', ...env } })
  let ended = false, browser
  child.on('exit', () => { ended = true })
  try {
    await wait(() => fetch(endpoint + '/json/version').then(r => r.ok, () => false), 'WebView startup')
    browser = await chromium.connectOverCDP(endpoint)
    let page
    await wait(() => { page = browser.contexts().flatMap(c => c.pages()).find(p => /tauri\.localhost/.test(p.url())); return !!page }, 'native page')
    const errors = []; page.on('pageerror', error => errors.push(error.message))
    await page.getByLabel('本机仓库路径').waitFor()
    try { await run(page) }
    catch (error) { await page.screenshot({ path: path.join(out, name + '-failure.png') }); throw error }
    assert.deepEqual(errors, [])
    await execute('powershell.exe', ['-NoProfile', '-File', path.join(__dirname, 'helpers/request-desktop-close.ps1'), '-AppProcessId', String(child.pid), '-ExpectedExecutable', executable], { windowsHide: true })
    await wait(() => ended, 'normal desktop close')
  } finally {
    await browser?.close().catch(() => {})
    if (!ended) child.kill()
    await wait(() => fetch(endpoint + '/json/version').then(() => false, () => true), 'owned CDP closed')
  }
}
;(async () => {
  await fs.mkdir(out)
  process.env.GITVIZ_LARGE_TEST_ROOT = out
  const f = await require('./helpers/large-repo.cjs').largeRepo(25), head = await f.git.head(), refs = await f.git.command(['show-ref'])
  const empty = path.join(out, '空仓库 empty'); await fs.mkdir(empty)
  const emptyGit = new GitService(empty); await emptyGit.command(['init', '-b', 'main'])
  const missingPath = [path.join(out, 'no-git-bin'), path.join(process.env.SystemRoot, 'System32'), process.env.SystemRoot].join(path.delimiter)
  const open = async (page, folder) => { await page.getByLabel('本机仓库路径').fill(folder); await page.getByLabel('本机仓库路径').press('Enter') }
  await withApp('missing-git', { PATH: missingPath }, async page => {
    await page.setViewportSize({ width: 960, height: 600 })
    await open(page, f.root)
    await page.getByRole('alert').filter({ hasText: 'Git 未能启动' }).waitFor()
    const text = await page.locator('.git-read-error').innerText()
    assert.match(text, /git --version/); assert.match(text, /PATH/); assert.match(text, /重新打开/)
    await page.getByRole('button', { name: '重新读取', exact: true }).click()
    await page.getByRole('alert').filter({ hasText: 'Git 未能启动' }).waitFor()
    await page.screenshot({ path: path.join(out, 'missing-git-960.png') })
    assert.equal(await f.git.head(), head); assert.equal(await f.git.status(), '')
  })
  await withApp('normal', {}, async page => {
    const button = name => page.getByRole('button', { name, exact: true })
    for (const [width, height] of [[1280, 800], [960, 600]]) {
      await page.setViewportSize({ width, height })
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true)
      await page.screenshot({ path: path.join(out, `start-${width}.png`) })
    }
    const bad = path.join(out, '不存在的仓库')
    await open(page, bad); await page.locator('.repo-loader [role=alert]').waitFor()
    assert.equal(await page.getByLabel('本机仓库路径').inputValue(), bad)
    assert.equal(await button('打开仓库').isEnabled(), true)
    await open(page, f.root); await page.locator('.save-node').first().waitFor()
    await page.locator('.map-viewport').press('End')
    await page.locator(`.save-node.selected[data-oid="${f.first}"]`).waitFor()
    assert.match(await page.locator('.preview-banner').innerText(), /工作文件未切换/)
    assert.match(await page.locator('.mode-status-bar').innerText(), new RegExp(head.slice(0, 7)))
    const fileButton = page.getByRole('button', { name: /新增 counter.txt/ })
    await fileButton.focus(); await fileButton.press('Space')
    assert.equal(await fileButton.getAttribute('aria-pressed'), 'true')
    await page.screenshot({ path: path.join(out, 'preview-960.png') })
    await button('返回实际位置（main）').click()
    await page.locator(`.save-node.selected[data-oid="${head}"]`).waitFor()
    assert.equal(await f.git.head(), head); assert.equal(await f.git.command(['show-ref']), refs); assert.equal(await f.git.status(), '')
    await button('更换仓库').click(); await open(page, empty)
    await page.getByText('这个仓库还没有存档点。', { exact: true }).waitFor()
    assert.equal(await page.locator('.desktop-actions').getByRole('button', { name: '恢复此存档', exact: true }).isDisabled(), true)
    await page.screenshot({ path: path.join(out, 'empty-960.png') })
    // Existing edit regression exercises the newly translated controls and real writes.
    const result = await execute(process.execPath, [path.join(__dirname, 'desktop-editor-smoke.cjs')], { windowsHide: true, env: { ...process.env, GITVIZ_DESKTOP_TEST_ROOT: out, GITVIZ_CDP_URL: endpoint }, timeout: 150000 })
    await fs.writeFile(path.join(out, 'editor.log'), result.stdout + result.stderr)
  })
  await fs.writeFile(path.join(out, 'result.json'), JSON.stringify({ missingGitActualProcessPATH: true, missingGitRetryReadOnly: true, normalRestartRestoresHistory: true, invalidPathPreserved: true, keyboardPathAndFileSelection: true, previewReadOnly: true, emptyRepository: true, editorRegression: true, normalClose: true }, null, 2))
  console.log('PASS native first use: missing Git, restart, path recovery, preview, empty repository, editor')
})().catch(error => { console.error(error); process.exitCode = 1 })

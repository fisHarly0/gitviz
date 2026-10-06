// Real Tauri/WebView2, fresh profile, external HTTP(S) blocked by CDP routing.
const assert = require('node:assert/strict'), fs = require('node:fs/promises'), path = require('node:path')
const { spawn, execFile } = require('node:child_process'), { promisify } = require('node:util')
const { setTimeout: delay } = require('node:timers/promises')
const { chromium } = require(process.env.PLAYWRIGHT_CORE_PATH || 'playwright-core')
const out = process.env.GITVIZ_DESKTOP_TEST_ROOT, executable = process.env.GITVIZ_DESKTOP_EXECUTABLE
assert.ok(process.platform === 'win32' && out && path.isAbsolute(out) && executable && path.isAbsolute(executable))
process.env.GITVIZ_LARGE_TEST_ROOT = out
const { largeRepo } = require('./helpers/large-repo.cjs')
const execute = promisify(execFile), endpoint = 'http://127.0.0.1:9348'
async function until(check, label) {
  const end = Date.now() + 45000
  while (Date.now() < end) { if (await check()) return; await delay(150) }
  throw Error('Timed out: ' + label)
}
;(async () => {
  await fs.mkdir(out, { recursive: true })
  const fixture = await largeRepo(2), git = fixture.git
  const files = { 'script.js': 'export const value = 1;\n', 'data.json': '{"value":1}\n', 'style.css': 'body { color: red; }\n', 'index.html': '<main>hello</main>\n', 'notes.txt': 'hello world\n' }
  for (const [name, value] of Object.entries(files)) await fs.writeFile(path.join(fixture.root, name), value)
  await git.command(['switch', '-c', 'if-offline-editor'])
  await git.command(['add', '.']); await git.command(['commit', '-m', 'editor language fixtures'])
  const original = await git.head(), profile = await fs.mkdtemp(path.join(out, 'fresh-profile-'))
  const blocked = [], errors = [], workers = new Set(), checks = []
  const edited = 'export const value = 42;\n// edited without external network\n'
  let saved
  async function runApp(phase, action) {
    assert.equal(await fetch(endpoint + '/json/version').then(() => true, () => false), false, 'CDP port must be unused')
    const child = spawn(executable, [], { cwd: out, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: {
      ...process.env, TEMP: out, TMP: out, WEBVIEW2_USER_DATA_FOLDER: profile, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: '--remote-debugging-port=9348',
    } })
    let exited = false, log = '', browser
    child.on('exit', () => { exited = true }); child.on('error', error => { log += error.stack; exited = true })
    child.stdout.on('data', data => { log += data }); child.stderr.on('data', data => { log += data })
    try {
      await until(async () => { assert.equal(exited, false, log); return fetch(endpoint + '/json/version').then(r => r.ok, () => false) }, 'native WebView2')
      browser = await chromium.connectOverCDP(endpoint)
      const context = browser.contexts()[0], page = context.pages()[0]
      page.setDefaultTimeout(20000)
      page.on('pageerror', error => errors.push(error.message))
      page.on('worker', worker => { workers.add(worker.url()); console.log('Worker:', worker.url()) })
      await context.route(/^https?:\/\//, route => {
        const url = new URL(route.request().url())
        if (url.protocol === 'http:' && ['tauri.localhost', 'ipc.localhost'].includes(url.hostname)) return route.continue()
        blocked.push(url.href); return route.abort('internetdisconnected')
      })
      await page.getByLabel('本机仓库路径').fill(fixture.root)
      await page.getByLabel('本机仓库路径').press('Enter')
      await page.locator('.save-node.at-head').waitFor()
      const notices = await page.evaluate(async () => Promise.all(['/licenses/monaco-editor/LICENSE.txt', '/licenses/monaco-editor/ThirdPartyNotices.txt'].map(async url => {
        const response = await fetch(url); return { status: response.status, text: await response.text() }
      })))
      assert.equal(notices[0].status, 200); assert.match(notices[0].text, /Copyright \(c\) 2016 - present Microsoft Corporation/)
      assert.equal(notices[1].status, 200); assert.match(notices[1].text, /THIRD-PARTY SOFTWARE NOTICES/)
      const button = name => page.getByRole('button', { name, exact: true })
      const edit = async name => {
        const row = page.locator('.file-list li').filter({ has: page.locator('.path').filter({ hasText: name }) })
        await row.getByRole('button', { name: '编辑文件', exact: true }).click()
        await page.locator('.monaco-editor').waitFor()
      }
      await action({ page, button, edit })
      await execute('pwsh.exe', ['-NoProfile', '-File', path.join(__dirname, 'helpers/request-desktop-close.ps1'), '-AppProcessId', String(child.pid), '-ExpectedExecutable', executable], { windowsHide: true })
      await until(() => exited, 'normal native close')
      checks.push(phase + ': normal close')
    } finally {
      await browser?.close().catch(() => {})
      if (!exited) child.kill()
      await fs.writeFile(path.join(out, phase + '-native.log'), log)
    }
    await until(() => fetch(endpoint + '/json/version').then(() => false, () => true), 'CDP released')
  }
  await runApp('cold', async ({ page, button, edit }) => {
    for (const [name, worker] of [['data.json', 'json.worker'], ['style.css', 'css.worker'], ['index.html', 'html.worker'], ['script.js', 'ts.worker']]) {
      await edit(name)
      await until(() => [...workers].some(url => url.includes(worker)), worker + ' from packaged assets')
      await button('取消编辑').click()
      await page.locator('.editor-panel').waitFor({ state: 'hidden' })
    }
    await edit('notes.txt')
    await page.locator('.monaco-editor').click(); await page.keyboard.press('Control+End'); await page.keyboard.press('Control+Space')
    await until(() => [...workers].some(url => url.includes('editor.worker')), 'core editor worker')
    await page.keyboard.press('Escape'); await button('取消编辑').click()
    await page.locator('.editor-panel').waitFor({ state: 'hidden' })
    assert.equal(await git.head(), original); assert.equal(await git.status(), '')
    checks.push('fresh profile loads all five packaged workers with external network blocked')
    await edit('script.js')
    await page.locator('.monaco-editor').click(); await page.keyboard.press('Control+Home'); await page.keyboard.press('Control+A'); await page.keyboard.insertText(edited)
    await page.getByLabel('提交说明', { exact: true }).fill('offline edit')
    await button('保存并提交').click(); await page.getByRole('dialog').waitFor(); await button('取消').click()
    assert.equal(await git.head(), original)
    assert.equal(await fs.readFile(path.join(fixture.root, 'script.js'), 'utf8'), files['script.js'])
    assert.match((await page.locator('.monaco-editor .view-lines').innerText()).replaceAll('\u00a0', ' '), /value = 42/)
    await page.setViewportSize({ width: 960, height: 600 })
    await page.screenshot({ path: path.join(out, 'offline-edit-960.png') })
    await button('保存并提交').click(); await button('确认操作').click()
    await page.locator('.editor-panel').waitFor({ state: 'hidden' })
    saved = await git.head()
    assert.notEqual(saved, original)
    assert.equal((await git.command(['rev-parse', 'HEAD^'])).trim(), original)
    assert.equal(await fs.readFile(path.join(fixture.root, 'script.js'), 'utf8'), edited)
    assert.equal(await git.status(), '')
    assert.equal((await git.command(['log', '-1', '--format=%an <%ae>'])).trim(), 'Gitviz Test Fixture <fixture@example.invalid>')
    checks.push('cancel keeps disk unchanged and draft intact; save commits exact content and configured identity')
  })
  await runApp('restart', async ({ page, button, edit }) => {
    await edit('script.js')
    assert.match((await page.locator('.monaco-editor .view-lines').innerText()).replaceAll('\u00a0', ' '), /value = 42/)
    await page.screenshot({ path: path.join(out, 'offline-restarted.png') })
    await button('取消编辑').click(); await page.locator('.editor-panel').waitFor({ state: 'hidden' })
    assert.equal(await git.head(), saved); assert.equal(await git.status(), '')
    checks.push('restart reads saved content while external network remains blocked')
  })
  assert.deepEqual(blocked, [], 'editor must not even attempt external resource requests')
  assert.deepEqual(errors, [])
  // The diff viewer also creates in-memory workers in this local origin.
  assert.ok([...workers].every(url => url.startsWith('http://tauri.localhost/assets/') || url.startsWith('blob:http://tauri.localhost/')), JSON.stringify([...workers]))
  await fs.writeFile(path.join(out, 'result.json'), JSON.stringify({ passed: true, scope: 'Windows native Tauri, external HTTP(S) blocked; no global network changes', root: fixture.root, profile, original, saved, workers: [...workers], blocked, errors, checks }, null, 2))
  console.log(JSON.stringify({ passed: true, checks, workers: [...workers] }))
})().catch(error => { console.error(error); process.exitCode = 1 })

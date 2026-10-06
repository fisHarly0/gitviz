// Real WM_CLOSE, Tauri IPC and Git. All writes and profiles are isolated fixtures.
/* global window, document */
const assert = require('node:assert/strict'), fs = require('node:fs/promises'), path = require('node:path')
const { spawn, execFile } = require('node:child_process'), { promisify } = require('node:util')
const { setTimeout: delay } = require('node:timers/promises')
const out = process.env.GITVIZ_DESKTOP_TEST_ROOT, executable = process.env.GITVIZ_DESKTOP_EXECUTABLE
if (process.platform !== 'win32' || !out || !path.isAbsolute(out) || !executable || !path.isAbsolute(executable)) {
  throw new Error('Windows and absolute GITVIZ_DESKTOP_TEST_ROOT / GITVIZ_DESKTOP_EXECUTABLE are required')
}
const { chromium } = require(process.env.PLAYWRIGHT_CORE_PATH || 'playwright-core')
process.env.GITVIZ_LARGE_TEST_ROOT = out
const { largeRepo } = require('./helpers/large-repo.cjs')
const execute = promisify(execFile), cdp = 'http://127.0.0.1:9248'
const result = {}, errors = []

async function until(check, description, timeout = 30000) {
  const end = Date.now() + timeout
  while (Date.now() < end) { if (await check()) return; await delay(100) }
  throw new Error(`Timed out: ${description}`)
}

async function withApp(name, action) {
  const occupied = await fetch(`${cdp}/json/version`).then(() => true, () => false)
  assert.equal(occupied, false, 'CDP port must be unused; do not attach to an unrelated application')
  const profile = await fs.mkdtemp(path.join(out, `close-${name}-profile-`))
  const child = spawn(executable, [], {
    cwd: out, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, TEMP: out, TMP: out, WEBVIEW2_USER_DATA_FOLDER: profile, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: '--remote-debugging-port=9248' },
  })
  let exited = false, browser, log = ''
  child.on('exit', () => { exited = true })
  child.on('error', error => { log += error.message; exited = true })
  child.stdout.on('data', data => { log += data }); child.stderr.on('data', data => { log += data })
  try {
    await until(async () => {
      if (exited) throw new Error(`Test app exited before startup: ${log}`)
      return fetch(`${cdp}/json/version`).then(response => response.ok, () => false)
    }, 'WebView2 startup')
    browser = await chromium.connectOverCDP(cdp)
    let p
    await until(() => {
      p = browser.contexts().flatMap(context => context.pages()).find(page => /tauri\.localhost/.test(page.url()))
      return Boolean(p)
    }, 'native Tauri page')
    p.on('pageerror', error => errors.push(error.message))
    await p.locator('.repo-loader').waitFor()
    const nativeRequest = extra => execute('powershell.exe', ['-NoProfile', '-File', path.join(__dirname, 'helpers/request-desktop-close.ps1'), '-AppProcessId', String(child.pid), '-ExpectedExecutable', executable, ...extra], { windowsHide: true, env: { ...process.env, TEMP: out, TMP: out } })
    const close = () => nativeRequest([]), cancelFileDialog = () => nativeRequest(['-CancelFileDialog'])
    const waitExit = () => until(() => exited, 'normal app exit')
    try { await action({ p, close, cancelFileDialog, waitExit, alive: () => !exited }) }
    catch (error) {
      if (!exited) await fs.writeFile(path.join(out, `close-${name}-failure.txt`), await p.locator('.app').innerText().catch(() => 'WebView unavailable'))
      throw error
    }
    assert.equal(exited, true, 'Each scenario must finish with a normal close')
  } finally {
    await browser?.close().catch(() => {})
    if (!exited) child.kill() // only the process launched by this scenario
    await fs.writeFile(path.join(out, `close-${name}.log`), log)
    await until(async () => !await fetch(`${cdp}/json/version`).then(() => true, () => false), 'owned CDP shutdown')
  }
}

async function openEditor(p, fixture) {
  // The landing DOM can appear before the asynchronous native drop subscription.
  // Retry only an ignored startup drop, never a repository error or loaded session.
  for (let attempt = 0; attempt < 3; attempt++) {
    await p.evaluate(root => window.__TAURI_INTERNALS__.invoke('plugin:event|emit', { event: 'tauri://drag-drop', payload: { paths: [root], position: { x: 200, y: 200 } } }), fixture.root)
    try {
      await p.waitForFunction(root => document.querySelector('.source-repo-path')?.textContent.replaceAll('\\', '/') === root.replaceAll('\\', '/'), fixture.root, { timeout: 3000 })
      break
    } catch (error) {
      if (attempt === 2 || await p.locator('.drop-error, .source-repo-path').count()) throw error
    }
  }
  await p.locator('.save-node').first().waitFor()
  await p.locator('.map-viewport').press('End')
  await p.getByRole('button', { name: '编辑文件', exact: true }).click()
  await p.getByRole('button', { name: '确认操作', exact: true }).click()
  await p.locator('.monaco-editor').waitFor({ timeout: 45000 })
  assert.equal(await fixture.git.head(), fixture.first)
}

async function edit(p, content, message) {
  await p.locator('.monaco-editor').click()
  await p.keyboard.press('Control+Home'); await p.keyboard.press('Control+A'); await p.keyboard.insertText(content)
  await p.locator('.commit-msg-input').fill(message)
}

;(async () => {
  await fs.mkdir(out, { recursive: true })
  await withApp('clean', async ({ close, waitExit }) => { await close(); await waitExit() })
  result.cleanStartupCloses = true
  console.log('PASS clean startup normal close')

  const untouched = await largeRepo(25)
  await withApp('untouched', async ({ p, close, waitExit }) => {
    await openEditor(p, untouched)
    await close(); await waitExit()
    assert.equal(await untouched.git.head(), untouched.first)
    assert.equal(await untouched.git.status(), '')
  })
  result.untouchedEditorCloses = true
  console.log('PASS untouched editor closes without a discard prompt')

  const draft = await largeRepo(25)
  await withApp('draft', async ({ p, close, waitExit, alive }) => {
    await openEditor(p, draft)
    const dialog = p.getByRole('dialog')
    // A message-only draft is also user work.
    await p.locator('.commit-msg-input').fill('message-only draft')
    await close(); await dialog.waitFor()
    assert.match(await dialog.innerText(), /提交说明/)
    await p.keyboard.press('Escape'); assert.equal(alive(), true)
    assert.equal(await p.locator('.commit-msg-input').inputValue(), 'message-only draft')
    await edit(p, 'unsaved close test\n', 'keep this message')
    await close(); await dialog.waitFor()
    await close()
    assert.equal(await dialog.count(), 1)
    assert.match(await dialog.innerText(), /关闭并放弃/)
    assert.equal(await p.evaluate(() => document.activeElement?.textContent), '取消')
    await p.setViewportSize({ width: 960, height: 600 })
    const bounds = await dialog.boundingBox()
    assert.ok(bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= 960 && bounds.y + bounds.height <= 600)
    await p.keyboard.press('Tab')
    assert.equal(await dialog.evaluate(element => element.contains(document.activeElement)), true)
    await p.screenshot({ path: path.join(out, 'close-draft-confirm-960.png') })
    await dialog.getByRole('button', { name: '取消', exact: true }).click()
    assert.match((await p.locator('.monaco-editor .view-lines').innerText()).replaceAll('\u00a0', ' '), /unsaved close test/)
    assert.equal(await p.locator('.commit-msg-input').inputValue(), 'keep this message')
    assert.equal(await fs.readFile(path.join(draft.root, 'counter.txt'), 'utf8'), 'save 1\n')
    assert.equal(await draft.git.status(), '')
    // Plain editor-discard confirmation has no Git operation running beneath it.
    await p.getByRole('button', { name: '取消编辑', exact: true }).click()
    await dialog.getByRole('heading', { name: '放弃当前编辑？', exact: true }).waitFor()
    await close(); await dialog.getByRole('alert').waitFor()
    assert.equal(await dialog.locator('h2').innerText(), '放弃当前编辑？')
    await dialog.getByRole('button', { name: '取消', exact: true }).click()
    await close(); await dialog.getByRole('button', { name: '放弃编辑并关闭', exact: true }).click(); await waitExit()
    assert.equal(await draft.git.head(), draft.first)
    assert.equal(await draft.git.status(), '')
    result.dialogBounds = bounds
  })
  Object.assign(result, { messageOnlyProtected: true, repeatedCloseCoalesced: true, cancelPreservesBufferAndMessage: true, discardDoesNotWriteGit: true })
  console.log('PASS message-only/content drafts, repeated close, cancel, discard and narrow keyboard dialog')

  const exporting = await largeRepo(25)
  await withApp('export', async ({ p, close, cancelFileDialog, waitExit, alive }) => {
    await openEditor(p, exporting)
    await p.getByRole('button', { name: '取消编辑', exact: true }).click()
    await p.locator('.editor-panel').waitFor({ state: 'hidden' })
    await p.locator('.export-btn').click()
    await p.locator('.export-btn').filter({ hasText: '正在打包…' }).waitFor()
    await close(); await p.locator('.close-notice').waitFor()
    assert.equal(alive(), true)
    assert.equal(await p.getByRole('button', { name: '更换仓库', exact: true }).isDisabled(), true)
    await cancelFileDialog()
    await p.waitForFunction(() => document.querySelector('.export-btn')?.disabled === false)
    assert.equal(await p.locator('.export-error').count(), 0)
    assert.equal(await exporting.git.status(), '')
    await close(); await waitExit()
  })
  result.nativeExportDialogBlocksCloseAndCancelReleasesGate = true
  console.log('PASS real export and native save dialog block close; cancellation releases gate')

  const active = await largeRepo(25), hook = path.join(active.root, '.git/hooks/pre-commit')
  const marker = path.join(active.root, '.git/close-hook-entered'), release = path.join(active.root, '.git/close-hook-release')
  await withApp('active', async ({ p, close, waitExit, alive }) => {
    await openEditor(p, active)
    await edit(p, 'commit survives normal close\n', 'close guard actual commit')
    await p.getByRole('button', { name: '保存并提交', exact: true }).click()
    const dialog = p.getByRole('dialog'); await dialog.waitFor()
    const title = await dialog.locator('h2').innerText()
    await close(); await dialog.getByRole('alert').waitFor()
    assert.equal(await dialog.locator('h2').innerText(), title)
    assert.equal(alive(), true)
    await dialog.getByRole('button', { name: '取消', exact: true }).click()
    assert.equal(await active.git.head(), active.first)
    await fs.writeFile(hook, '#!/bin/sh\ntouch .git/close-hook-entered\nfor i in $(seq 1 600); do\n  if test -f .git/close-hook-release; then exit 0; fi\n  sleep 0.1\ndone\nexit 1\n', { mode: 0o755 })
    await p.getByRole('button', { name: '保存并提交', exact: true }).click()
    await p.getByRole('button', { name: '确认操作', exact: true }).click()
    await until(() => fs.access(marker).then(() => true, () => false), 'real pre-commit hook barrier')
    try {
      await close(); await p.locator('.close-notice').waitFor()
      assert.equal(alive(), true)
      assert.equal(await active.git.head(), active.first)
      assert.equal(await p.getByRole('button', { name: '更换仓库', exact: true }).isDisabled(), true)
      await p.screenshot({ path: path.join(out, 'close-during-commit.png') })
    } finally { await fs.writeFile(release, '') }
    await p.locator('.editor-panel').waitFor({ state: 'hidden', timeout: 30000 })
    assert.notEqual(await active.git.head(), active.first)
    assert.equal(await active.git.status(), '')
    assert.equal(await fs.readFile(path.join(active.root, 'counter.txt'), 'utf8'), 'commit survives normal close\n')
    await close(); await waitExit()
  })
  Object.assign(result, { existingConfirmationPreserved: true, runningHookBlocksClose: true, successfulSaveThenCloses: true })
  console.log('PASS pending Git confirmation and executing Git hook block close; successful save closes')

  const failed = await largeRepo(25)
  await withApp('failed', async ({ p, close, waitExit }) => {
    await openEditor(p, failed)
    await edit(p, 'failed save still recoverable\n', 'keep failed commit message')
    await fs.writeFile(path.join(failed.root, '.git/hooks/pre-commit'), '#!/bin/sh\necho close-test-hook-rejected >&2\nexit 1\n', { mode: 0o755 })
    await p.getByRole('button', { name: '保存并提交', exact: true }).click()
    await p.getByRole('button', { name: '确认操作', exact: true }).click()
    await p.locator('.editor-panel .error').filter({ hasText: 'close-test-hook-rejected' }).waitFor()
    const tree = (await failed.git.command(['write-tree'])).trim()
    await close(); await p.getByRole('dialog').getByRole('button', { name: '取消', exact: true }).click()
    assert.equal(await p.locator('.commit-msg-input').inputValue(), 'keep failed commit message')
    assert.match((await p.locator('.monaco-editor .view-lines').innerText()).replaceAll('\u00a0', ' '), /failed save still recoverable/)
    await close(); await p.getByRole('button', { name: '放弃编辑并关闭', exact: true }).click(); await waitExit()
    assert.equal(await failed.git.head(), failed.first)
    assert.equal((await failed.git.command(['write-tree'])).trim(), tree)
    assert.equal(await fs.readFile(path.join(failed.root, 'counter.txt'), 'utf8'), 'failed save still recoverable\n')
    const folder = path.join(failed.root, '.git/gitviz/operations')
    const records = await Promise.all((await fs.readdir(folder)).filter(name => name.endsWith('.json')).map(async name => JSON.parse(await fs.readFile(path.join(folder, name), 'utf8'))))
    assert.ok(records.some(record => record.action === 'saveEdit' && record.state === 'failed' && record.checkpoint.tree === tree))
  })
  result.failedSavePreservesFilesIndexRecordAndDraft = true
  assert.deepEqual(errors, [])
  await fs.writeFile(path.join(out, 'close-result.json'), JSON.stringify({ ...result, errors }, null, 2))
  console.log('PASS failed save retains draft, staged tree, working file and persistent recovery record after close')
})().catch(error => { console.error(error); process.exitCode = 1 })

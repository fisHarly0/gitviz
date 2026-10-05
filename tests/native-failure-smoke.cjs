// Real installed hosts and Git; only generated repositories receive writes.
/* global document, window */
const fs = require('node:fs/promises'), path = require('node:path'), assert = require('node:assert/strict')
const { setTimeout: delay } = require('node:timers/promises')
const { execFile } = require('node:child_process'), { promisify } = require('node:util')
const { chromium } = require(process.env.PLAYWRIGHT_CORE_PATH || 'playwright-core')
const out = process.env.GITVIZ_DESKTOP_TEST_ROOT, host = process.env.GITVIZ_TEST_HOST
if (!out || !path.isAbsolute(out) || !['desktop', 'vscode', 'dsh'].includes(host)) throw Error('Explicit scratch directory and desktop/vscode/dsh host required')
process.env.GITVIZ_LARGE_TEST_ROOT = out
const { largeRepo } = require('./helpers/large-repo.cjs')
const { GitService } = require('../extensions/vscode/git-service.cjs')

;(async () => {
  let fixture
  if (host === 'vscode') {
    fixture = JSON.parse(await fs.readFile(process.env.GITVIZ_HOST_FIXTURE, 'utf8'))
    const relative = path.relative(out, fixture.root)
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw Error('Fixture must be inside scratch directory')
    fixture.git = await GitService.open(fixture.root)
  } else fixture = await largeRepo(25)
  const { root, git, first } = fixture, original = await git.head()
  const occupied = path.join(out, 'occupied-' + path.basename(root)), name = 'occupied-in-other-worktree'
  await git.command(['worktree', 'add', '-b', name, occupied, first])
  const browser = await chromium.connectOverCDP(process.env.GITVIZ_CDP_URL || `http://127.0.0.1:${host === 'desktop' ? 9248 : 9235}`)
  let ownsLock = false, restorePermissions = false
  const lock = path.join(root, '.git/index.lock'), hook = path.join(root, '.git/hooks/pre-commit')
  const aclBackup = path.join(out, path.basename(root) + '-refs-acl.txt')
  // A Node child otherwise inherits PowerShell 7's module path into Windows PowerShell 5.
  const permissions = mode => promisify(execFile)('powershell.exe', ['-NoProfile', '-File', path.join(__dirname, 'helpers/fixture-ref-permissions.ps1'), '-Mode', mode, '-Fixture', root, '-Scratch', out, '-Backup', aclBackup], { windowsHide: true, env: { ...process.env, PSModulePath: undefined } })
  try {
    const pages = browser.contexts().flatMap(context => context.pages())
    const page = host === 'desktop' ? pages[0] : pages.find(p => p.url().startsWith(host === 'dsh' ? 'http://127.0.0.1:3087/' : 'vscode-file:'))
    assert.ok(page, 'Test host page exists')
    let surface = page
    const button = label => page.getByRole('button', { name: label, exact: true })
    const dialog = page.getByRole('dialog'), errors = []
    page.on('pageerror', error => errors.push(error.message))
    if (host === 'desktop') {
      await page.evaluate(root => window.__TAURI_INTERNALS__.invoke('plugin:event|emit', { event: 'tauri://drag-drop', payload: { paths: [root], position: { x: 200, y: 200 } } }), root)
    } else if (host === 'dsh') {
      if (await button('稍后配置').isVisible()) await button('稍后配置').click()
      await button('Gitviz 版本树').click(); await page.locator('.repo-picker').click()
      await page.getByLabel('本机仓库的绝对路径').fill(root); await button('展开版本树').click()
    } else {
      await page.keyboard.press('F1'); await page.locator('.quick-input-widget input').fill('>Gitviz: 打开交互式版本树'); await page.keyboard.press('Enter')
      surface = await (await page.waitForSelector('iframe.webview', { state: 'attached' })).contentFrame()
    }
    const inspect = (action, label, selector) => surface.evaluate(({ host, action, label, selector }) => {
      const doc = host === 'vscode' ? document.querySelector('#active-frame')?.contentDocument : document
      if (!doc) return ''
      if (action === 'text') return doc.body.innerText
      if (action === 'repo') return (doc.querySelector(host === 'desktop' ? '.source-repo-path' : '.repo-picker')?.[host === 'desktop' ? 'textContent' : 'title'] || '').replaceAll('\\', '/')
      if (action === 'position') return doc.querySelector(host === 'desktop' ? '.desktop-history-position' : '.journey-bar')?.textContent || ''
      if (action === 'alert') return [...doc.querySelectorAll(host === 'desktop' ? '.desktop-actions [role=alert], .if-lines-panel [role=alert]' : '.tree-message[role=alert]')].map(e => e.textContent).join('\n')
      if (action === 'oldest') { doc.querySelector('.map-viewport').dispatchEvent(new doc.defaultView.KeyboardEvent('keydown', { key: 'End', bubbles: true })); return true }
      const element = [...doc.querySelectorAll(selector || 'button')].find(e => (e.textContent.trim() === label || e.getAttribute('aria-label') === label || (selector === '.branch-chip' && e.title.startsWith(`切换到 ${label}（`))) && !e.disabled)
      if (action === 'available') return !!element
      if (!element) throw Error('Unavailable UI control: ' + label)
      element.click(); return true
    }, { host, action, label, selector })
    const wait = async (predicate, label) => {
      const deadline = Date.now() + 45000
      while (Date.now() < deadline) { if (await predicate()) return; await delay(150) }
      throw Error(`Timed out: ${label}\n${(await inspect('text')).slice(-1800)}`)
    }
    const click = async (label, selector) => { await wait(() => inspect('available', label, selector), label); await inspect('click', label, selector) }
    await wait(async () => (await inspect('repo')) === root.replaceAll('\\', '/'), 'fixture loaded')
    await wait(async () => (await inspect('text')).includes('25 / 25'), 'history loaded')
    await inspect('oldest'); await wait(async () => (await inspect('text')).includes('root-marker'), 'oldest selected')

    // Git itself refuses a branch checked out elsewhere; the UI must surface it.
    if (host === 'desktop') await click(name, '.branch-chip')
    else await click('切换到 ' + name)
    await dialog.waitFor(); await button(host === 'desktop' ? '确认操作' : '切换分支').click()
    await wait(async () => /worktree|already checked out/i.test(await inspect('alert')), 'occupied branch error')
    assert.equal(await git.head(), original); assert.equal(await git.branch(), 'main'); assert.equal(await git.status(), '')
    const occupiedRecord = (await git.operations()).records.find(record => record.action === 'switchBranch')
    assert.equal(occupiedRecord.state, 'failed')
    await git.command(['worktree', 'remove', occupied])

    // A genuine index lock appears after preview, before Git executes the restore.
    await click('恢复此存档'); await dialog.waitFor()
    const indexBefore = await fs.readFile(path.join(root, '.git/index'))
    await fs.writeFile(lock, 'owned-native-fixture-lock\n', { flag: 'wx' }); ownsLock = true
    await button(host === 'desktop' ? '备份并恢复' : '备份并恢复为新提交').click()
    await wait(async () => /index\.lock/.test(await inspect('alert')), 'index lock error')
    assert.equal(await git.head(), original)
    assert.equal(await fs.readFile(path.join(root, 'counter.txt'), 'utf8'), 'save 25\n')
    assert.deepEqual(await fs.readFile(path.join(root, '.git/index')), indexBefore)
    const locked = (await git.operations()).records.find(record => record.action === 'restore')
    assert.equal(locked.state, 'failed'); assert.ok(!locked.checkpoint)
    assert.equal((await git.command(['rev-parse', locked.backup])).trim(), original)
    await fs.unlink(lock); ownsLock = false

    // Windows ACLs deny a real ref write, without touching permissions outside the fixture.
    if (process.platform === 'win32') {
      await click('恢复此存档'); await dialog.waitFor()
      restorePermissions = true; await permissions('deny')
      await button(host === 'desktop' ? '备份并恢复' : '备份并恢复为新提交').click()
      await wait(async () => /Permission denied|Access is denied|拒绝访问/i.test(await inspect('alert')), 'ref permission error')
      assert.equal(await git.head(), original)
      assert.equal(await fs.readFile(path.join(root, 'counter.txt'), 'utf8'), 'save 25\n')
      const denied = (await git.operations()).records.find(record => record.action === 'restore')
      assert.equal(denied.state, 'failed'); assert.ok(!denied.checkpoint)
      await permissions('restore'); restorePermissions = false
      assert.equal(await git.status(), '')
    }

    // Hook failure preserves staged contents and exposes a usable recovery path.
    await fs.writeFile(hook, '#!/bin/sh\necho native-fixture-hook-rejected >&2\nexit 1\n', { mode: 0o755 })
    await click('恢复此存档'); await dialog.waitFor()
    await button(host === 'desktop' ? '备份并恢复' : '备份并恢复为新提交').click()
    await wait(async () => (await inspect('alert')).includes('native-fixture-hook-rejected'), 'hook error')
    const failed = (await git.operations()).records.find(record => record.action === 'restore')
    assert.equal(failed.state, 'failed'); assert.ok(failed.checkpoint)
    assert.equal(await git.head(), original)
    assert.equal((await git.command(['write-tree'])).trim(), failed.checkpoint.tree)
    assert.equal(await fs.readFile(path.join(root, 'counter.txt'), 'utf8'), 'save 1\n')
    await click('操作记录与恢复', '.operation-history > summary')
    // The newest restore record is first; the older index-lock failure has no checkpoint.
    await click('恢复存档 · 未完成', '.operation-record summary > span')
    await click('检查并继续提交'); await dialog.waitFor()
    if (host === 'vscode') await page.keyboard.press('Escape')
    else await dialog.getByRole('button', { name: '取消', exact: true }).click()
    await dialog.waitFor({ state: 'hidden' })
    assert.equal((await git.operations()).records.find(record => record.id === failed.id).attempts, 1)
    await fs.unlink(hook)
    await click('检查并继续提交'); await dialog.waitFor()
    await dialog.getByRole('button', { name: '检查并继续提交', exact: true }).click()
    await wait(async () => (await git.operations()).records.find(record => record.id === failed.id)?.state === 'completed', 'recovery completed')
    await wait(async () => (await inspect('text')).includes('恢复存档 · 已完成'), 'completed record visible')
    await wait(async () => !(await inspect('alert')), 'obsolete failure feedback cleared')
    assert.equal((await git.command(['rev-parse', 'HEAD^'])).trim(), original)
    assert.equal((await git.command(['rev-parse', 'HEAD^{tree}'])).trim(), failed.checkpoint.tree)
    assert.equal((await git.command(['rev-parse', failed.backup])).trim(), original)
    assert.equal(await git.status(), '')
    const finalHead = await git.head()
    await wait(async () => (await inspect('position')).includes(finalHead.slice(0, 7)) && !(await inspect('position')).includes('有未提交修改'), 'actual position refreshed')
    assert.deepEqual(errors, [])
    await page.screenshot({ path: path.join(out, `native-failure-${host}.png`) })
    await fs.writeFile(path.join(out, `native-failure-${host}.json`), JSON.stringify({ root, original, head: await git.head(), occupiedBranchRejected: true, lateIndexLockRejected: true, indexAndFilesPreserved: true, realRefPermissionDenial: process.platform === 'win32', failedHookCheckpoint: failed.id, cancelReadOnly: true, recoveredParentTreeBackup: true, errors }, null, 2))
    console.log(`PASS ${host}: real worktree occupancy, index lock, hook failure and recovery`)
  } finally {
    try {
      if (restorePermissions && await fs.stat(aclBackup).catch(() => null)) await permissions('restore')
      if (ownsLock) await fs.unlink(lock)
    } finally { await browser.close().catch(() => {}) }
  }
})().catch(error => { console.error(error); process.exitCode = 1 })

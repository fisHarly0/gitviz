// Old portable and installed Tauri programs; synthetic Git history and shared isolated WebView data.
/* global window, document */
const fs = require('node:fs/promises'), path = require('node:path'), assert = require('node:assert/strict')
const { createHash } = require('node:crypto'), { setTimeout: delay } = require('node:timers/promises')
const { GitService } = require('../extensions/vscode/git-service.cjs')
const out = process.env.GITVIZ_DESKTOP_UPGRADE_ROOT, phase = process.argv[2]
if (!out || !path.isAbsolute(out) || !['setup', 'old', 'upgraded', 'restarted'].includes(phase)) throw Error('Explicit scratch and desktop upgrade phase required')
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const save = (name, data) => fs.writeFile(path.join(out, name + '.json'), JSON.stringify(data, null, 2))
const read = name => fs.readFile(path.join(out, name + '.json'), 'utf8').then(JSON.parse)
;(async () => {
  if (phase === 'setup') {
    process.env.GITVIZ_LARGE_TEST_ROOT = out
    const f = await require('./helpers/large-repo.cjs').largeRepo(2000)
    await save('fixture', { root: f.root, first: f.first, head: await f.git.head(), refs: await f.git.command(['show-ref']), index: sha(await fs.readFile(path.join(f.root, '.git/index'))), content: await fs.readFile(path.join(f.root, 'counter.txt'), 'utf8') })
    return
  }
  const f = await read('fixture'), relative = path.relative(out, f.root)
  assert.ok(relative && !relative.startsWith('..') && !path.isAbsolute(relative))
  const git = new GitService(f.root), hook = path.join(f.root, '.git/hooks/pre-commit')
  const { chromium } = require(process.env.PLAYWRIGHT_CORE_PATH || 'playwright-core')
  const browser = await chromium.connectOverCDP(process.env.GITVIZ_CDP_URL || 'http://127.0.0.1:9348')
  try {
    let page
    const pageDeadline = Date.now() + 30000
    while (!page && Date.now() < pageDeadline) {
      page = browser.contexts().flatMap(context => context.pages()).find(p => /tauri\.localhost/.test(p.url()))
      if (!page) await delay(100)
    }
    assert.ok(page, 'native Tauri WebView is open')
    const errors = []; page.on('pageerror', error => errors.push(error.message))
    const button = name => page.getByRole('button', { name, exact: true }), history = page.locator('.operation-history')
    await page.locator('.repo-loader').waitFor()
    const origin = new URL(page.url()).origin
    if (phase === 'old') {
      await page.evaluate(() => {
        localStorage.setItem('gitviz.graphOrientation', 'horizontal')
        localStorage.setItem('gitviz-portable-migration-fixture', 'preserve-on-install')
      })
    } else {
      assert.equal(origin, (await read('result-old')).origin)
      assert.deepEqual(await page.evaluate(() => [localStorage.getItem('gitviz.graphOrientation'), localStorage.getItem('gitviz-portable-migration-fixture')]), ['horizontal', 'preserve-on-install'])
    }
    await delay(500) // native drag-drop listener registration after the first render
    await page.evaluate(root => window.__TAURI_INTERNALS__.invoke('plugin:event|emit', { event: 'tauri://drag-drop', payload: { paths: [root], position: { x: 200, y: 200 } } }), f.root)
    await page.locator('.save-node').first().waitFor()
    if (phase === 'old') {
      // The original portable build did not show the repository path in its header.
      const snapshot = await page.evaluate(() => window.__TAURI_INTERNALS__.invoke('history_snapshot', { limit: 300 }))
      assert.equal(snapshot.repo.replaceAll('\\', '/'), f.root.replaceAll('\\', '/'))
    } else await page.waitForFunction(root => document.querySelector('.source-repo-path')?.textContent.replaceAll('\\', '/') === root.replaceAll('\\', '/'), f.root)
    if (phase !== 'restarted') {
      await page.waitForFunction(() => document.querySelector('.history-controls')?.textContent.replaceAll(',', '').includes('300 / 2000'))
      assert.equal(await git.head(), f.head); assert.equal(await git.status(), '')
      assert.equal(await git.command(['show-ref']), f.refs)
      assert.equal(sha(await fs.readFile(path.join(f.root, '.git/index'))), f.index)
      assert.equal(await fs.readFile(path.join(f.root, 'counter.txt'), 'utf8'), f.content)
      await button('连续加载全部').click()
      await page.waitForFunction(() => document.querySelector('.history-controls')?.textContent.replaceAll(',', '').includes('2000 / 2000'), null, { timeout: 90000 })
      await page.locator('.map-viewport').press('End')
      await page.locator(`.save-node.selected[data-oid="${f.first}"]`).waitFor()
      assert.equal(await git.head(), f.head); assert.equal(await git.status(), '')
    }
    if (phase === 'upgraded') {
      // Cancelling the installed program's confirmation cannot write even a journal entry.
      await button('恢复此存档').click()
      const dialog = page.getByRole('dialog')
      await dialog.waitFor()
      const preview = (await dialog.innerText()).replaceAll('\\', '/')
      await save('restore-confirmation', { preview, expectedRepo: f.root, expectedTarget: f.first, expectedHead: f.head })
      assert.ok(preview.includes(f.root.replaceAll('\\', '/')), 'confirmation identifies the repository')
      assert.ok(preview.includes(f.first), 'confirmation identifies the full target commit')
      assert.ok(preview.includes(f.head.slice(0, 7)), 'confirmation identifies the current HEAD using the UI abbreviation')
      await dialog.getByRole('button', { name: '取消', exact: true }).click()
      assert.equal((await git.operations()).records.length, 0)
      assert.equal(await git.command(['show-ref']), f.refs)
      assert.equal(sha(await fs.readFile(path.join(f.root, '.git/index'))), f.index)
      await fs.writeFile(hook, '#!/bin/sh\necho installed-upgrade-hook-rejected >&2\nexit 1\n', { mode: 0o755 })
      await button('恢复此存档').click(); await button('备份并恢复').click()
      await page.locator('.desktop-actions [role=alert]').filter({ hasText: 'installed-upgrade-hook-rejected' }).waitFor()
      const failed = (await git.operations()).records[0]
      assert.equal(failed.state, 'failed'); assert.equal(failed.attempts, 1)
      assert.equal(await git.head(), f.head)
      assert.equal(failed.checkpoint.tree, (await git.command(['rev-parse', `${f.first}^{tree}`])).trim())
      assert.equal((await git.command(['rev-parse', failed.backup])).trim(), f.head)
      await save('failed-checkpoint', failed)
    } else if (phase === 'restarted') {
      const failed = await read('failed-checkpoint')
      assert.deepEqual((await git.operations()).records[0], failed)
      await history.locator(':scope > summary').click()
      const record = history.locator('.operation-record').filter({ hasText: '恢复存档 · 未完成' })
      await record.locator('summary').click()
      const before = sha(await fs.readFile(path.join(f.root, '.git/index')))
      await record.getByRole('button', { name: '检查并继续提交', exact: true }).click()
      await page.getByRole('dialog').getByRole('button', { name: '取消', exact: true }).click()
      assert.equal(sha(await fs.readFile(path.join(f.root, '.git/index'))), before)
      assert.equal((await git.operations()).records[0].attempts, 1)
      await fs.unlink(hook)
      await record.getByRole('button', { name: '检查并继续提交', exact: true }).click()
      await page.getByRole('dialog').getByRole('button', { name: '检查并继续提交', exact: true }).click()
      await history.locator('summary').filter({ hasText: '恢复存档 · 已完成' }).waitFor()
      const head = await git.head(), done = (await git.operations()).records[0]
      assert.equal(await git.status(), '')
      assert.equal((await git.command(['rev-parse', 'HEAD^'])).trim(), f.head)
      assert.equal((await git.command(['rev-parse', 'HEAD^{tree}'])).trim(), failed.checkpoint.tree)
      assert.equal((await git.command(['rev-parse', failed.backup])).trim(), f.head)
      assert.match(await git.command(['log', '-1', '--format=%an <%ae>']), /Gitviz Test Fixture <fixture@example.invalid>/)
      assert.equal(done.id, failed.id); assert.equal(done.state, 'completed'); assert.equal(done.attempts, 2)
      await page.waitForFunction(oid => document.querySelector('.desktop-history-position')?.textContent.includes(oid), head.slice(0, 7))
      assert.equal(await page.locator('.desktop-actions [role=alert]').count(), 0)
    }
    assert.deepEqual(errors, [])
    await page.screenshot({ path: path.join(out, `desktop-${phase}.png`) })
    await save(`result-${phase}`, { origin, phase, historicalCommits: 2000, sharedIsolatedWebViewProfile: true, storagePreserved: phase !== 'old', passed: true, head: await git.head(), installedWriteAndRestartRecovery: phase === 'restarted', errors })
    console.log(`PASS desktop ${phase}: native UI, 2000-commit fixture, storage, Git invariants`)
  } finally { await browser.close().catch(() => {}) }
})().catch(error => { console.error(error); process.exitCode = 1 })

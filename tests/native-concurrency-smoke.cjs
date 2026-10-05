// Three real native hosts share one generated repository; UI confirmations only.
/* global document, window */
const fs = require('node:fs/promises'), path = require('node:path'), assert = require('node:assert/strict')
const { createHash } = require('node:crypto'), { setTimeout: delay } = require('node:timers/promises')
const { GitService } = require('../extensions/vscode/git-service.cjs')
const out = process.env.GITVIZ_CONCURRENCY_ROOT, phase = process.argv[2]
if (!out || !path.isAbsolute(out) || !['setup', 'run'].includes(phase)) throw Error('Explicit scratch root and setup|run required')
const save = (name, value) => fs.writeFile(path.join(out, name + '.json'), JSON.stringify(value, null, 2))
const read = name => fs.readFile(path.join(out, name + '.json'), 'utf8').then(JSON.parse)
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const wait = async (check, label, timeout = 45000) => {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) { if (await check()) return; await delay(100) }
  throw Error('Timed out: ' + label)
}
const exists = file => fs.stat(file).then(() => true, error => { if (error.code === 'ENOENT') return false; throw error })
async function command(page, title) {
  await wait(async () => {
    for (const name of ['Continue without Signing In', 'Continue', 'Get Started']) {
      const button = page.getByRole('button', { name, exact: true })
      if (await button.isVisible()) await button.click()
    }
    if (await page.locator('.quick-input-widget input').isVisible()) return true
    await page.keyboard.press('Escape'); await page.keyboard.press('F1')
    return page.locator('.quick-input-widget input').waitFor({ timeout: 1000 }).then(() => true, () => false)
  }, 'command palette')
  await page.locator('.quick-input-widget input').fill('>' + title)
  await page.locator('.quick-input-list .monaco-list-row').filter({ hasText: title }).first().click()
}
async function setup() {
  await fs.mkdir(out)
  process.env.GITVIZ_LARGE_TEST_ROOT = out
  const f = await require('./helpers/large-repo.cjs').largeRepo(25)
  await save('fixture', { root: f.root, first: f.first, original: await f.git.head() })
  const settings = { 'workbench.startupEditor': 'none', 'security.workspace.trust.enabled': false, 'window.dialogStyle': 'custom', 'window.titleBarStyle': 'custom', 'telemetry.telemetryLevel': 'off', 'update.mode': 'none', 'extensions.autoUpdate': false, 'extensions.autoCheckUpdates': false }
  for (const name of ['vscode', 'browser']) {
    await fs.mkdir(path.join(out, name, 'profile/User'), { recursive: true })
    await fs.writeFile(path.join(out, name, 'profile/User/settings.json'), JSON.stringify(settings))
  }
}
async function run() {
  const fixture = await read('fixture'), relative = path.relative(out, fixture.root)
  assert.ok(relative && !relative.startsWith('..') && !path.isAbsolute(relative))
  const git = new GitService(fixture.root), hook = path.join(fixture.root, '.git/hooks/pre-commit')
  assert.equal(await git.head(), fixture.original, 'Use a fresh fixture if an earlier run wrote commits')
  assert.equal((await git.operations()).records.length, 0)
  assert.equal(await git.status(), '')
  const entered = path.join(fixture.root, '.git/lifecycle-entered'), release = path.join(fixture.root, '.git/lifecycle-release'), lock = path.join(fixture.root, '.git/gitviz-operation.lock')
  const { chromium } = require(process.env.PLAYWRIGHT_CORE_PATH || 'playwright-core'), browsers = [], hosts = []
  let activeRound = 'setup'
  try {
    for (const [name, port] of [['desktop', 9348], ['vscode', 9235], ['dsh', 9236]]) {
      const browser = await chromium.connectOverCDP('http://127.0.0.1:' + port); browsers.push(browser)
      let page
      await wait(() => { page = browser.contexts().flatMap(c => c.pages()).find(p => p.url().startsWith(name === 'desktop' ? 'http://tauri.localhost' : 'vscode-file:')); return !!page }, name + ' native window ready')
      const shell = page
      if (name === 'dsh') {
        page = browser.contexts().flatMap(c => c.pages()).find(p => p.url().startsWith('http://127.0.0.1:3087/'))
        if (!page) {
        await command(shell, 'Browser: Open Integrated Browser')
        const address = shell.locator('input[aria-label="Search or enter URL"]')
        await address.waitFor()
        let url
        await wait(async () => { url = (await fs.readFile(path.join(out, 'dsh.log'), 'utf8')).match(/http:\/\/127\.0\.0\.1:3087\/\S*/)?.[0].split(String.fromCharCode(27))[0]; return !!url }, 'DSH ready')
        await address.fill(url); await address.press('Enter')
        await wait(() => { page = browser.contexts().flatMap(c => c.pages()).find(p => p.url().startsWith('http://127.0.0.1:3087/')); return !!page }, 'DSH integrated page')
        }
        const button = label => page.getByRole('button', { name: label, exact: true })
        if (await button('继续').isVisible()) await button('继续').click()
        try { await button('稍后配置').waitFor({ timeout: 5000 }); await button('稍后配置').click() } catch (error) { if (error.name !== 'TimeoutError') throw error }
        await button('Gitviz 版本树').click(); await page.locator('.repo-picker').click()
        await page.getByLabel('本机仓库的绝对路径').fill(fixture.root); await button('展开版本树').click()
        await save('served-client', await require('./helpers/dsh-client-source.cjs')(page, path.join(process.env.GITVIZ_CONCURRENCY_DSH_HOME, 'profiles/web/node_modules/@fisharly/gitviz-dsh')))
      }
      let surface = page
      if (name === 'vscode') {
        await command(page, 'Gitviz: 打开交互式版本树')
        surface = await (await page.waitForSelector('iframe.webview', { state: 'attached' })).contentFrame()
      } else if (name === 'desktop') {
        if (await page.getByRole('dialog').isVisible()) await page.getByRole('dialog').getByRole('button', { name: '取消', exact: true }).click()
        if (!await page.locator('.source-repo-path').count()) await page.locator('.repo-loader').waitFor()
        await delay(500)
        await page.evaluate(root => window.__TAURI_INTERNALS__.invoke('plugin:event|emit', { event: 'tauri://drag-drop', payload: { paths: [root], position: { x: 200, y: 200 } } }), fixture.root)
      }
      const inspect = (action, value) => surface.evaluate(({ name, action, value }) => {
        const doc = name === 'vscode' ? document.querySelector('#active-frame')?.contentDocument : document
        if (!doc) return ''
        if (action === 'text') return doc.body.innerText
        if (action === 'repo') return (doc.querySelector(name === 'desktop' ? '.source-repo-path' : '.repo-picker')?.[name === 'desktop' ? 'textContent' : 'title'] || '').replaceAll('\\', '/')
        if (action === 'position') return doc.querySelector(name === 'desktop' ? '.desktop-history-position' : '.journey-bar')?.textContent || ''
        if (action === 'alert') return [...doc.querySelectorAll(name === 'desktop' ? '.desktop-actions [role=alert]' : '.tree-message[role=alert]')].map(e => e.textContent).join('\n')
        if (action === 'search') { const e = doc.querySelector('.tree-search input'); if (!e) return false; Object.getOwnPropertyDescriptor(doc.defaultView.HTMLInputElement.prototype, 'value').set.call(e, value); e.dispatchEvent(new doc.defaultView.Event('input', { bubbles: true })); return true }
        if (action === 'select') { const e = doc.querySelector(`.save-node[data-oid="${value}"]`); if (!e) return false; e.click(); return true }
        if (action === 'selected') return doc.querySelector('.save-node.selected')?.getAttribute('data-oid')
        if (action === 'history') { const e = doc.querySelector('.operation-history'); if (!e) return false; if (!e.open) e.querySelector('summary').click(); return true }
        if (action === 'recordText') return [...doc.querySelectorAll('.operation-record')].find(e => e.textContent.includes(value))?.textContent || ''
        if (action === 'openRecord') { const e = [...doc.querySelectorAll('.operation-record')].find(e => e.textContent.includes(value)); if (!e) return false; if (!e.open) e.querySelector('summary').click(); return true }
        if (action === 'record') { const e = [...doc.querySelectorAll('.operation-record')].find(e => e.textContent.includes(value)); if (!e || !e.querySelector('summary').textContent.includes('已完成')) return false; if (!e.open) e.querySelector('summary').click(); return true }
        const e = [...doc.querySelectorAll('button')].find(e => !e.disabled && (e.textContent.trim() === value || e.getAttribute('aria-label') === value || e.title === value))
        if (!e) return false
        e.click(); return true
      }, { name, action, value })
      const host = { name, page, shell, inspect, click: label => wait(() => inspect('click', label), name + ' ' + label) }
      hosts.push(host)
      await wait(async () => await inspect('repo') === fixture.root.replaceAll('\\', '/'), name + ' repo')
      await wait(async () => (await inspect('text')).includes('25 / 25'), name + ' history')
    }
    const rounds = []
    for (let round = 0; round < 3; round++) {
      activeRound = round
      const owner = hosts[round], contender = hosts[(round + 1) % 3], stale = hosts[(round + 2) % 3]
      const target = round % 2 ? fixture.original : fixture.first, before = await git.head()
      for (const file of [entered, release]) await fs.unlink(file).catch(error => { if (error.code !== 'ENOENT') throw error })
      for (const host of hosts) {
        await host.click('刷新历史')
        await wait(async () => (await host.inspect('position')).includes(before.slice(0, 7)), host.name + ' fresh HEAD')
        await wait(() => host.inspect('search', target), host.name + ' search target')
        await host.click('定位到 ' + target)
        await wait(async () => await host.inspect('selected') === target, host.name + ' target selected')
        await host.inspect('search', '')
        await host.click('恢复此存档'); await host.page.getByRole('dialog').waitFor()
      }
      const quote = text => "'" + text.replaceAll('\\', '/').replaceAll("'", "'\\''") + "'"
      await fs.writeFile(hook, `#!/bin/sh\nexec ${quote(process.execPath)} ${quote(path.join(__dirname, 'helpers/gated-git-hook.cjs'))}\n`, { mode: 0o755 })
      const confirm = host => host.page.getByRole('dialog').getByRole('button', { name: host.name === 'desktop' ? '备份并恢复' : '备份并恢复为新提交', exact: true }).click()
      await confirm(owner); await wait(() => exists(entered), 'real owner hook entered')
      const pid = await fs.readFile(lock, 'utf8'), records = (await git.operations()).records
      assert.equal(records.length, round + 1)
      const running = records.find(record => record.state === 'running'); assert.ok(running)
      process.kill(Number(pid), 0)
      const unchanged = async () => ({ head: await git.head(), refs: await git.command(['show-ref']), index: sha(await fs.readFile(path.join(fixture.root, '.git/index'))), file: sha(await fs.readFile(path.join(fixture.root, 'counter.txt'))) })
      const busyState = await unchanged()
      await confirm(contender)
      // Desktop checks its history revision before acquiring the cross-host lock.
      // Restore has already created the backup ref, so that earlier guard can reject it.
      await wait(async () => (contender.name === 'desktop' ? /另一个 Gitviz 写操作正在进行|历史已变化，请重新预览操作/ : /另一个 Gitviz 写操作正在进行/).test(await contender.inspect('alert')), contender.name + ' concurrent rejection')
      const concurrentRejection = await contender.inspect('alert')
      assert.equal(await fs.readFile(lock, 'utf8'), pid)
      assert.deepEqual(await unchanged(), busyState)
      assert.deepEqual((await git.operations()).records, records)
      await fs.writeFile(release, '')
      await wait(async () => (await git.operations()).records.find(record => record.id === running.id)?.state === 'completed', owner.name + ' complete')
      await wait(async () => !await exists(lock), 'owner lock released')
      const head = await git.head(), completed = (await git.operations()).records
      assert.equal((await git.command(['rev-parse', 'HEAD^'])).trim(), before)
      assert.equal((await git.command(['rev-parse', 'HEAD^{tree}'])).trim(), (await git.command(['rev-parse', `${target}^{tree}`])).trim())
      assert.equal((await git.command(['rev-parse', running.backup])).trim(), before)
      assert.equal(await git.status(), '')
      const doneState = await unchanged()
      await confirm(stale)
      await wait(async () => /HEAD.*变化|历史已变化|仓库状态已变化|当前位置.*变化/.test(await stale.inspect('alert')), stale.name + ' stale confirmation rejection')
      assert.deepEqual(await unchanged(), doneState)
      assert.deepEqual((await git.operations()).records, completed)
      for (const host of hosts) {
        await host.click('刷新历史')
        await wait(async () => (await host.inspect('position')).includes(head.slice(0, 7)) && !(await host.inspect('position')).includes('有未提交修改'), host.name + ' final position')
        await wait(() => host.inspect('history'), host.name + ' journal')
        await wait(async () => (await host.inspect('text')).includes('恢复存档 · 已完成'), host.name + ' completed record visible')
        await wait(() => host.inspect('record', running.id), host.name + ' same completed journal ID')
        await host.page.screenshot({ path: path.join(out, `round-${round + 1}-${host.name}.png`) })
      }
      rounds.push({ owner: owner.name, rejectedWhileLocked: contender.name, concurrentRejection, rejectedStaleConfirmation: stale.name, before, target, head, operationId: running.id, lockPID: Number(pid), concurrentRejectionPreservedStateAndJournal: true, staleRejectionPreservedStateAndJournal: true, parentTreeBackupClean: true, allHostsRefreshed: true })
      await save('result', { passed: false, fixture: fixture.root, rounds })
      console.log(`PASS native concurrency: ${owner.name} writes, ${contender.name} concurrent request rejected, ${stale.name} stale rejected`)
    }
    // A journal can finish without changing Git's revision. Refresh must still re-read it.
    activeRound = 'same-revision'
    const desktop = hosts[0], dsh = hosts[2], before = await git.head()
    for (const file of [entered, release]) await fs.unlink(file).catch(error => { if (error.code !== 'ENOENT') throw error })
    const quote = text => "'" + text.replaceAll('\\', '/').replaceAll("'", "'\\''") + "'"
    await fs.writeFile(hook, `#!/bin/sh\n${quote(process.execPath)} ${quote(path.join(__dirname, 'helpers/gated-git-hook.cjs'))}\necho concurrent-journal-hook-rejected >&2\nexit 1\n`, { mode: 0o755 })
    await dsh.inspect('search', fixture.original); await dsh.click('定位到 ' + fixture.original); await dsh.inspect('search', '')
    await dsh.click('恢复此存档'); await dsh.page.getByRole('dialog').getByRole('button', { name: '备份并恢复为新提交', exact: true }).click()
    await wait(() => exists(entered), 'same-revision hook entered')
    const running = (await git.operations()).records.find(record => record.state === 'running'); assert.ok(running)
    await desktop.click('刷新历史')
    await wait(async () => (await desktop.inspect('recordText', running.id)).includes('进行中或已中断'), 'desktop shows external running record')
    const revision = (await git.historyState()).revision
    await fs.writeFile(release, '')
    await wait(async () => (await git.operations()).records.find(record => record.id === running.id)?.state === 'failed', 'external hook failure recorded')
    await wait(async () => !await exists(lock), 'failed operation released lock')
    assert.equal(await git.head(), before); assert.equal((await git.historyState()).revision, revision)
    await desktop.click('刷新历史')
    await wait(async () => (await desktop.inspect('recordText', running.id)).includes('恢复存档 · 未完成'), 'desktop refreshes journal despite identical Git revision')
    await fs.unlink(hook)
    await desktop.inspect('openRecord', running.id); await desktop.click('检查并继续提交')
    await desktop.page.getByRole('dialog').getByRole('button', { name: '检查并继续提交', exact: true }).click()
    await wait(async () => (await git.operations()).records.find(record => record.id === running.id)?.state === 'completed', 'desktop resumes DSH failed commit')
    await wait(() => desktop.inspect('record', running.id), 'desktop displays resumed completion')
    assert.equal(await git.status(), '')
    assert.equal((await git.command(['rev-parse', 'HEAD^'])).trim(), before)
    assert.equal((await git.command(['rev-parse', 'HEAD^{tree}'])).trim(), (await git.command(['rev-parse', `${fixture.original}^{tree}`])).trim())
    assert.equal((await git.command(['rev-parse', running.backup])).trim(), before)
    const finalHead = await git.head()
    for (const host of hosts) {
      await host.click('刷新历史')
      await wait(async () => (await host.inspect('position')).includes(finalHead.slice(0, 7)), host.name + ' resumed position')
      await wait(() => host.inspect('record', running.id), host.name + ' resumed journal')
      await host.page.screenshot({ path: path.join(out, `final-${host.name}.png`) })
    }
    await save('result', { passed: true, fixture: fixture.root, rounds, sameGitRevisionJournalRefresh: true, crossHostFailureResumedByDesktop: true, resumedOperationId: running.id, finalHead })
    console.log('PASS unchanged Git revision refresh: DSH failure visible, desktop resumed the same record')
  } catch (error) {
    for (const host of hosts) {
      await fs.writeFile(path.join(out, `failure-${activeRound}-${host.name}.txt`), await host.inspect('text').catch(() => 'unavailable'))
      await host.page.screenshot({ path: path.join(out, `failure-${activeRound}-${host.name}.png`) }).catch(() => {})
    }
    throw error
  } finally {
    try {
      await fs.writeFile(release, '') // allow our real hook to finish even on assertion failure
      await wait(async () => !await exists(lock), 'fixture write finished before host cleanup')
      await fs.unlink(hook).catch(error => { if (error.code !== 'ENOENT') throw error })
    } finally { for (const browser of browsers) await browser.close().catch(() => {}) }
  }
}
;(phase === 'setup' ? setup() : run()).catch(error => { console.error(error); process.exitCode = 1 })

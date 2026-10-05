// Real installed VSIX upgrade in an isolated profile. No simulated extension messages.
/* global document */
const fs = require('node:fs/promises'), path = require('node:path'), assert = require('node:assert/strict')
const { createHash } = require('node:crypto'), { setTimeout: delay } = require('node:timers/promises')
const { GitService } = require('../extensions/vscode/git-service.cjs')
const out = process.env.GITVIZ_UPGRADE_TEST_ROOT, phase = process.argv[2]
if (!out || !path.isAbsolute(out) || !['setup', 'old', 'upgraded', 'restarted'].includes(phase)) throw Error('Explicit scratch and upgrade phase required')
const sha = data => createHash('sha256').update(data).digest('hex')
const save = (name, data) => fs.writeFile(path.join(out, name + '.json'), JSON.stringify(data, null, 2))
const read = name => fs.readFile(path.join(out, name + '.json'), 'utf8').then(JSON.parse)

async function setup() {
  await fs.mkdir(out) // never reuse an existing test profile
  process.env.GITVIZ_LARGE_TEST_ROOT = out
  const f = await require('./helpers/large-repo.cjs').largeRepo(25)
  const git = f.git
  await save('fixture', { root: f.root, first: f.first, head: await git.head(), refs: await git.command(['show-ref']), index: sha(await fs.readFile(path.join(f.root, '.git/index'))), content: await fs.readFile(path.join(f.root, 'counter.txt'), 'utf8') })
  const profile = path.join(out, 'profile/User'), control = path.join(out, 'extensions/fixture.upgrade-control-0.0.1')
  await fs.mkdir(profile, { recursive: true }); await fs.mkdir(control, { recursive: true })
  await fs.writeFile(path.join(profile, 'settings.json'), JSON.stringify({ 'workbench.startupEditor': 'none', 'security.workspace.trust.enabled': false, 'window.dialogStyle': 'custom', 'window.titleBarStyle': 'custom', 'telemetry.telemetryLevel': 'off', 'update.mode': 'none', 'extensions.autoUpdate': false, 'extensions.autoCheckUpdates': false, 'gitviz.historyLimit': 20 }))
  await fs.writeFile(path.join(control, 'package.json'), JSON.stringify({ name: 'upgrade-control', publisher: 'fixture', version: '0.0.1', engines: { vscode: '^1.90.0' }, main: './extension.cjs', contributes: { commands: [{ command: 'gitvizFixture.inspect', title: 'Gitviz Fixture Inspect' }, { command: 'gitvizFixture.quit', title: 'Gitviz Fixture Quit' }] } }))
  await fs.writeFile(path.join(control, 'extension.cjs'), `const vscode = require('vscode'), fs = require('node:fs/promises'), path = require('node:path');
exports.activate = context => { context.subscriptions.push(
  vscode.commands.registerCommand('gitvizFixture.inspect', async () => {
    const extension = vscode.extensions.getExtension('fisHarly0.gitviz');
    await extension.activate();
    await fs.writeFile(path.join(process.env.GITVIZ_UPGRADE_TEST_ROOT, 'runtime-' + process.env.GITVIZ_UPGRADE_PHASE + '.json'), JSON.stringify({ version: extension.packageJSON.version, extensionPath: extension.extensionPath, historyLimit: vscode.workspace.getConfiguration('gitviz').get('historyLimit'), hostVersion: vscode.version }));
  }), vscode.commands.registerCommand('gitvizFixture.quit', () => vscode.commands.executeCommand('workbench.action.quit')));
};\n`)
}

async function run() {
  if (phase === 'setup') return setup()
  const fixture = await read('fixture'), relative = path.relative(out, fixture.root)
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw Error('Fixture must remain in scratch')
  const git = new GitService(fixture.root), hook = path.join(fixture.root, '.git/hooks/pre-commit')
  const { chromium } = require(process.env.PLAYWRIGHT_CORE_PATH || 'playwright-core')
  const browser = await chromium.connectOverCDP(process.env.GITVIZ_CDP_URL || 'http://127.0.0.1:9235')
  const page = browser.contexts().flatMap(context => context.pages()).find(p => p.url().startsWith('vscode-file:'))
  assert.ok(page, 'Native VS Code workbench is open')
  try {
    for (const label of ['Continue without Signing In', 'Continue', 'Get Started']) {
      const button = page.getByRole('button', { name: label, exact: true })
      if (await button.isVisible()) await button.click()
    }
    const wait = async (check, label) => {
      const deadline = Date.now() + 45000
      while (Date.now() < deadline) { if (await check()) return; await delay(100) }
      throw Error('Timed out: ' + label)
    }
    const command = async title => {
      // A fresh profile can show onboarding after CDP has already exposed the page.
      await wait(async () => {
        for (const label of ['Continue without Signing In', 'Continue', 'Get Started']) {
          const button = page.getByRole('button', { name: label, exact: true })
          if (await button.isVisible()) await button.click()
        }
        if (await page.locator('.quick-input-widget input').isVisible()) return true
        await page.keyboard.press('Escape'); await page.keyboard.press('F1')
        return page.locator('.quick-input-widget input').waitFor({ state: 'visible', timeout: 1000 }).then(() => true, () => false)
      }, 'command palette ready')
      await page.locator('.quick-input-widget input').fill('>' + title)
      await page.locator('.quick-input-list .monaco-list-row').filter({ hasText: title }).first().click()
    }
    await fs.unlink(path.join(out, `runtime-${phase}.json`)).catch(error => { if (error.code !== 'ENOENT') throw error })
    await command('Gitviz Fixture Inspect')
    await wait(() => fs.stat(path.join(out, `runtime-${phase}.json`)).then(() => true, () => false), 'active runtime metadata')
    const runtime = await read(`runtime-${phase}`)
    assert.equal(runtime.version, phase === 'old' ? '0.2.0' : '0.3.0')
    assert.equal(runtime.historyLimit, 20, 'upgrade/restart preserves user configuration')
    const installedRelative = path.relative(path.join(out, 'extensions'), runtime.extensionPath)
    assert.ok(installedRelative && !installedRelative.startsWith('..') && !path.isAbsolute(installedRelative))
    const JSZip = require('jszip'), packagePath = process.env[phase === 'old' ? 'GITVIZ_OLD_VSIX' : 'GITVIZ_NEW_VSIX']
    const bytes = await fs.readFile(packagePath), zip = await JSZip.loadAsync(bytes)
    for (const entry of Object.values(zip.files).filter(entry => !entry.dir && entry.name.startsWith('extension/'))) {
      const filename = entry.name.slice('extension/'.length)
      const installed = await fs.readFile(path.join(runtime.extensionPath, filename)), packaged = await entry.async('nodebuffer')
      if (filename === 'package.json') {
        // VS Code reformats the manifest and appends installation metadata.
        const manifest = JSON.parse(installed)
        delete manifest.__metadata
        assert.deepEqual(manifest, JSON.parse(packaged), 'installed manifest preserves all package fields')
      } else assert.equal(sha(installed), sha(packaged), `installed package bytes: ${filename}`)
    }
    await command('Gitviz: 打开交互式版本树')
    const frame = await (await page.waitForSelector('iframe.webview', { state: 'attached' })).contentFrame()
    const text = () => frame.evaluate(() => document.querySelector('#active-frame')?.contentDocument?.body.innerText || '')
    const click = async (label, selector = 'button') => {
      await wait(() => frame.evaluate(({ label, selector }) => {
        const doc = document.querySelector('#active-frame')?.contentDocument
        const element = [...(doc?.querySelectorAll(selector) || [])].find(e => e.textContent.trim() === label || e.getAttribute('aria-label') === label)
        if (!element || element.disabled) return false
        element.click(); return true
      }, { label, selector }), label)
    }
    await wait(async () => (await text()).includes('20 / 25'), 'persisted page size')
    if (phase !== 'restarted') {
      assert.equal(await git.head(), fixture.head); assert.equal(await git.status(), '')
      assert.equal(await git.command(['show-ref']), fixture.refs)
      assert.equal(sha(await fs.readFile(path.join(fixture.root, '.git/index'))), fixture.index)
      assert.equal(await fs.readFile(path.join(fixture.root, 'counter.txt'), 'utf8'), fixture.content)
      await click('连续加载全部'); await wait(async () => (await text()).includes('25 / 25'), 'all history')
      await frame.evaluate(() => {
        const doc = document.querySelector('#active-frame').contentDocument
        doc.querySelector('.map-viewport').dispatchEvent(new doc.defaultView.KeyboardEvent('keydown', { key: 'End', bubbles: true }))
      })
      await wait(async () => (await text()).includes('root-marker'), 'oldest real commit selected')
      assert.equal(await git.head(), fixture.head); assert.equal(await git.status(), '')
    }
    if (phase === 'upgraded') {
      await fs.writeFile(hook, '#!/bin/sh\necho upgrade-hook-rejected >&2\nexit 1\n', { mode: 0o755 })
      await click('恢复此存档')
      await page.getByRole('button', { name: '备份并恢复为新提交', exact: true }).click()
      await wait(async () => (await text()).includes('upgrade-hook-rejected'), 'hook failure shown')
      const record = (await git.operations()).records[0]
      assert.equal(record.state, 'failed'); assert.equal(record.attempts, 1)
      assert.equal(record.checkpoint.tree, (await git.command(['rev-parse', `${fixture.first}^{tree}`])).trim())
      assert.equal(await git.head(), fixture.head)
      await save('failed-checkpoint', record)
    } else if (phase === 'restarted') {
      const failed = await read('failed-checkpoint'), record = (await git.operations()).records[0]
      assert.deepEqual(record, failed, 'normal restart preserves the failed operation record')
      assert.equal(await git.head(), fixture.head)
      await click('操作记录与恢复', '.operation-history > summary')
      await click('恢复存档 · 未完成', '.operation-record summary > span')
      await fs.unlink(hook)
      await click('检查并继续提交')
      await page.getByRole('button', { name: '检查并继续提交', exact: true }).click()
      await wait(async () => (await text()).includes('恢复存档 · 已完成'), 'failed operation completed after restart')
      assert.equal(await git.status(), '')
      assert.equal((await git.command(['rev-parse', 'HEAD^'])).trim(), fixture.head)
      assert.equal((await git.command(['rev-parse', 'HEAD^{tree}'])).trim(), failed.checkpoint.tree)
      assert.equal((await git.command(['rev-parse', failed.backup])).trim(), fixture.head)
      const done = (await git.operations()).records[0]
      assert.equal(done.id, failed.id); assert.equal(done.attempts, 2); assert.equal(done.state, 'completed')
    }
    await page.screenshot({ path: path.join(out, `vscode-${phase}.png`) })
    await save(`result-${phase}`, { ...runtime, packageSHA256: sha(bytes), installedContentVerified: true, configurationPreserved: true, passed: true, head: await git.head(), restartRecovery: phase === 'restarted' })
    const disconnected = new Promise(resolve => browser.once('disconnected', resolve))
    await command('Gitviz Fixture Quit')
    await Promise.race([disconnected, delay(15000).then(() => { throw Error('VS Code did not close normally') })])
    console.log(`PASS VSIX ${phase}: installed ${runtime.version}, native UI, package hashes, settings, real Git`)
  } finally { await browser.close().catch(() => {}) }
}
run().catch(error => { console.error(error); process.exitCode = 1 })

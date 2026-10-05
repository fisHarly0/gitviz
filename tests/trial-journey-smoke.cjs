// Real native hosts, explicit isolated fixture; no simulated Git responses.
const fs = require('node:fs/promises'), path = require('node:path'), assert = require('node:assert/strict')
const { setTimeout: delay } = require('node:timers/promises')
const out = process.env.GITVIZ_TRIAL_ROOT, host = process.env.GITVIZ_TEST_HOST
if (!out || !path.isAbsolute(out) || !['desktop', 'vscode', 'dsh'].includes(host)) throw Error('Explicit scratch and host required')
process.env.GITVIZ_LARGE_TEST_ROOT = out
const { GitService } = require('../extensions/vscode/git-service.cjs')
const wait = async (check, label) => { const end = Date.now() + 45000; while (Date.now() < end) { if (await check()) return; await delay(150) } throw Error('Timed out: ' + label) }
;(async () => {
  if (process.argv[2] === 'init') {
    await fs.mkdir(out)
    const fixture = await require('./helpers/large-repo.cjs').largeRepo(25)
    await fs.writeFile(path.join(out, 'fixture.json'), JSON.stringify({ root: fixture.root, first: fixture.first }))
    return
  }
  const f = JSON.parse(await fs.readFile(path.join(out, 'fixture.json'), 'utf8'))
  const relative = path.relative(out, f.root)
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw Error('Fixture outside scratch')
  const git = await GitService.open(f.root), head = await git.head(), index = await git.command(['write-tree'])
  await fs.writeFile(path.join(f.root, 'counter.txt'), 'original uncommitted progress\n')
  const originalStatus = await git.status(), originalRefs = await git.command(['show-ref'])
  const { chromium } = require(process.env.PLAYWRIGHT_CORE_PATH || 'playwright-core')
  const endpoint = process.env.GITVIZ_CDP_URL || `http://127.0.0.1:${host === 'desktop' ? 9348 : 9235}`
  await wait(() => fetch(endpoint + '/json/version').then(r => r.ok, () => false), 'native debugging endpoint')
  const browser = await chromium.connectOverCDP(endpoint)
  let page
  try {
    await wait(() => { page = browser.contexts().flatMap(c => c.pages()).find(p => p.url().startsWith(host === 'desktop' ? 'http://tauri.localhost' : host === 'vscode' ? 'vscode-file:' : 'http://127.0.0.1:3087/')); return !!page }, 'native page')
    assert.ok(page, 'native host open')
    const command = async title => {
      for (const name of ['Continue without Signing In', 'Continue', 'Get Started']) { const b = page.getByRole('button', { name, exact: true }); if (await b.isVisible()) await b.click() }
      await page.keyboard.press('F1'); await page.locator('.quick-input-widget input').fill('>' + title)
      await page.locator('.quick-input-list .monaco-list-row').filter({ hasText: title }).first().click()
    }
    if (host === 'desktop') { await page.getByLabel('本机仓库路径').fill(f.root); await page.getByLabel('本机仓库路径').press('Enter') }
    else if (host === 'vscode') await command('Gitviz: 打开交互式版本树')
    else {
      const skip = page.getByRole('button', { name: '稍后配置', exact: true })
      try { await skip.waitFor({ timeout: 4000 }); await skip.click() } catch (error) { if (error.name !== 'TimeoutError') throw error }
      await page.getByRole('button', { name: 'Gitviz 版本树', exact: true }).click()
      await page.locator('.repo-picker').click(); await page.getByLabel('本机仓库的绝对路径').fill(f.root)
      await page.getByRole('button', { name: '展开版本树', exact: true }).click()
    }
    const ui = host === 'vscode' ? page.frameLocator('iframe.webview').frameLocator('#active-frame') : page
    const button = name => ui.getByRole('button', { name, exact: true })
    const nativeButton = name => page.getByRole('button', { name, exact: true })
    const repoPath = () => host === 'desktop' ? ui.locator('.source-repo-path').innerText() : ui.locator('.repo-picker').getAttribute('title')
    const atRepo = root => wait(async () => (await repoPath()).replaceAll('\\', '/') === root.replaceAll('\\', '/'), 'repository ' + path.basename(root))
    await ui.locator('.save-node').first().waitFor(); await ui.locator('.map-viewport').press('End')
    await ui.locator(`.save-node.selected[data-oid="${f.first}"]`).waitFor()
    if (host !== 'desktop') {
      await button('与实际位置比较').click()
      await ui.locator('.comparison-baseline').filter({ hasText: head.slice(0, 7) }).waitFor()
      assert.match(await ui.locator('.comparison-baseline').innerText(), /不含未提交修改/)
      await ui.locator('.file-change').first().click()
      if (host === 'dsh') { await page.locator('.gitviz-diff-lines').waitFor(); await nativeButton('关闭差异').click() }
      else { await page.locator('.monaco-diff-editor').waitFor(); await command('Gitviz: 打开交互式版本树') }
      await button('返回实际位置').click()
      await ui.locator(`.save-node.selected[data-oid="${head}"]`).waitFor()
      assert.equal(await ui.locator('.compare-strip').count(), 0)
      await ui.locator('.map-viewport').press('End')
    } else {
      await ui.locator('.diff-baseline').waitFor()
      await button('返回实际位置（main）').click(); await ui.locator(`.save-node.selected[data-oid="${head}"]`).waitFor()
      await ui.locator('.map-viewport').press('End')
    }
    await page.screenshot({ path: path.join(out, 'preview.png') })
    assert.equal(await git.head(), head); assert.equal(await git.status(), originalStatus)
    const name = 'if-trial-journey'
    const begin = async () => {
      await button('从这里试一版').click()
      if (host === 'desktop') {
        await page.getByLabel('新分支名称').fill(name)
        await page.getByPlaceholder('输入绝对路径，或选择文件夹').fill(path.join(out, 'worktrees'))
        await button('预览试验工作区').click()
      } else if (host === 'dsh') { await page.getByLabel('新分支名称').fill(name); await nativeButton('下一步').click() }
      else { await page.locator('.quick-input-widget input').fill(name); await page.keyboard.press('Enter') }
      await page.getByRole('dialog').waitFor()
    }
    await begin(); await nativeButton(host === 'vscode' ? 'Cancel' : '取消').click()
    assert.equal(await git.command(['show-ref']), originalRefs)
    await begin(); await nativeButton('确认创建工作区').click()
    const created = ui.locator(host === 'desktop' ? '.desktop-action-result > code' : '.trial-created > code')
    await created.waitFor(); const worktree = await created.innerText(), trial = await GitService.open(worktree)
    assert.ok(path.relative(out, worktree) && !path.relative(out, worktree).startsWith('..'), 'trial within isolated scratch')
    assert.equal(await trial.head(), f.first); assert.equal(await fs.readFile(path.join(worktree, 'counter.txt'), 'utf8'), 'save 1\n')
    await page.screenshot({ path: path.join(out, 'created.png') })
    await button(host === 'vscode' ? '在新窗口打开试验工作区' : '在地图中打开试验工作区').click()
    if (host === 'vscode') {
      let other
      await wait(() => { other = browser.contexts().flatMap(c => c.pages()).find(p => p !== page && p.url().startsWith('vscode-file:')); return !!other }, 'new VS Code window')
      await wait(async () => (await other.title()).includes(path.basename(worktree)), 'new window is trial directory')
      await page.bringToFront(); await atRepo(f.root)
    } else {
      await atRepo(worktree); await button('返回上个仓库').waitFor()
      await ui.locator(`.save-node.selected[data-oid="${f.first}"]`).waitFor()
      if (host === 'desktop') {
        await button('编辑文件').click(); await page.locator('.editor-panel').waitFor()
        assert.equal(await button('返回上个仓库').isDisabled(), true)
        await button('取消编辑').click(); await page.locator('.editor-panel').waitFor({ state: 'hidden' })
      }
      await fs.writeFile(path.join(worktree, 'counter.txt'), 'retained trial progress\n')
      await page.screenshot({ path: path.join(out, 'trial.png') })
      await button('返回上个仓库').click(); await atRepo(f.root)
      await ui.locator(`.save-node.selected[data-oid="${head}"]`).waitFor()
      assert.equal(await fs.readFile(path.join(worktree, 'counter.txt'), 'utf8'), 'retained trial progress\n')
      assert.equal(await button('返回上个仓库').count(), 0)
    }
    assert.equal(await git.head(), head); assert.equal(await git.command(['write-tree']), index)
    assert.equal(await git.status(), originalStatus); assert.equal(await fs.readFile(path.join(f.root, 'counter.txt'), 'utf8'), 'original uncommitted progress\n')
    assert.equal(await trial.head(), f.first)
    await page.screenshot({ path: path.join(out, 'returned.png') })
    await fs.writeFile(path.join(out, 'result.json'), JSON.stringify({ host, root: f.root, worktree, previewReadOnly: true, cancellationReadOnly: true, trialStartsAtSelection: true, originalFilesAndIndexPreserved: true, returnPreservesTrial: true, actualNativeUI: true }, null, 2))
    console.log('PASS trial journey ' + host)
  } catch (error) { await page?.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {}); throw error }
  finally { await browser.close() }
})().catch(error => { console.error(error); process.exitCode = 1 })

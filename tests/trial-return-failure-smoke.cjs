// DSH native return failure: an unavailable origin must not consume the return route.
/* global document */
const fs = require('node:fs/promises'), path = require('node:path'), assert = require('node:assert/strict')
const out = process.env.GITVIZ_TRIAL_ROOT
if (!out || !path.isAbsolute(out)) throw Error('Explicit isolated scratch required')
const { chromium } = require(process.env.PLAYWRIGHT_CORE_PATH || 'playwright-core')
;(async () => {
  const f = JSON.parse(await fs.readFile(path.join(out, 'result.json'), 'utf8'))
  const relative = path.relative(out, f.root)
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw Error('Fixture outside scratch')
  const metadata = path.join(f.root, '.git'), held = path.join(f.root, '.git-return-test')
  assert.equal((await fs.lstat(metadata)).isDirectory(), true)
  assert.equal(await fs.stat(held).then(() => true, () => false), false)
  const b = await chromium.connectOverCDP('http://127.0.0.1:9235')
  let moved = false
  try {
    const p = b.contexts().flatMap(c => c.pages()).find(p => p.url().startsWith('http://127.0.0.1:3087/'))
    const button = name => p.getByRole('button', { name, exact: true })
    const at = folder => p.waitForFunction(folder => document.querySelector('.repo-picker')?.title.replaceAll('\\', '/') === folder.replaceAll('\\', '/'), folder)
    if (await button('返回上个仓库').isVisible()) await button('返回上个仓库').click()
    await at(f.root)
    await button('从这里试一版').click(); await p.getByLabel('新分支名称').fill('if-return-retry-' + Date.now())
    await button('下一步').click(); await button('确认创建工作区').click()
    const code = p.locator('.trial-created > code'); await code.waitFor(); const trial = await code.innerText()
    await button('在地图中打开试验工作区').click(); await at(trial)
    await fs.rename(metadata, held); moved = true
    await button('返回上个仓库').click(); await p.locator('.tree-message[role=alert]').waitFor()
    await at(trial)
    await p.waitForFunction(() => [...document.querySelectorAll('button')].some(b => b.textContent === '返回上个仓库' && !b.disabled))
    await fs.rename(held, metadata); moved = false
    await button('返回上个仓库').click(); await at(f.root)
    assert.equal(await button('返回上个仓库').count(), 0)
    const { GitService } = require('../extensions/vscode/git-service.cjs')
    const original = await GitService.open(f.root)
    assert.equal(await fs.readFile(path.join(f.root, 'counter.txt'), 'utf8'), 'original uncommitted progress\n')
    assert.equal(await original.branch(), 'main')
    await fs.writeFile(path.join(out, 'return-failure-result.json'), JSON.stringify({ failedReturnKeepsTrialAndRoute: true, correctedOriginCanRetry: true, originalProgressPreserved: true }, null, 2))
    console.log('PASS unavailable original repository and return retry')
  } finally { if (moved) await fs.rename(held, metadata); await b.close() }
})().catch(error => { console.error(error); process.exitCode = 1 })

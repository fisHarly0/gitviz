// Frontend contract test: built VS Code bundle + controlled read-only bridge.
// Attaches to an existing isolated VS Code Integrated Browser, never launches Chromium.
const assert = require('node:assert/strict'), http = require('node:http')
const fs = require('node:fs/promises'), path = require('node:path')
const { setTimeout: delay } = require('node:timers/promises')
const { chromium } = require(process.env.PLAYWRIGHT_CORE_PATH || 'playwright-core')
const out = process.env.GITVIZ_INSPECTION_EVIDENCE
const site = 'http://127.0.0.1:5173/', endpoint = process.env.GITVIZ_CDP_URL || 'http://127.0.0.1:9235'
async function wait(check, label) {
  console.log('Waiting:', label)
  const end = Date.now() + 60000
  while (Date.now() < end) { if (await check()) return; await delay(100) }
  throw Error('Timed out: ' + label)
}
;(async () => {
  assert.ok(out && path.isAbsolute(out), 'absolute scratch directory required')
  await fs.mkdir(out, { recursive: true })
  const ids = ['a', 'b', 'c'].map(char => char.repeat(40))
  const commits = ids.map((oid, i) => ({ oid, parents: ids[i + 1] ? [ids[i + 1]] : [], message: `测试存档 ${i + 1}`, author: 'Fixture Author', timestamp: 1791000000 - i * 1000 }))
  let repo = 1, detailFailure = true, compareFailure = true, emptyComparison = false, holdNext = ''
  const pending = [], requests = [], failures = [], checks = []
  const snapshot = () => ({ repo: `F:/fixture/仓库${repo}`, name: `仓库${repo}`, commits, head: ids[0], branch: 'main', branches: [{ name: 'main', oid: ids[0] }], tags: [], dirty: false, writable: true, revision: `revision-${repo}`, total: 3 })
  const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>Gitviz inspection fixture</title><link rel="stylesheet" href="/tree.css"></head><body><div id="root"></div><script>
  window.acquireVsCodeApi = () => ({ postMessage: async message => {
    const response = await fetch('/rpc', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(message) });
    window.dispatchEvent(new MessageEvent('message', { data: await response.json() }));
  } });</script><script src="/tree.js"></script></body></html>`
  const server = http.createServer(async (req, res) => {
    try {
      if (req.url === '/' && req.method === 'GET') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); return res.end(html) }
      if (['/tree.js', '/tree.css'].includes(req.url) && req.method === 'GET') {
        res.setHeader('Content-Type', req.url.endsWith('.js') ? 'text/javascript' : 'text/css')
        return res.end(await fs.readFile(path.join(__dirname, '../extensions/vscode/media', req.url.slice(1))))
      }
      if (req.url !== '/rpc' || req.method !== 'POST') { res.writeHead(404); return res.end() }
      let body = ''; for await (const chunk of req) body += chunk
      const { id, method, params } = JSON.parse(body)
      requests.push({ method, params, repo })
      let result, error
      if (method === 'snapshot') result = snapshot()
      else if (method === 'chooseRepo') { repo++; result = snapshot() }
      else if (method === 'detail') {
        if (detailFailure) error = '暂时无法读取提交对象：F:/很长的仓库路径/需要检查访问权限的目录/存档对象。请检查 Git 状态后重试。'
        else result = { ...commits.find(commit => commit.oid === params.oid), from: ids[2], to: params.oid, files: [{ path: `仓库${repo}/${params.oid[0]}.txt`, status: 'M' }] }
      } else if (method === 'compare') {
        if (compareFailure) error = '读取比较内容失败，请检查 Git 状态。'
        else result = { ...params, files: emptyComparison ? [] : [{ path: `${params.from[0]}-to-${params.to[0]}.txt`, status: 'M' }] }
      } else { failures.push(method); error = 'Unexpected method: ' + method }
      const send = () => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ id, result, error })) }
      if (holdNext === method) { holdNext = ''; pending.push(send) } else send()
    } catch (error) { failures.push(error.stack); res.writeHead(500); res.end() }
  })
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(5173, '127.0.0.1', resolve) })
  let browser
  try {
    await wait(() => fetch(endpoint + '/json/version').then(r => r.ok, () => false), 'VS Code CDP')
    browser = await chromium.connectOverCDP(endpoint)
    const pages = () => browser.contexts().flatMap(context => context.pages())
    let page = pages().find(page => page.url().startsWith(site))
    if (!page) {
      let code
      await wait(() => { code = pages().find(page => page.url().startsWith('vscode-file:')); return !!code }, 'workbench')
      await code.locator('.monaco-workbench').waitFor({ timeout: 60000 })
      for (const name of ['Continue without Signing In', 'Continue', 'Get Started']) {
        const b = code.getByRole('button', { name, exact: true }); if (await b.isVisible()) await b.click()
      }
      await code.keyboard.press('F1')
      await code.locator('.quick-input-widget input').fill('>Browser: Open Integrated Browser')
      await code.locator('.quick-input-list .monaco-list-row').filter({ hasText: 'Browser: Open Integrated Browser' }).first().click()
      const address = code.locator('input[aria-label="Search or enter URL"]')
      await address.fill(site); await address.press('Enter')
      await wait(() => { page = pages().find(page => page.url().startsWith(site)); return !!page }, 'Integrated Browser')
    }
    page.setDefaultTimeout(15000)
    page.on('pageerror', error => failures.push(error.message))
    await page.reload(); await page.setViewportSize({ width: 1280, height: 800 })
    const button = name => page.getByRole('button', { name, exact: true })
    const region = page.getByRole('region', { name: '文件变化', exact: true })
    await button('重试读取详情').waitFor()
    assert.equal(await region.getAttribute('aria-busy'), 'false')
    assert.equal(await region.getByRole('status').count(), 0, 'failure is not loading')
    detailFailure = false; holdNext = 'detail'
    await button('重试读取详情').focus()
    await button('重试读取详情').press('Enter')
    await wait(() => pending.length === 1, 'held detail retry')
    assert.equal(await region.getAttribute('aria-busy'), 'true')
    assert.equal(await region.evaluate(el => el === globalThis.document.activeElement), true)
    assert.equal(await region.locator('.file-change').count(), 0)
    await page.setViewportSize({ width: 1180, height: 820 }); await delay(200)
    assert.equal(await region.evaluate(el => el === globalThis.document.activeElement), true, 'passive resize must not steal retry focus')
    pending.shift()()
    await region.locator('.file-name').filter({ hasText: '仓库1/a.txt' }).waitFor()
    await page.keyboard.press('Tab')
    assert.equal(await region.locator('.file-change').evaluate(el => el === globalThis.document.activeElement), true)
    await button('放大').press('Enter'); await delay(200)
    assert.equal(await button('放大').evaluate(el => el === globalThis.document.activeElement), true, 'zoom control keeps keyboard focus')
    checks.push('detail failure, keyboard retry, pending state, stable focus, success')
    checks.push('resize and zoom keep focus outside the map nodes')

    detailFailure = true; holdNext = 'detail'
    await page.locator('.map-viewport').press('End')
    await wait(() => pending.length === 1, 'old selected node')
    detailFailure = false
    await page.locator('.map-viewport').press('Home')
    await region.locator('.file-name').filter({ hasText: '仓库1/a.txt' }).waitFor()
    await wait(() => page.locator(`.save-node[data-oid="${ids[0]}"]`).evaluate(el => el === globalThis.document.activeElement), 'keyboard navigation still focuses selected node')
    pending.shift()(); await delay(200)
    assert.equal(await region.getByRole('alert').count(), 0)
    assert.equal(await region.locator('.file-name').filter({ hasText: '仓库1/a.txt' }).count(), 1)
    checks.push('late failed detail cannot replace current node')

    await page.locator('.map-viewport').press('End')
    await button('与实际位置比较').click()
    await button('重新比较').waitFor()
    compareFailure = false; holdNext = 'compare'
    await button('重新比较').press('Enter')
    await wait(() => pending.length === 1, 'held compare retry')
    assert.equal(await region.getAttribute('aria-busy'), 'true')
    assert.equal(await region.evaluate(el => el === globalThis.document.activeElement), true)
    pending.shift()()
    await region.locator('.file-name').filter({ hasText: 'a-to-c.txt' }).waitFor()
    holdNext = 'compare'; await button('交换 A / B').click()
    await wait(() => pending.length === 1, 'old comparison direction')
    await button('交换 A / B').click()
    await region.locator('.file-name').filter({ hasText: 'a-to-c.txt' }).waitFor()
    pending.shift()(); await delay(200)
    assert.equal(await region.locator('.file-name').filter({ hasText: 'c-to-a.txt' }).count(), 0)
    checks.push('comparison error retry and stale direction discarded')

    await button('返回实际位置').click()
    await region.locator('.file-name').filter({ hasText: '仓库1/a.txt' }).waitFor()
    holdNext = 'detail'; await button('仓库1').click()
    await wait(() => pending.length === 1, 'same oid in another repo')
    assert.equal(await region.locator('.file-change').count(), 0)
    assert.equal(await region.getAttribute('aria-busy'), 'true')
    pending.shift()()
    await region.locator('.file-name').filter({ hasText: '仓库2/a.txt' }).waitFor()
    checks.push('same oid repository switch does not expose previous detail')

    await button('比较两个存档').click()
    assert.equal(await region.getAttribute('aria-busy'), 'false')
    assert.match(await region.getByRole('status').innerText(), /选好两个节点/)
    emptyComparison = true; await page.locator('.map-viewport').press('End')
    await region.getByText('文件内容相同', { exact: true }).waitFor()
    assert.equal(await page.locator('.diff-tip').count(), 0)
    assert.equal(await region.getByRole('alert').count(), 0)
    await button('返回实际位置').click()
    checks.push('waiting for second node and empty comparison are not failures or loading')

    detailFailure = true; await button('刷新历史').click(); await button('重试读取详情').waitFor()
    for (const width of [1280, 392]) {
      await page.setViewportSize({ width, height: 820 }); await delay(200)
      await region.scrollIntoViewIfNeeded()
      assert.ok(await page.evaluate(() => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth))
      const box = await button('重试读取详情').boundingBox()
      assert.ok(box.height >= 36 && box.x >= 0 && box.x + box.width <= width)
      await page.screenshot({ path: path.join(out, `error-${width}.png`) })
    }
    detailFailure = false; await button('重试读取详情').click()
    await region.locator('.file-name').filter({ hasText: '仓库2/a.txt' }).waitFor()
    assert.deepEqual(failures, [])
    assert.ok(requests.every(item => ['snapshot', 'detail', 'compare', 'chooseRepo'].includes(item.method)))
    await fs.writeFile(path.join(out, 'result.json'), JSON.stringify({ passed: true, host: 'VS Code Integrated Browser', scope: 'built frontend with controlled bridge; no Git backend', checks, requests }, null, 2))
    console.log(JSON.stringify({ passed: true, checks, requests: requests.length }))
  } finally {
    for (const send of pending) send()
    await browser?.close()
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve))
  }
})().catch(error => { console.error(error); process.exitCode = 1 })

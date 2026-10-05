// Attach only to the isolated VS Code Integrated Browser; never launch a browser.
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const { chromium } = require(process.env.PLAYWRIGHT_CORE_PATH || 'playwright-core')
const out = process.env.GITVIZ_GITHUB_EVIDENCE
const endpoint = process.env.GITVIZ_CDP_URL || 'http://127.0.0.1:9235'
const site = 'http://127.0.0.1:5173/'
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
async function wait(check, label) {
  const end = Date.now() + 120000
  while (Date.now() < end) { if (await check()) return; await delay(250) }
  throw Error('Timed out: ' + label)
}
;(async () => {
  assert.ok(out && path.isAbsolute(out), 'absolute evidence directory required')
  await fs.mkdir(out, { recursive: true })
  await wait(() => fetch(site).then(r => r.ok, () => false), 'built preview')
  await wait(() => fetch(endpoint + '/json/version').then(r => r.ok, () => false), 'VS Code debugging endpoint')
  const browser = await chromium.connectOverCDP(endpoint)
  const results = { mode: process.argv[2] || 'fixture', host: 'VS Code Integrated Browser', checks: [] }
  let page, handler
  try {
    const pages = () => browser.contexts().flatMap(context => context.pages())
    page = pages().find(page => page.url().startsWith(site))
    if (!page) {
      let code
      await wait(() => { code = pages().find(page => page.url().startsWith('vscode-file:')); return !!code }, 'VS Code workbench page')
      await code.locator('.monaco-workbench').waitFor({ timeout: 120000 })
      for (const name of ['Continue without Signing In', 'Continue', 'Get Started']) {
        const button = code.getByRole('button', { name, exact: true })
        if (await button.isVisible()) await button.click()
      }
      await code.keyboard.press('F1')
      await code.locator('.quick-input-widget input').fill('>Browser: Open Integrated Browser')
      await code.locator('.quick-input-list .monaco-list-row').filter({ hasText: 'Browser: Open Integrated Browser' }).first().click()
      const address = code.locator('input[aria-label="Search or enter URL"]')
      await address.fill(site); await address.press('Enter')
      await wait(() => { page = pages().find(page => page.url().startsWith(site)); return !!page }, 'integrated page')
    }
    page.setDefaultTimeout(20000)
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    const button = name => page.getByRole('button', { name, exact: true })
    await page.reload()
    await page.getByLabel('访问令牌', { exact: false }).fill('')
    if (results.mode === 'live') {
      await page.getByLabel('GitHub 仓库（所有者/仓库名或网址）').fill('fisHarly0/gitviz')
      await button('只读打开 GitHub 仓库').click()
      await page.locator('.save-node[data-oid]').first().waitFor()
      await page.locator('.commit-detail .oid:not(.skel-line)').waitFor()
      results.checks.push('real unauthenticated public repository and commit detail')
      results.remoteOid = await page.locator('.commit-detail .oid:not(.skel-line)').innerText()
      assert.match(results.remoteOid, /^[0-9a-f]{40}$/)
      await page.locator('.map-viewport').press('End')
      await page.locator('.preview-banner').waitFor()
      await button('返回远程分支顶端（main）').click()
      await page.locator('.save-node.selected').waitFor()
      assert.equal(await page.locator('.preview-banner').count(), 0)
      await wait(async () => await page.locator('.commit-detail .oid:not(.skel-line)').textContent().catch(() => '') === results.remoteOid, 'returned remote detail')
      results.checks.push('keyboard history navigation and readonly return')
    } else {
      const ids = { merge: 'a'.repeat(40), left: 'b'.repeat(40), right: 'c'.repeat(40), root: 'd'.repeat(40) }
      const apiCommit = (id, parents, message) => ({ sha: ids[id], parents: parents.map(parent => ({ sha: ids[parent] })), commit: { message, author: { name: '测试作者', date: '2026-10-01T00:00:00Z' } } })
      const commits = [apiCommit('merge', ['left', 'right'], '合并两条路线'), apiCommit('left', ['root'], '左侧改动'), apiCommit('right', ['root'], '右侧改动'), apiCommit('root', [], '初始存档')]
      let formFailure = 401, partial = true, detailFailure = true, refreshFailure = false
      const requests = []
      handler = async route => {
        const request = route.request(), url = new URL(request.url())
        assert.equal(request.method(), 'GET')
        requests.push(url.pathname + url.search)
        const reply = (status, data, headers = {}) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', 'access-control-expose-headers': 'Link', ...headers }, body: JSON.stringify(data) })
        if (url.pathname.endsWith('/branches')) {
          if (formFailure === 'network') return route.abort('internetdisconnected')
          if (formFailure || refreshFailure) return reply(formFailure || 503, { message: 'controlled failure' })
          return reply(200, [{ name: 'main', commit: { sha: ids.merge } }, { name: 'topic', commit: { sha: ids.right } }])
        }
        if (url.pathname.endsWith('/tags')) return partial ? reply(500, { message: 'controlled tag failure' }) : reply(200, [])
        if (url.pathname.endsWith('/commits')) return partial && url.searchParams.get('sha') === ids.right ? reply(404, { message: 'controlled branch failure' }) : reply(200, commits)
        if (url.pathname.includes('/commits/')) {
          if (detailFailure) return reply(503, { message: 'controlled detail failure' })
          const commit = commits.find(commit => url.pathname.endsWith(commit.sha))
          return reply(200, { ...commit, files: [{ filename: '图片.png', status: 'modified' }] }, { link: '<https://api.github.com/next>; rel="next"' })
        }
        throw Error('Unexpected request ' + url.pathname)
      }
      await page.route('https://api.github.com/**', handler)
      await page.getByLabel('GitHub 仓库（所有者/仓库名或网址）').fill('fixture/readonly')
      for (const status of [401, 403, 404, 429, 'network']) {
        formFailure = status
        await button('只读打开 GitHub 仓库').click()
        await page.locator('.repo-loader [role="alert"]').waitFor()
        await button('只读打开 GitHub 仓库').waitFor()
        assert.equal(await page.getByLabel('GitHub 仓库（所有者/仓库名或网址）').inputValue(), 'fixture/readonly')
        results.checks.push('controlled open failure and retained input: ' + status)
      }
      formFailure = false
      await button('只读打开 GitHub 仓库').click()
      await page.locator('.github-warnings').waitFor()
      await page.locator('.save-node[data-oid]').first().waitFor()
      assert.match(await page.locator('.github-warnings').innerText(), /标签未读取/)
      assert.match(await page.locator('.github-warnings').innerText(), /topic 未读取/)
      await button('重新读取详情').waitFor()
      detailFailure = false
      await button('重新读取详情').click()
      await page.getByText('GitHub 未提供这个文件的文本差异', { exact: false }).waitFor()
      assert.match(await page.locator('.commit-detail').innerText(), /列表不完整/)
      assert.equal(await page.getByRole('link', { name: '在 GitHub 查看原提交' }).getAttribute('href'), `https://github.com/fixture/readonly/commit/${ids.merge}`)
      results.checks.push('partial branches/tags visible; detail retry; missing patch and file pagination explicit')
      partial = false
      await button('重新读取历史').click()
      await wait(async () => await button('重新读取历史').isEnabled() && await page.locator('.github-warnings').count() === 0, 'history recovery')
      assert.equal(await page.locator('.map-lines path[data-merge="true"]').count(), 1)
      await page.locator('.map-viewport').press('End')
      await page.locator(`.save-node.selected[data-oid="${ids.root}"]`).waitFor()
      await page.locator('.map-viewport').press('Home')
      await page.locator(`.save-node.selected[data-oid="${ids.merge}"]`).waitFor()
      const before = requests.filter(url => /\/commits\?/.test(url)).length
      await page.getByRole('button', { name: /topic ccccccc/ }).click()
      await page.locator(`.save-node.selected[data-oid="${ids.right}"]`).waitFor()
      assert.equal(requests.filter(url => /\/commits\?/.test(url)).length, before)
      assert.match(await page.locator('.mode-status-bar').innerText(), /远程浏览基准.*topic/)
      await page.getByLabel('搜索已读取的 GitHub 历史').fill('左侧改动')
      assert.match(await page.locator('.map-heading').innerText(), /1 个匹配/)
      await page.getByLabel('搜索已读取的 GitHub 历史').fill('')
      await button('分支与标签').click()
      await page.getByLabel('查找分支或标签').press('Escape')
      assert.equal(await button('分支与标签').evaluate(element => element === globalThis.document.activeElement), true)
      results.checks.push('merge edge, keyboard Home/End, search, reference Escape focus, branch selection without refetch')
      refreshFailure = true
      await button('重新读取历史').click()
      await page.locator('.github-history [role="alert"]').waitFor()
      assert.ok(await page.locator('.save-node[data-oid]').count() > 0)
      assert.match(await page.locator('.github-history [role="alert"]').innerText(), /上次成功读取/)
      refreshFailure = false
      await button('重新读取历史').click()
      await wait(async () => await button('重新读取历史').isEnabled() && await page.locator('.github-history [role="alert"]').count() === 0, 'refresh recovery')
      results.checks.push('failed refresh retains identified previous map and retry recovers')
      results.requests = requests.length
    }
    for (const [width, height] of [[1280, 800], [392, 820]]) {
      await page.setViewportSize({ width, height })
      await delay(300)
      const sizes = await page.evaluate(() => ({ width: globalThis.innerWidth, scroll: globalThis.document.documentElement.scrollWidth, canvas: globalThis.document.querySelector('.map-viewport').getBoundingClientRect().height }))
      assert.ok(sizes.scroll <= sizes.width, 'no document horizontal overflow')
      assert.ok(sizes.canvas >= 100, 'usable map height')
      await page.screenshot({ path: path.join(out, `${results.mode}-${width}.png`) })
      if (width === 392) {
        await page.locator('.commit-detail').scrollIntoViewIfNeeded()
        await page.screenshot({ path: path.join(out, `${results.mode}-${width}-detail.png`) })
      }
      results.checks.push({ viewport: sizes })
    }
    assert.deepEqual(errors, [])
    results.passed = true
    await fs.writeFile(path.join(out, results.mode + '-result.json'), JSON.stringify(results, null, 2))
    console.log(JSON.stringify(results, null, 2))
  } finally {
    if (handler) await page.unroute('https://api.github.com/**', handler)
    await browser.close()
  }
})().catch(error => { console.error(error); process.exitCode = 1 })

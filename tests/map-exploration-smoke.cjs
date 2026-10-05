// Read-only interaction checks against installed native hosts and real 10000-commit history.
/* global document, window */
const fs = require('node:fs/promises'), path = require('node:path'), assert = require('node:assert/strict')
const { setTimeout: delay } = require('node:timers/promises')
const { chromium } = require(process.env.PLAYWRIGHT_CORE_PATH || 'playwright-core')
const { GitService } = require('../extensions/vscode/git-service.cjs')
const out = process.env.GITVIZ_DESKTOP_TEST_ROOT, host = process.env.GITVIZ_TEST_HOST
if (!out || !path.isAbsolute(out) || !['desktop', 'vscode', 'dsh'].includes(host)) throw Error('Explicit scratch directory and native host required')
;(async () => {
  const f = JSON.parse(await fs.readFile(path.join(out, 'fixture.json'), 'utf8'))
  const relative = path.relative(out, f.root)
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw Error('Fixture must be inside scratch')
  const git = await GitService.open(f.root), before = { head: await git.head(), status: await git.status(), refs: await git.command(['show-ref']) }
  const browser = await chromium.connectOverCDP(process.env.GITVIZ_CDP_URL || `http://127.0.0.1:${host === 'desktop' ? 9248 : 9235}`)
  try {
    const pages = browser.contexts().flatMap(context => context.pages())
    const page = host === 'desktop' ? pages[0] : pages.find(p => p.url().startsWith(host === 'dsh' ? 'http://127.0.0.1:3087/' : 'vscode-file:'))
    assert.ok(page, 'Native test host is open')
    const errors = []; page.on('pageerror', error => errors.push(error.message))
    const button = name => page.getByRole('button', { name, exact: true })
    let surface = page
    if (host === 'desktop') await page.evaluate(root => window.__TAURI_INTERNALS__.invoke('plugin:event|emit', { event: 'tauri://drag-drop', payload: { paths: [root], position: { x: 200, y: 200 } } }), f.root)
    else if (host === 'dsh') {
      if (await button('稍后配置').isVisible()) await button('稍后配置').click()
      await button('Gitviz 版本树').click(); await page.locator('.repo-picker').click()
      await page.getByLabel('本机仓库的绝对路径').fill(f.root); await button('展开版本树').click()
    } else {
      await page.keyboard.press('Escape'); await page.keyboard.press('F1')
      await page.locator('.quick-input-widget input').fill('>Gitviz: 打开交互式版本树')
      await page.locator('.quick-input-list .monaco-list-row').filter({ hasText: 'Gitviz: 打开交互式版本树' }).first().click()
      surface = await (await page.waitForSelector('iframe.webview', { state: 'attached' })).contentFrame()
    }
    const ui = (action, selector, value) => surface.evaluate(({ action, selector, value, host }) => {
      const doc = host === 'vscode' ? document.querySelector('#active-frame')?.contentDocument : document
      if (!doc) return action === 'text' ? '' : null
      const element = selector ? doc.querySelector(selector) : null
      if (action === 'text') return element?.textContent || ''
      if (action === 'count') return doc.querySelectorAll(selector).length
      if (action === 'selected') return doc.querySelector('.save-node.selected')?.dataset.oid
      if (action === 'focus') return doc.activeElement?.dataset.oid
      if (action === 'activeText') return doc.activeElement?.textContent
      if (action === 'escape') { element.dispatchEvent(new doc.defaultView.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); return }
      if (action === 'hoverFold') { const fold = doc.querySelector('.folded-node'); if (!fold) return null; const rect = fold.getBoundingClientRect(); return { x: rect.x + 60, y: rect.y + 25 } }
      if (action === 'key') { const canvas = doc.querySelector('.map-viewport'); (canvas.contains(doc.activeElement) ? doc.activeElement : canvas).dispatchEvent(new doc.defaultView.KeyboardEvent('keydown', { key: value, bubbles: true })); return }
      if (action === 'input') {
        Object.getOwnPropertyDescriptor(doc.defaultView.HTMLInputElement.prototype, 'value').set.call(element, value)
        element.dispatchEvent(new doc.defaultView.Event('input', { bubbles: true })); return
      }
      if (action === 'select') { element.value = value; element.dispatchEvent(new doc.defaultView.Event('change', { bubbles: true })); return }
      if (action === 'click') { if (!element || element.disabled) throw Error('Unavailable control: ' + selector); element.click(); return }
      if (action === 'button') {
        const b = [...doc.querySelectorAll('button')].find(e => e.textContent.trim() === value || e.getAttribute('aria-label') === value)
        if (!b || b.disabled) return false
        b.click(); return true
      }
      if (action === 'metrics') {
        const map = doc.querySelector('.map-viewport'), controls = doc.querySelector('.map-navigation')
        return { width: doc.documentElement.clientWidth, overflow: doc.documentElement.scrollWidth > doc.documentElement.clientWidth + 1, mapHeight: map.clientHeight, controlHeight: controls.clientHeight, nodes: doc.querySelectorAll('.save-node').length, foldedBorder: doc.querySelector('.folded-node') ? doc.defaultView.getComputedStyle(doc.querySelector('.folded-node')).borderTopStyle : null }
      }
    }, { action, selector, value, host })
    const wait = async (check, label, timeout = 45000) => {
      const deadline = Date.now() + timeout
      while (Date.now() < deadline) { if (await check()) return; await delay(100) }
      throw Error(`Timed out: ${label}\n${await ui('text', '.history-controls')}`)
    }
    const click = label => wait(() => ui('button', null, label), label)
    await wait(async () => (await ui('text', '.history-controls')).replaceAll(',', '').includes('300 / 10000'), 'initial page')
    await wait(async () => await ui('count', '.folded-node') > 0, 'compact segments visible')
    await ui('click', '.folded-node')
    await wait(async () => /^[a-f0-9]{40}$/.test(await ui('focus')), 'expanded real commit receives focus')
    await click('重新折叠'); await click('显示每个存档')
    assert.equal(await ui('count', '.folded-node'), 0)
    await click('折叠连续存档'); await ui('key', null, 'End')
    await wait(async () => /^[a-f0-9]{40}$/.test(await ui('selected')), 'keyboard selects a real commit')
    console.log(`${host}: fold, expand and keyboard passed`)
    const mapHeightBeforeReferences = (await ui('metrics')).mapHeight
    await click('分支与标签'); await ui('escape', '.map-overview input')
    await wait(async () => await ui('count', '.map-overview') === 0 && await ui('activeText') === '分支与标签', 'Escape returns toggle focus')
    await click('分支与标签'); await click('返回地图')
    await wait(async () => await ui('count', '.map-overview') === 0 && await ui('activeText') === '分支与标签', 'back returns toggle focus')
    await click('分支与标签')
    assert.equal((await ui('metrics')).mapHeight, mapHeightBeforeReferences)
    await ui('input', '.map-overview input', 'absent-reference-fixture')
    await wait(async () => (await ui('text', '.map-overview')).includes('没有匹配'), 'empty reference result')
    await ui('input', '.map-overview input', 'origin-point')
    await wait(async () => await ui('count', '.map-ref-list button') === 1, 'reference filter')
    await ui('click', '.map-ref-list button')
    await wait(async () => (await ui('text', '.history-controls')).replaceAll(',', '').includes('10000 / 10000'), 'reference loads full history', 180000)
    await wait(async () => (await ui('selected')) === f.first, 'old tag located')
    assert.equal(await ui('count', '.map-overview'), 0, 'Reference navigation returns to map')
    console.log(`${host}: unloaded reference loaded and located across 10000 commits`)
    await ui('input', '.tree-search input', f.target)
    await wait(async () => await ui('count', '.history-hit') === 1, 'global search result')
    await ui('click', '.history-hit'); await wait(async () => (await ui('selected')) === f.target, 'interior search target revealed')
    await wait(async () => await ui('count', '.folded-node.muted') > 0, 'unrelated folded history dims during search')
    assert.equal(await ui('count', '.folded-node:not(.muted)'), 0)
    await ui('input', '.tree-search input', '')
    await click('只看节点附近'); await wait(async () => (await ui('text', '.map-scope')).includes(f.target.slice(0, 7)), 'nearby center')
    await ui('select', '.map-scope select', '8')
    await ui('key', null, 'ArrowDown'); await wait(async () => (await ui('selected')) !== f.target, 'nearby navigation')
    await click('以当前选择为中心'); await click('退出附近视图'); await click('当前位置')
    await wait(async () => (await ui('selected')) === before.head, 'HEAD located without checkout')
    await click('缩小'); await wait(async () => (await ui('text', '.zoom-controls output')) === '85%', 'zoom out')
    await click('放大'); await wait(async () => (await ui('text', '.zoom-controls output')) === '100%', 'zoom in')
    assert.equal(await ui('selected'), before.head)
    if (host !== 'desktop') {
      const branch = await surface.evaluate(host => { const doc = host === 'vscode' ? document.querySelector('#active-frame').contentDocument : document; return [...doc.querySelector('.branch-filter select').options].find(option => option.text === 'experiment-400').value }, host)
      await ui('select', '.branch-filter select', branch)
      await wait(async () => await ui('count', '.folded-node.muted') > 0, 'unrelated folded history dims outside focused branch')
      await ui('select', '.branch-filter select', '')
      await click('比较两个存档'); await ui('key', null, 'ArrowDown')
      await wait(async () => await ui('count', '.compare-strip code') === 2 && !(await ui('text', '.compare-strip')).includes('再点一个'), 'compare real nodes')
      await click('退出比较'); await click('当前位置')
    } else {
      await button('横向').click(); await ui('key', null, 'End')
      await wait(async () => (await ui('selected')) === f.first, 'horizontal oldest node')
      await button('竖向').click(); await click('当前位置')
    }
    await page.setViewportSize({ width: host === 'vscode' ? 1600 : 1280, height: 900 })
    if (host !== 'desktop') await wait(async () => !(await ui('text', '.node-inspector')).includes('正在读取文件变化'), 'inspector settled')
    await delay(350)
    const wide = await ui('metrics')
    assert.equal(wide.overflow, false); assert.ok(wide.mapHeight >= 120); assert.ok(wide.nodes < 150)
    assert.equal(wide.foldedBorder, 'dashed')
    const hover = await ui('hoverFold'), frameBounds = host === 'vscode' ? await page.locator('iframe.webview').boundingBox() : { x: 0, y: 0 }
    await page.mouse.move(hover.x + frameBounds.x, hover.y + frameBounds.y)
    assert.equal((await ui('metrics')).foldedBorder, 'dashed', 'Aggregate remains distinct on hover')
    await page.mouse.move(0, 0)
    await page.screenshot({ path: path.join(out, `map-${host}-wide.png`) })
    await page.setViewportSize({ width: host === 'desktop' ? 960 : host === 'vscode' ? 980 : 600, height: 800 })
    await delay(350)
    await page.screenshot({ path: path.join(out, `map-${host}-narrow-map.png`) })
    const beforeReferences = await ui('metrics')
    await click('分支与标签'); await ui('input', '.map-overview input', '')
    const narrow = await ui('metrics')
    assert.equal(narrow.overflow, false); assert.ok(narrow.mapHeight >= 200)
    assert.equal(narrow.mapHeight, beforeReferences.mapHeight)
    await page.screenshot({ path: path.join(out, `map-${host}-narrow.png`) })
    assert.equal(await git.head(), before.head); assert.equal(await git.status(), before.status); assert.equal(await git.command(['show-ref']), before.refs)
    assert.deepEqual(errors, [])
    await fs.writeFile(path.join(out, `map-${host}-result.json`), JSON.stringify({ root: f.root, count: 10000, compact: true, expansion: true, keyboardRealCommits: true, unloadedRefLocated: true, hiddenSearchRevealed: true, nearbyNavigation: true, zoom: true, referenceBackAndEscapeFocus: true, referenceKeepsCanvasHeight: true, foldedSearchDimming: true, foldedBranchDimming: host !== 'desktop', foldedDashedAndHover: true, compare: host !== 'desktop', horizontal: host === 'desktop', repoUnchanged: true, wide, narrow, errors }, null, 2))
    console.log(`PASS ${host}: 10000 commits, compact/expand, references, search, nearby, keyboard, unchanged Git`)
  } finally { await browser.close().catch(() => {}) }
})().catch(error => { console.error(error); process.exitCode = 1 })

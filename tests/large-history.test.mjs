import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { GitService } from '../extensions/vscode/git-service.cjs'
import { largeRepo, scratch } from './helpers/large-repo.cjs'
import { layoutHistory } from '../src/version-tree/layout.js'
import { visibleHistory, orientLayout } from '../src/version-tree/viewport.js'
import { mergeHistory } from '../src/version-tree/useHistoryPaging.js'
import { projectHistory } from '../src/version-tree/projection.js'

async function loadAll(git, snapshot, limit = 1000) {
  while (snapshot.nextCursor) snapshot = mergeHistory(snapshot, await git.historyPage({ cursor: snapshot.nextCursor, limit }))
  return snapshot
}

test('2000, 5000 and 10000 real commits: complete pagination, all parents, global search and bounded rendering', { timeout: 180000 }, async () => {
  const reports = []
  for (const count of [2000, 5000, 10000]) {
    const f = await largeRepo(count), start = performance.now()
    const firstPage = await f.git.snapshot()
    assert.equal(firstPage.total, count); assert.equal(firstPage.commits.length, 300); assert.ok(firstPage.nextCursor)
    const firstMs = performance.now() - start
    const full = await loadAll(f.git, firstPage)
    const loadMs = performance.now() - start
    const expected = new Map((await f.git.command(['rev-list', '--all', '--parents'])).trim().split('\n').map(line => { const [oid, ...parents] = line.split(' '); return [oid, parents] }))
    assert.equal(full.commits.length, count)
    assert.equal(new Set(full.commits.map(c => c.oid)).size, count)
    for (const commit of full.commits) assert.deepEqual(commit.parents, expected.get(commit.oid))
    assert.equal(full.nextCursor, null)
    const searchStart = performance.now()
    const found = await f.git.searchHistory({ query: 'root-marker', revision: full.revision })
    const searchMs = performance.now() - searchStart
    assert.equal(found.commits.length, 1); assert.equal(found.commits[0].oid, f.first)
    assert.equal((await f.git.searchHistory({ query: f.first.slice(0, 10), revision: full.revision })).commits[0].oid, f.first)
    assert.equal((await f.git.searchHistory({ query: 'origin-point', revision: full.revision })).commits[0].oid, f.first)
    const matches = await f.git.searchHistory({ query: 'save', revision: full.revision, limit: 50 })
    const next = await f.git.searchHistory({ query: 'save', revision: full.revision, limit: 50, cursor: matches.nextCursor })
    assert.equal(new Set([...matches.commits, ...next.commits].map(c => c.oid)).size, 100)
    const layoutStart = performance.now(), layout = layoutHistory(full.commits, full.head), layoutMs = performance.now() - layoutStart
    const byId = new Map(layout.nodes.map(node => [node.oid, node]))
    assert.equal(layout.edges.length, full.commits.reduce((n, c) => n + c.parents.length, 0))
    for (const edge of layout.edges) assert.ok(byId.get(edge.to).level > byId.get(edge.from).level)
    const visible = visibleHistory(layout, byId, { left: 0, top: layout.height / 2, width: 1200, height: 800 }, 1)
    assert.ok(visible.nodes.length > 0 && visible.nodes.length < 100)
    const horizontal = orientLayout(layout, true), horizontalById = new Map(horizontal.nodes.map(n => [n.oid, n]))
    assert.ok(visibleHistory(horizontal, horizontalById, { left: horizontal.width / 2, top: 0, width: 1200, height: 800 }, 1, true).nodes.length < 100)
    const projection = projectHistory(full.commits, { anchors: [full.head, ...full.branches.map(ref => ref.oid), ...full.tags.map(ref => ref.oid)], reveal: [full.commits[100].oid] })
    const represent = oid => projection.representative.get(oid) || oid
    const projectedEdges = new Set(projection.nodes.flatMap(node => node.parents.map(parent => `${node.oid}>${parent}`)))
    const realEdges = new Set(full.commits.flatMap(node => node.parents.filter(parent => represent(parent) !== represent(node.oid)).map(parent => `${represent(node.oid)}>${represent(parent)}`)))
    assert.deepEqual(projectedEdges, realEdges)
    assert.ok(projection.aggregates.length > 0 && projection.nodes.length < count / 2)
    assert.equal(projection.nodes.flatMap(node => node.members || [node.oid]).length, count)
    reports.push({ root: f.root, first: f.first, count, firstMs, loadMs, searchMs, layoutMs, visibleNodes: visible.nodes.length, edges: layout.edges.length })
    console.log(JSON.stringify(reports.at(-1)))
  }
  await fs.writeFile(path.join(scratch, 'report.json'), JSON.stringify(reports, null, 2))
})

test('old pinned HEAD never drops a page boundary; changed refs and cross-repository cursors are rejected', { timeout: 60000 }, async () => {
  const f = await largeRepo(2100)
  await f.git.command(['switch', '--detach', f.first])
  const first = await f.git.snapshot(300)
  assert.ok(first.headPinned); assert.equal(first.nextCursor.offset, 299)
  const full = await loadAll(f.git, first)
  assert.equal(full.commits.length, 2100); assert.equal(full.headPinned, false)
  await f.git.command(['branch', 'new-reference', f.first])
  await assert.rejects(f.git.historyPage({ cursor: first.nextCursor }), /历史已变化/)
  await assert.rejects(f.git.searchHistory({ query: 'save', revision: first.revision }), /历史已变化/)
  await assert.rejects(f.git.historyPage({ cursor: { revision: full.revision, offset: -1 } }), /失效/)
  const other = await largeRepo(25)
  await assert.rejects(other.git.historyPage({ cursor: first.nextCursor }), /历史已变化/)
})

test('shallow history is explicit and deepening invalidates the previous cursor', { timeout: 30000 }, async () => {
  const f = await largeRepo(25), target = path.join(f.root, '..', path.basename(f.root) + '-shallow')
  await f.git.command(['clone', '--depth', '5', '--no-tags', pathToFileURL(f.root).href, target])
  const git = await GitService.open(target), initial = await git.snapshot()
  assert.equal(initial.shallow, true); assert.equal(initial.total, 5)
  assert.equal(initial.nextCursor, null)
  assert.deepEqual((await git.searchHistory({ query: 'root-marker', revision: initial.revision })).commits, [])
  await git.command(['fetch', '--unshallow', '--no-tags'])
  await assert.rejects(git.historyPage({ cursor: { revision: initial.revision, offset: 0 } }), /历史已变化/)
  const full = await git.snapshot()
  assert.equal(full.shallow, false); assert.equal(full.total, 25)
  assert.equal((await git.searchHistory({ query: 'root-marker', revision: full.revision })).commits[0].oid, f.first)
})

test('an edge crossing the viewport remains visible with both endpoints outside it', () => {
  const nodes = [{ oid: 'a', x: 48, y: 0 }, { oid: 'b', x: 48, y: 10000 }]
  const layout = { nodes, edges: [{ from: 'a', to: 'b' }], width: 520, height: 10166 }
  const visible = visibleHistory(layout, new Map(nodes.map(n => [n.oid, n])), { left: 0, top: 5000, width: 1200, height: 800 }, 1)
  assert.equal(visible.nodes.length, 0); assert.equal(visible.edges.length, 1)
})

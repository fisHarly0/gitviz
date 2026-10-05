import test from 'node:test'
import assert from 'node:assert/strict'
import { projectHistory, nearbyHistory } from '../src/version-tree/projection.js'
import { layoutHistory } from '../src/version-tree/layout.js'
import { orientLayout, visibleHistory } from '../src/version-tree/viewport.js'

const chain = count => Array.from({ length: count }, (_, index) => ({ oid: String(count - index), parents: count - index > 1 ? [String(count - index - 1)] : [], message: 'save', author: 'fixture' }))
function verifyEdges(original, projected) {
  const resolve = oid => projected.representative.get(oid) || oid
  const expected = new Set(original.flatMap(node => node.parents.map(parent => [resolve(node.oid), resolve(parent)]).filter(([from, to]) => from !== to).map(edge => edge.join('>'))))
  const actual = new Set(projected.nodes.flatMap(node => node.parents.map(parent => `${node.oid}>${parent}`)))
  assert.deepEqual(actual, expected)
  const represented = projected.nodes.flatMap(node => node.folded ? node.members : [node.oid])
  assert.equal(new Set(represented).size, original.length)
  assert.deepEqual(new Set(represented), new Set(original.map(node => node.oid)))
  layoutHistory(projected.nodes)
}

test('linear history folds reversible segments without inventing or losing ancestry', () => {
  const commits = chain(25), projected = projectHistory(commits, { anchors: ['25', '15'], reveal: ['12', '6'] })
  verifyEdges(commits, projected)
  for (const oid of ['25', '15', '12', '6', '1']) assert.ok(projected.nodes.some(node => node.oid === oid && !node.folded))
  assert.ok(projected.aggregates.length > 1)
  const expanded = projectHistory(commits, { anchors: ['25', '15'], reveal: ['12', '6'], expanded: new Set(projected.aggregates.map(node => node.group)) })
  assert.equal(expanded.nodes.length, 25); verifyEdges(commits, expanded)
  assert.equal(projectHistory(commits, { compact: false }).nodes.length, 25)
})

test('forks, octopus merges, roots, references and omitted parents remain explicit', () => {
  const commits = chain(30)
  commits.find(node => node.oid === '28').parents.push('side-a', 'side-b')
  commits.push({ oid: 'side-a', parents: ['12'] }, { oid: 'side-b', parents: ['12'] }, { oid: 'other-root', parents: [] }, { oid: 'boundary', parents: ['omitted'] })
  const projected = projectHistory(commits, { anchors: ['30', '18'] })
  verifyEdges(commits, projected)
  for (const oid of ['28', '12', '18', 'other-root', 'boundary']) assert.ok(projected.nodes.some(node => node.oid === oid))
  assert.equal(layoutHistory(projected.nodes).edges.filter(edge => edge.merge).length, 2)
  assert.ok(layoutHistory(projected.nodes).edges.some(edge => edge.to === 'omitted' && edge.missing))
})

test('search and compare reveal interior commits while expansion keys survive selection changes', () => {
  const commits = chain(100), initial = projectHistory(commits)
  const shown = projectHistory(commits, { reveal: ['70', '40', '20'] })
  for (const oid of ['70', '40', '20']) assert.ok(shown.nodes.some(node => node.oid === oid))
  assert.ok(shown.aggregates.every(node => node.group === initial.aggregates[0].group))
  verifyEdges(commits, shown)
  const scrambled = projectHistory([...commits].reverse(), { reveal: ['70'] })
  verifyEdges(commits, scrambled)
  assert.equal(scrambled.aggregates.length, 2)
})

test('nearby traversal follows both parent and child links, includes all merge parents and marks boundaries', () => {
  const commits = chain(15)
  commits.find(node => node.oid === '10').parents.push('side')
  commits.push({ oid: 'side', parents: ['5'] })
  const nearby = nearbyHistory(commits, '10', 1)
  assert.deepEqual(new Set(nearby.map(node => node.oid)), new Set(['11', '10', '9', 'side']))
  const projected = projectHistory(nearby, { anchors: ['10'] }); verifyEdges(nearby, projected)
  assert.ok(layoutHistory(projected.nodes).edges.some(edge => edge.to === '5' && edge.missing))
  assert.equal(nearbyHistory(commits, null, 1), commits)
  assert.deepEqual(nearbyHistory(commits, 'absent', 2), [])
})

test('10000 commits stay bounded in compact view and retain correct horizontal and vertical edges', () => {
  const commits = chain(10000), projected = projectHistory(commits, { anchors: ['10000', '5000'], reveal: ['7777'] })
  verifyEdges(commits, projected)
  assert.ok(projected.nodes.length < 12)
  for (const horizontal of [false, true]) {
    const layout = orientLayout(layoutHistory(projected.nodes, '10000'), horizontal), byId = new Map(layout.nodes.map(node => [node.oid, node]))
    assert.ok(visibleHistory(layout, byId, { left: 0, top: 0, width: 900, height: 600 }, 1, horizontal).nodes.length < 12)
    for (const edge of layout.edges) assert.ok(byId.get(edge.from).level < byId.get(edge.to).level)
  }
})

import test from 'node:test'
import assert from 'node:assert/strict'
import { layoutHistory, ancestorsOf } from '../src/version-tree/layout.js'

const c = (oid, parents = [], timestamp = 1) => ({ oid, parents, timestamp, message: oid })
test('merge keeps both parents and ignores clock skew when ordering', () => {
  const commits = [c('root', [], 100), c('left', ['root'], 50), c('merge', ['left', 'right'], 1), c('right', ['root'], 200)]
  const graph = layoutHistory(commits), nodes = new Map(graph.nodes.map(node => [node.oid, node]))
  assert.equal(graph.edges.length, 4)
  for (const edge of graph.edges) assert.ok(nodes.get(edge.from).y < nodes.get(edge.to).y)
  assert.notEqual(nodes.get('left').x, nodes.get('right').x)
  assert.deepEqual(ancestorsOf('merge', commits), new Set(['merge', 'left', 'right', 'root']))
})
test('octopus merges, independent roots and missing history are explicit', () => {
  const graph = layoutHistory([c('m', ['a', 'b', 'c']), c('a', ['missing']), c('b'), c('c'), c('other')])
  assert.equal(graph.nodes.length, 5)
  assert.equal(graph.edges.filter(edge => edge.from === 'm').length, 3)
  assert.equal(graph.edges.filter(edge => edge.missing).length, 1)
  const positions = graph.nodes.map(node => `${node.x},${node.y}`)
  assert.equal(new Set(positions).size, positions.length)
})
test('long divergent graph preserves topology without overlap', () => {
  const commits = [c('root')]
  for (let i = 0; i < 300; i++) commits.unshift(c(`a${i}`, [i ? `a${i - 1}` : 'root']), c(`b${i}`, [i ? `b${i - 1}` : 'root']))
  commits.unshift(c('merge', ['a299', 'b299']))
  const graph = layoutHistory(commits), nodes = new Map(graph.nodes.map(node => [node.oid, node]))
  assert.equal(graph.nodes.length, 602)
  for (const edge of graph.edges) assert.ok(nodes.get(edge.from).level < nodes.get(edge.to).level)
  assert.equal(new Set(graph.nodes.map(node => `${node.x},${node.y}`)).size, 602)
})
test('invalid cyclic graph fails explicitly; empty graph remains usable', () => {
  assert.throws(() => layoutHistory([c('a', ['b']), c('b', ['a'])]), /循环/)
  assert.equal(layoutHistory([]).nodes.length, 0)
})

test('current first-parent history keeps the primary lane even if another tip is listed first', () => {
  const graph = layoutHistory([c('trial', ['base']), c('head', ['base']), c('base')], 'head')
  assert.equal(graph.nodes.find(node => node.oid === 'head').lane, 0)
  assert.equal(graph.nodes.find(node => node.oid === 'base').lane, 0)
  assert.equal(graph.nodes.find(node => node.oid === 'trial').lane, 1)
})

test('missing-history stub cannot touch an independently pinned old node', () => {
  const graph = layoutHistory([c('tip', ['missing']), c('old-head')])
  const [tip, old] = graph.nodes
  assert.ok(old.y > tip.y + 76 + 48)
})

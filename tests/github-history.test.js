import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createGithubAdapter } from '../src/adapters/githubAdapter.js'
import { githubErrorMessage, loadGithubHistory } from '../src/adapters/githubHistory.js'
import { layoutHistory } from '../src/version-tree/layout.js'

const branch = (name, oid = name) => ({ name, oid })
const commit = (oid, parents = [], timestamp = 1) => ({ oid, parents, timestamp, message: oid })
const statusError = status => Object.assign(new Error('Raw request details must not appear'), { status })

test('remote errors give recovery guidance without echoing request data', () => {
  for (const status of [401, 403, 404, 409, 422, 429, 500, 0]) {
    const message = githubErrorMessage(statusError(status))
    assert.ok(message.length > 15)
    assert.doesNotMatch(message, /Raw request/)
  }
  assert.match(githubErrorMessage({ status: 403, response: { headers: { 'x-ratelimit-remaining': '0' } } }), /额度/)
  assert.match(githubErrorMessage(new TypeError('Failed to fetch')), /网络/)
})

test('partial history preserves successful commits, every merge parent and failures', async () => {
  const requested = []
  const adapter = {
    listBranches: async () => [branch('main', 'merge'), branch('topic', 'side'), branch('broken')],
    listTags: async () => { throw statusError(500) },
    listCommits: async ({ ref }) => {
      requested.push(ref)
      if (ref === 'broken') throw statusError(404)
      return ref === 'merge' ? [commit('merge', ['base', 'side'], 1), commit('base', [], 9)] : [commit('side', ['base'], 8)]
    },
  }
  const data = await loadGithubHistory(adapter)
  assert.deepEqual(requested.sort(), ['broken', 'merge', 'side'])
  assert.equal(data.commits.length, 3)
  assert.equal(data.warnings.length, 2)
  assert.match(data.warnings.join(' '), /标签未读取.*broken 未读取/)
  const graph = layoutHistory(data.commits, 'merge')
  assert.equal(graph.nodes[0].oid, 'merge')
  assert.deepEqual(graph.edges.filter(edge => edge.from === 'merge').map(edge => edge.to).sort(), ['base', 'side'])
})

test('remote requests are bounded to three and cancellation stops queued branches', async () => {
  const controller = new AbortController()
  let started = 0, active = 0, maximum = 0
  let ready
  const allStarted = new Promise(resolve => { ready = resolve })
  const adapter = {
    listBranches: async () => Array.from({ length: 12 }, (_, i) => branch(String(i))),
    listTags: async () => [],
    listCommits: ({ signal }) => new Promise((resolve, reject) => {
      started++; active++; maximum = Math.max(maximum, active)
      signal.addEventListener('abort', () => { active--; reject(signal.reason) }, { once: true })
      if (started === 3) ready()
    }),
  }
  const result = loadGithubHistory(adapter, controller.signal)
  await allStarted
  controller.abort()
  await assert.rejects(result, { name: 'AbortError' })
  assert.equal(started, 3)
  assert.equal(maximum, 3)
  assert.equal(active, 0)
})

test('rate limiting stops further fan-out and makes skipped history explicit', async () => {
  let started = 0
  const data = await loadGithubHistory({
    listBranches: async () => Array.from({ length: 10 }, (_, i) => branch(String(i))),
    listTags: async () => [],
    listCommits: async () => { started++; throw statusError(429) },
  })
  assert.equal(started, 3)
  assert.equal(data.commits.length, 0)
  assert.match(data.warnings.at(-1), /7 个分支尚未读取/)
})

test('branch-list failure is not mistaken for an empty repository', async () => {
  await assert.rejects(loadGithubHistory({ listBranches: async () => { throw statusError(404) } }), { status: 404 })
  const data = await loadGithubHistory({ listBranches: async () => [] })
  assert.deepEqual(data, { branches: [], tags: [], commits: [], warnings: [] })
})

test('GitHub detail keeps unavailable patches distinct from empty file contents and reports pagination', async () => {
  const original = globalThis.fetch
  const requests = []
  globalThis.fetch = async (url, options) => {
    requests.push({ url: String(url), signal: options.signal, method: options.method })
    return new Response(JSON.stringify({ sha: 'a'.repeat(40), commit: { message: 'binary update' }, parents: [],
      files: [{ filename: 'image.png', status: 'modified' }] }), { status: 200,
      headers: { 'content-type': 'application/json', link: '<https://api.github.com/next>; rel="next"' } })
  }
  try {
    const controller = new AbortController()
    const adapter = createGithubAdapter({ owner: 'fixture', repo: 'readonly' })
    const detail = await adapter.getCommitDetail('a'.repeat(40), { signal: controller.signal })
    assert.equal(detail.filesPartial, true)
    assert.equal(detail.files[0].patch, '')
    assert.equal(detail.files[0].oldText, undefined)
    assert.equal(detail.files[0].newText, undefined)
    assert.equal(requests[0].method, 'GET')
    assert.match(requests[0].url, /per_page=100/)
    assert.ok(requests[0].signal)
    assert.match(detail.url, /^https:\/\/github.com\/fixture\/readonly\/commit\/a{40}$/)
  } finally { globalThis.fetch = original }
})

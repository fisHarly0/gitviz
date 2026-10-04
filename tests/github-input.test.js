import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import { loadPAT, parseRepoSpec, savePAT } from '../src/adapters/githubAdapter.js'

const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage')
afterEach(() => {
  if (originalStorage) Object.defineProperty(globalThis, 'sessionStorage', originalStorage)
  else delete globalThis.sessionStorage
})

test('accepts repository names and copied GitHub clone URLs with a trailing slash', () => {
  for (const input of ['fisHarly0/gitviz', ' https://github.com/fisHarly0/gitviz.git/ ', 'https://github.com/fisHarly0/gitviz/']) {
    assert.deepEqual(parseRepoSpec(input), { owner: 'fisHarly0', repo: 'gitviz' })
  }
})

test('rejects other hosts, nested pages, whitespace, and query strings', () => {
  for (const input of ['', 'a b/repo', 'owner/repo name', 'https://example.com/owner/repo', 'https://github.com/owner/repo/tree/main', 'owner/repo?token=x', 'owner/repo#readme', 'owner/..']) {
    assert.throws(() => parseRepoSpec(input), /owner\/repo/)
  }
})

test('unavailable storage does not prevent repository loading', () => {
  Object.defineProperty(globalThis, 'sessionStorage', {
    configurable: true,
    get() { throw new Error('Storage blocked') },
  })
  assert.equal(loadPAT(), '')
  assert.equal(savePAT('test-only-token'), false)
})

test('clearing the token removes it from session storage', () => {
  const values = new Map()
  Object.defineProperty(globalThis, 'sessionStorage', {
    configurable: true,
    value: {
      getItem: key => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
      removeItem: key => values.delete(key),
    },
  })
  assert.equal(savePAT('test-only-token'), true)
  assert.equal(loadPAT(), 'test-only-token')
  assert.equal(savePAT(''), true)
  assert.equal(loadPAT(), '')
  assert.equal(values.size, 0)
})

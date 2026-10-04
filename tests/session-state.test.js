import test from 'node:test'
import assert from 'node:assert/strict'
import { initialSession, sessionReducer as reduce } from '../src/state/session-state.js'

const snapshot = (head, branch = 'main') => ({ head, branch, branches: [{ name: 'main' }, { name: 'topic' }, { name: 'origin/main', remote: true }] })
const start = () => reduce(initialSession, { type: 'snapshot', snapshot: snapshot('first') })

test('refresh follows actual HEAD and branch, including detached HEAD', () => {
  let state = start()
  state = reduce(state, { type: 'snapshot', snapshot: snapshot('second', 'topic') })
  assert.equal(state.currentBranch, 'topic'); assert.equal(state.headOid, 'second')
  assert.equal(state.viewingOid, 'second'); assert.equal(state.mode, 'browse')
  state = reduce(state, { type: 'snapshot', snapshot: snapshot('first', '') })
  assert.equal(state.currentBranch, ''); assert.equal(state.headOid, 'first')
  assert.equal(state.mainBranch, 'main')
})

test('external refresh keeps an explicitly previewed old commit', () => {
  let state = reduce(start(), { type: 'preview', oid: 'old' })
  state = reduce(state, { type: 'snapshot', snapshot: snapshot('second') })
  assert.equal(state.headOid, 'second'); assert.equal(state.viewingOid, 'old'); assert.equal(state.mode, 'preview')
  state = reduce(state, { type: 'browse' })
  assert.equal(state.viewingOid, 'second')
})

test('a refresh never rebases an open editor onto external work', () => {
  const state = reduce(start(), { type: 'edit', file: 'a.txt', branch: 'if-first-1', head: 'first' })
  assert.equal(reduce(state, { type: 'snapshot', snapshot: snapshot('external', 'other') }), state)
  const closed = reduce(state, { type: 'edit', file: null, branch: 'if-first-1' })
  const refreshed = reduce(closed, { type: 'snapshot', snapshot: snapshot('external', 'other') })
  assert.equal(refreshed.headOid, 'external'); assert.equal(refreshed.currentBranch, 'other')
  assert.equal(refreshed.currentIfBranch, null); assert.equal(refreshed.mode, 'browse')
})

test('switch and restore results select the actual new HEAD; changing repository clears edit state', () => {
  let state = reduce(start(), { type: 'edit', file: 'a.txt', branch: 'if-first-1' })
  state = reduce(state, { type: 'commit', head: 'saved' })
  assert.equal(state.viewingOid, 'saved'); assert.equal(state.editingFile, null)
  state = reduce(state, { type: 'switch', branch: 'main', head: 'restored' })
  assert.equal(state.viewingOid, 'restored'); assert.equal(state.currentIfBranch, null)
  state = reduce(state, { type: 'setup', names: ['trunk'], branch: 'trunk', head: 'other-repo' })
  assert.equal(state.headOid, 'other-repo'); assert.equal(state.mainBranch, 'trunk')
  assert.equal(state.changedFilesInIf, 0); assert.equal(state.ifLineCounter, 0)
})

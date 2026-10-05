import test from 'node:test'
import assert from 'node:assert/strict'
import { createDesktopCloseController } from '../src/state/desktop-close-controller.js'

function deferred() {
  let resolve
  const promise = new Promise(done => { resolve = done })
  return { promise, resolve }
}
function setup(overrides = {}) {
  const state = { active: false, closed: 0, prompts: [], notices: [] }
  const options = {
    isActive: () => state.active,
    run: async action => {
      assert.equal(state.active, false)
      state.active = true
      try { return await action() } finally { state.active = false }
    },
    confirm: async plan => { state.prompts.push(plan); return true },
    readDraft: () => null,
    destroy: async () => { state.closed++ },
    report: notice => state.notices.push(notice),
    ...overrides,
  }
  return { state, controller: createDesktopCloseController(options) }
}

test('clean window closes without a discard prompt', async () => {
  const { state, controller } = setup()
  await controller.request()
  assert.equal(state.closed, 1)
  assert.deepEqual(state.prompts, [])
  assert.equal(state.active, false)
})

test('cancel keeps the draft; a later explicit discard can close', async () => {
  const draft = { path: 'counter.txt', dirty: true }
  let accept = false
  const { state, controller } = setup({ readDraft: () => draft, confirm: async () => accept })
  await controller.request()
  assert.equal(state.closed, 0)
  assert.equal(draft.dirty, true)
  assert.equal(state.active, false)
  accept = true
  await controller.request()
  assert.equal(state.closed, 1)
})

test('repeated close coalesces, reserves gate and identifies the draft file', async () => {
  const answer = deferred(), plans = []
  const { state, controller } = setup({
    readDraft: () => ({ path: 'folder/file.txt', dirty: true }),
    confirm: plan => { plans.push(plan); return answer.promise },
  })
  const closing = controller.request()
  assert.equal(state.active, true)
  await controller.request()
  assert.equal(plans.length, 1)
  assert.deepEqual(plans[0].files, ['folder/file.txt'])
  assert.equal(state.closed, 0)
  answer.resolve(true)
  await closing
  assert.equal(state.closed, 1)
})

test('ongoing operations or confirmations block closure without replacing them', async () => {
  const { state, controller } = setup({ isActive: () => true })
  await controller.request()
  assert.equal(state.closed, 0)
  assert.deepEqual(state.prompts, [])
  assert.equal(state.notices[0].kind, 'busy')
})

test('destroy failure reports a reason, releases the gate and allows retry', async () => {
  let attempts = 0
  const { state, controller } = setup({ destroy: async () => { if (++attempts === 1) throw new Error('permission denied') } })
  await controller.request()
  assert.equal(state.active, false)
  assert.match(state.notices.at(-1).text, /permission denied/)
  await controller.request()
  assert.equal(attempts, 2)
  assert.equal(state.notices.at(-1), null)
})

test('disposed controller cannot close a newer session after a late answer', async () => {
  const answer = deferred()
  const { state, controller } = setup({ readDraft: () => ({ path: 'a', dirty: true }), confirm: () => answer.promise })
  const closing = controller.request()
  controller.dispose()
  answer.resolve(true)
  await closing
  await controller.request()
  assert.equal(state.closed, 0)
  assert.equal(state.active, false)
})

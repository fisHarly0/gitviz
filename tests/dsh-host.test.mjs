import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import http from 'node:http'
import { once } from 'node:events'
import { GitService } from '../extensions/vscode/git-service.cjs'
import { createHandler } from '../extensions/dsh/host.mjs'

async function fixture(t) {
  const parent = process.env.GITVIZ_TEST_ROOT || (process.platform === 'win32' ? 'F:/Codex/work/gitviz-tests' : path.join(os.tmpdir(), 'gitviz-tests'))
  await fs.mkdir(parent, { recursive: true })
  const root = await fs.mkdtemp(path.join(parent, 'dsh-'))
  const git = new GitService(root)
  await git.command(['init', '-b', 'main'])
  await git.command(['config', 'user.name', 'Gitviz Test Fixture'])
  await git.command(['config', 'user.email', 'fixture@example.invalid'])
  await git.command(['config', 'commit.gpgsign', 'false'])
  await git.command(['config', 'core.autocrlf', 'false'])
  await fs.writeFile(path.join(root, '中文.txt'), 'first\n')
  await git.command(['add', '.']); await git.command(['commit', '-m', 'first'])
  const first = await git.head()
  await fs.writeFile(path.join(root, '中文.txt'), 'second\n')
  await git.command(['add', '.']); await git.command(['commit', '-m', 'second'])
  let clock = Date.now()
  const handler = createHandler({ GitService, config: { worktreeDirectory: path.join(parent, 'worktrees') }, port: () => server.address().port, now: () => clock })
  const server = http.createServer(handler)
  server.listen(0, '127.0.0.1'); await once(server, 'listening')
  const url = `http://127.0.0.1:${server.address().port}`
  t.after(() => { handler.dispose(); server.closeAllConnections(); server.close() })
  const call = (method, params, repoId, headers = {}) => new Promise((resolve, reject) => {
    const request = http.request(url, { method: 'POST', headers: { Origin: url, 'Content-Type': 'application/json', 'X-Gitviz-Client': '1', ...headers } }, response => {
      const chunks = []
      response.on('data', chunk => chunks.push(chunk))
      response.on('end', () => resolve({ status: response.statusCode, ...JSON.parse(Buffer.concat(chunks).toString()) }))
    })
    request.on('error', reject)
    request.end(JSON.stringify({ method, params, repoId }))
  })
  const { result: snapshot } = await call('open', { path: root })
  const repoId = snapshot.repoId, expected = { head: snapshot.head, branch: snapshot.branch }
  return { root, git, first, snapshot, repoId, expected, call, expire: () => { clock += 300001 } }
}

test('local same-origin carrier rejects foreign origins, bad host and missing client header', async t => {
  const f = await fixture(t)
  assert.equal((await f.call('snapshot', {}, f.repoId)).status, 200)
  for (const headers of [{ Origin: 'https://evil.example' }, { Origin: '' }, { Host: 'evil.example' }, { 'X-Gitviz-Client': '' }, { 'Content-Type': 'text/plain' }]) {
    assert.equal((await f.call('snapshot', {}, f.repoId, headers)).status, 403)
  }
  assert.match((await f.call('command', { args: ['reset', '--hard'] }, f.repoId)).error, /不支持/)
  assert.match((await f.call('detail', { oid: f.first }, 'wrong')).error, /失效/)
})

test('two-phase write does nothing before execute, binds parameters and cannot replay', async t => {
  const f = await fixture(t)
  const { result: plan } = await f.call('prepare', { action: 'createBranch', name: '试验', oid: f.first, expected: f.expected }, f.repoId)
  assert.equal((await f.git.snapshot()).branches.length, 1)
  assert.match((await f.call('execute', { token: plan.token }, 'wrong')).error, /失效/)
  const done = await f.call('execute', { token: plan.token, name: 'injected', oid: f.expected.head }, f.repoId)
  assert.equal(done.status, 200)
  assert.equal(done.result.snapshot.branches.find(b => b.name === '试验').oid, f.first)
  assert.equal(await f.git.head(), f.expected.head)
  assert.match((await f.call('execute', { token: plan.token }, f.repoId)).error, /已使用/)
})

test('expired confirmation, changed HEAD and newly dirty worktree reject execution', async t => {
  const f = await fixture(t)
  const prepare = async () => (await f.call('prepare', { action: 'restore', oid: f.first, expected: f.expected }, f.repoId)).result
  const old = await prepare(); f.expire()
  assert.match((await f.call('execute', { token: old.token }, f.repoId)).error, /过期/)
  const dirty = await prepare()
  await fs.writeFile(path.join(f.root, 'untracked.txt'), 'keep me')
  assert.match((await f.call('execute', { token: dirty.token }, f.repoId)).error, /未提交|未跟踪/)
  await f.git.command(['add', '.']); await f.git.command(['commit', '-m', 'concurrent change'])
  assert.match((await f.call('prepare', { action: 'createBranch', name: 'stale', oid: f.first, expected: f.expected }, f.repoId)).error, /变化|改变/)
  assert.equal(await fs.readFile(path.join(f.root, 'untracked.txt'), 'utf8'), 'keep me')
})

test('diff, restore, worktree and branch switch use real Git with history retained', async t => {
  const f = await fixture(t)
  const diff = await f.call('openDiff', { from: f.first, to: f.expected.head, path: '中文.txt' }, f.repoId)
  assert.equal(diff.result.before, 'first\n'); assert.equal(diff.result.after, 'second\n')
  assert.match((await f.call('openDiff', { from: f.first, to: f.expected.head, path: '../outside' }, f.repoId)).error, /差异/)
  const execute = async (action, extra, expected) => {
    const { result: plan } = await f.call('prepare', { action, ...extra, expected }, f.repoId)
    const result = await f.call('execute', { token: plan.token }, f.repoId)
    assert.equal(result.status, 200, result.error)
    return result.result
  }
  const restored = await execute('restore', { oid: f.first }, f.expected)
  assert.equal(await fs.readFile(path.join(f.root, '中文.txt'), 'utf8'), 'first\n')
  assert.equal((await f.git.command(['rev-parse', restored.backup])).trim(), f.expected.head)
  assert.equal((await f.git.command(['rev-parse', 'HEAD^'])).trim(), f.expected.head)
  const expected = { head: restored.head, branch: 'main' }
  const worktree = await execute('createWorktree', { oid: f.first, name: 'experiment' }, expected)
  assert.equal(await fs.readFile(path.join(worktree.worktree, '中文.txt'), 'utf8'), 'first\n')
  assert.equal(await f.git.head(), restored.head)
  await execute('createBranch', { oid: f.first, name: 'alternate' }, expected)
  assert.equal((await execute('switchBranch', { name: 'alternate' }, expected)).snapshot.branch, 'alternate')
})

test('failed restore record survives reopening, cancellation invalidates recovery ticket, and stale files reject continue', async t => {
  const f = await fixture(t)
  const hook = path.join(f.root, '.git', 'hooks', 'pre-commit')
  await fs.writeFile(hook, '#!/bin/sh\necho recovery-host-hook >&2\nexit 1\n', { mode: 0o755 })
  const { result: plan } = await f.call('prepare', { action: 'restore', oid: f.first, expected: f.expected }, f.repoId)
  assert.match((await f.call('execute', { token: plan.token }, f.repoId)).error, /recovery-host-hook/)
  const { result: listed } = await f.call('operations', {}, f.repoId), record = listed.records[0]
  assert.equal(record.state, 'failed'); assert.ok(record.backup); assert.ok(record.checkpoint.tree)
  assert.equal((await (await GitService.open(f.root)).operations()).records[0].id, record.id)
  await fs.unlink(hook)
  const prepare = async () => {
    const response = await f.call('prepare', { action: 'resumeCommit', id: record.id, expected: f.expected }, f.repoId)
    assert.equal(response.status, 200, response.error); return response.result
  }
  const cancel = await prepare()
  assert.equal((await f.call('cancel', { token: cancel.token }, f.repoId)).result.cancelled, true)
  assert.match((await f.call('execute', { token: cancel.token }, f.repoId)).error, /过期|已使用/)
  assert.equal(await f.git.head(), f.expected.head)
  const stale = await prepare()
  await fs.writeFile(path.join(f.root, '中文.txt'), 'outside change\n')
  assert.match((await f.call('execute', { token: stale.token }, f.repoId)).error, /工作文件/)
  await f.git.command(['restore', '--', '中文.txt'])
  const valid = await prepare()
  const resumed = await f.call('execute', { token: valid.token }, f.repoId)
  assert.equal(resumed.status, 200, resumed.error)
  assert.equal(resumed.result.operationId, record.id)
  assert.equal((await f.git.command(['rev-parse', 'HEAD^'])).trim(), f.expected.head)
  assert.equal((await f.call('operations', {}, f.repoId)).result.records[0].state, 'completed')
})

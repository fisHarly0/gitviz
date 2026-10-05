const test = require('node:test'), assert = require('node:assert/strict')
const fs = require('node:fs/promises'), path = require('node:path'), os = require('node:os')
const { spawn } = require('node:child_process'), { once } = require('node:events')
const { setTimeout: delay } = require('node:timers/promises')
const { GitService } = require('../extensions/vscode/git-service.cjs')
const { OperationHost } = require('../extensions/vscode/operation-host.cjs')
const root = process.env.GITVIZ_TEST_ROOT || (process.platform === 'win32' ? 'F:/Codex/work/gitviz-product/lifecycle-tests' : path.join(os.tmpdir(), 'gitviz-lifecycle'))
const quote = value => "'" + value.replaceAll('\\', '/').replaceAll("'", "'\\''") + "'"
async function waitFor(check, description) {
  const until = Date.now() + 45000
  while (Date.now() < until) { if (await check()) return; await delay(100) }
  throw new Error(`Timed out: ${description}`)
}
async function fixture() {
  await fs.mkdir(root, { recursive: true })
  const folder = await fs.mkdtemp(path.join(root, 'host-')), git = new GitService(folder)
  await git.command(['init', '-b', 'main'])
  for (const [key, value] of [['user.name', 'Fixture Author'], ['user.email', 'fixture@example.invalid'], ['commit.gpgsign', 'false'], ['core.autocrlf', 'false']]) await git.command(['config', key, value])
  await fs.writeFile(path.join(folder, 'file.txt'), 'first\n'); await git.command(['add', '.']); await git.command(['commit', '-m', 'first'])
  const first = await git.head()
  await fs.writeFile(path.join(folder, 'file.txt'), 'second\n'); await git.command(['commit', '-am', 'second'])
  return { folder, git, first, expected: { head: await git.head(), branch: 'main' } }
}

for (const mode of ['close', 'terminate']) test(`confirmed worker completes and journals after host ${mode}`, async () => {
  const f = await fixture()
  const helper = path.join(__dirname, 'helpers/gated-git-hook.cjs')
  await fs.writeFile(path.join(f.folder, '.git/hooks/pre-commit'), `#!/bin/sh\nexec ${quote(process.execPath)} ${quote(helper)}\n`, { mode: 0o755 })
  const child = spawn(process.env.GITVIZ_HOST_EXECUTABLE || process.execPath, [path.join(__dirname, 'helpers/operation-host-parent.cjs')], {
    windowsHide: true, stdio: ['ignore', 'ignore', 'ignore', 'ipc'], env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
  })
  child.send({ root: f.folder, oid: f.first })
  try {
    await waitFor(() => fs.stat(path.join(f.folder, '.git/lifecycle-entered')).then(() => true, () => false), 'real hook entered')
    const running = (await f.git.operations()).records[0]
    assert.equal(running.state, 'running')
    const workerPid = Number(await fs.readFile(path.join(f.folder, '.git/gitviz-operation.lock'), 'utf8'))
    assert.notEqual(workerPid, child.pid); assert.notEqual(workerPid, process.pid)
    const exited = once(child, 'exit')
    if (mode === 'close') child.send({ stop: true }); else child.kill()
    await exited
    process.kill(workerPid, 0)
    await assert.rejects(f.git.createBranch(f.first, 'blocked-during-worker', f.expected), /另一个 Gitviz/)
    await fs.writeFile(path.join(f.folder, '.git/lifecycle-release'), '')
    await waitFor(async () => (await f.git.operations()).records[0]?.state === 'completed', 'worker journal completion')
    await waitFor(() => fs.stat(path.join(f.folder, '.git/gitviz-operation.lock')).then(() => false, () => true), 'worker lock released')
    assert.equal((await f.git.command(['rev-parse', 'HEAD^'])).trim(), f.expected.head)
    assert.equal((await f.git.command(['rev-parse', 'HEAD^{tree}'])).trim(), (await f.git.command(['rev-parse', `${f.first}^{tree}`])).trim())
    assert.equal(await f.git.status(), '')
    await waitFor(() => { try { process.kill(workerPid, 0); return false } catch (error) { if (error.code === 'ESRCH') return true; throw error } }, 'worker self exit')
  } finally {
    await fs.writeFile(path.join(f.folder, '.git/lifecycle-release'), '')
    if (child.exitCode === null && child.signalCode === null) child.kill()
  }
})

test('closed host cancels requests before handing them to a worker', async () => {
  const f = await fixture(), host = new OperationHost()
  const plan = await f.git.prepareAction('createBranch', { oid: f.first, name: 'never-created', expected: f.expected })
  host.close()
  assert.throws(() => host.execute(f.git, plan), /已停用/)
  assert.equal((await f.git.operations()).records.length, 0)
  await assert.rejects(f.git.command(['show-ref', '--verify', 'refs/heads/never-created']))
  assert.equal(await f.git.head(), f.expected.head)
})

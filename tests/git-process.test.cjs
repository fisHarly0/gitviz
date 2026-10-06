const test = require('node:test'), assert = require('node:assert/strict')
const fs = require('node:fs/promises'), path = require('node:path'), os = require('node:os')
const { setTimeout: delay } = require('node:timers/promises')
const serviceDirectory = path.resolve(process.env.GITVIZ_GIT_SERVICE_DIR || path.join(__dirname, '../extensions/vscode'))
const { runGitProcess, terminateTree } = require(path.join(serviceDirectory, 'git-process.cjs'))
const { GitService } = require(path.join(serviceDirectory, 'git-service.cjs'))
const root = process.env.GITVIZ_TEST_ROOT || (process.platform === 'win32' ? 'F:/Codex/work/gitviz-product/process-tests' : path.join(os.tmpdir(), 'gitviz-process-tests'))
const quote = value => "'" + value.replaceAll('\\', '/').replaceAll("'", "'\\''") + "'"
const hookScript = path.join(__dirname, 'helpers/slow-git-hook.cjs')
const alive = pid => { try { process.kill(pid, 0); return true } catch (error) { if (error.code === 'ESRCH') return false; throw error } }

test('missing executable retains the start cause and gives actionable Git setup guidance', async () => {
  await fs.mkdir(root, { recursive: true })
  const folder = await fs.mkdtemp(path.join(root, 'missing-git-'))
  await assert.rejects(runGitProcess(path.join(folder, 'no-such-git'), ['--version'], { cwd: folder }), error => {
    assert.equal(error.code, 'GIT_START'); assert.equal(error.cause.code, 'ENOENT')
    assert.match(error.message, /git --version/); assert.match(error.message, /仓库目录/)
    assert.match(error.message, /PATH/); assert.match(error.message, /重新打开/)
    return true
  })
  assert.match(await runGitProcess('git', ['--version'], { cwd: folder }), /^git version /)
})

async function cleanupKnownFixture(f, owned) {
  if (!owned) return
  try { await terminateTree(owned) }
  catch (error) {
    // taskkill can kill the hook first, then find Git already exited while
    // walking upwards. This exception is only for this known test fixture,
    // never for production cleanup or the uncertainty/lock assertions below.
    if (process.platform !== 'win32' || error.code !== 128) throw error
    assert.equal(alive(owned.pid), false, 'fixture Git still runs after taskkill failure')
    for (const name of ['parent', 'child']) {
      const pid = Number(await fs.readFile(path.join(f.folder, `.git/process-${name}.pid`), 'utf8'))
      assert.equal(alive(pid), false, `fixture hook ${name} still runs after taskkill failure`)
      const beat = path.join(f.folder, `.git/process-${name}.heartbeat`), before = await fs.readFile(beat, 'utf8')
      await delay(300); assert.equal(await fs.readFile(beat, 'utf8'), before)
    }
  }
}

async function fixture() {
  await fs.mkdir(root, { recursive: true })
  const folder = await fs.mkdtemp(path.join(root, 'process-')), git = new GitService(folder)
  await git.command(['init', '-b', 'main'])
  for (const [key, value] of [['user.name', 'Fixture Author'], ['user.email', 'fixture@example.invalid'], ['commit.gpgsign', 'false'], ['core.autocrlf', 'false']]) await git.command(['config', key, value])
  await fs.writeFile(path.join(folder, 'file.txt'), 'first\n')
  await git.command(['add', '.']); await git.command(['commit', '-m', 'first'])
  const first = await git.head()
  await fs.writeFile(path.join(folder, 'file.txt'), 'second\n')
  await git.command(['add', '.']); await git.command(['commit', '-m', 'second'])
  const expected = { head: await git.head(), branch: 'main' }
  const hook = path.join(folder, '.git/hooks/pre-commit')
  await fs.writeFile(hook, `#!/bin/sh\nexec ${quote(process.execPath)} ${quote(hookScript)} parent\n`, { mode: 0o755 })
  return { folder, git, first, expected, hook }
}

test('output, binary data, nonzero exit and missing executable are classified without truncation', async () => {
  assert.equal(await runGitProcess(process.execPath, ['-e', 'process.stdout.write("中文")']), '中文')
  assert.deepEqual(await runGitProcess(process.execPath, ['-e', 'process.stdout.write(Buffer.from([0,255,1]))'], { encoding: 'buffer' }), Buffer.from([0, 255, 1]))
  await assert.rejects(runGitProcess(process.execPath, ['-e', 'process.stderr.write("hook refused");process.exit(7)']), error => error.code === 'GIT_EXIT' && /hook refused/.test(error.message))
  await assert.rejects(runGitProcess(path.join(root, 'no-such-git-executable'), []), error => error.code === 'GIT_START')
  await assert.rejects(runGitProcess(process.execPath, ['-e', 'process.stdout.write("x".repeat(100000));setInterval(()=>{},1000)'], { maxBuffer: 1000 }), error => error.code === 'GIT_OUTPUT_LIMIT')
})

for (const reportFailure of [false, true]) test(`timed-out real restore preserves recovery (${reportFailure ? 'cleanup report failure' : 'native cleanup'})`, async t => {
  const f = await fixture(), original = f.git.command.bind(f.git)
  let commitFailure, owned
  f.git.command = async (args, options) => {
    try { return await original(args, args[0] === 'commit' ? {
      ...options, timeout: 5000,
      terminate: async child => {
        owned = child
        try { await terminateTree(child) }
        catch (error) {
          if (!reportFailure || process.platform !== 'win32' || error.code !== 128) throw error
        }
        if (reportFailure) throw Object.assign(new Error('injected failure to confirm cleanup'), { code: 'TEST_CLEANUP_FAILURE' })
      },
    } : options) }
    catch (error) { if (args[0] === 'commit') commitFailure = error; throw error }
  }
  try {
    await assert.rejects(f.git.restore(f.first, f.expected), /超过 5 秒/)
    const uncertain = commitFailure?.code === 'GIT_PROCESS_UNCERTAIN'
    if (reportFailure) {
      assert.equal(uncertain, true)
      assert.equal(commitFailure.cleanupError?.code, 'TEST_CLEANUP_FAILURE')
    } else if (uncertain) {
      assert.equal(process.platform, 'win32')
      assert.equal(commitFailure.cleanupError?.code, 128, commitFailure.cleanupError?.stack)
    } else assert.equal(commitFailure?.code, 'GIT_TIMEOUT', commitFailure?.stack)
    t.diagnostic(`cleanup outcome: ${commitFailure.code}; ${commitFailure.cleanupError?.code ?? 'confirmed'}`)
    assert.ok(owned?.pid)
    assert.equal(alive(owned.pid), false, 'fixture Git still runs')
    for (const name of ['parent', 'child']) {
      const pid = Number(await fs.readFile(path.join(f.folder, `.git/process-${name}.pid`), 'utf8'))
      assert.equal(alive(pid), false, `hook ${name} is still alive`)
      const beat = path.join(f.folder, `.git/process-${name}.heartbeat`), before = await fs.readFile(beat, 'utf8')
      await delay(300); assert.equal(await fs.readFile(beat, 'utf8'), before)
    }
    assert.equal(await f.git.head(), f.expected.head)
    assert.equal(await fs.readFile(path.join(f.folder, 'file.txt'), 'utf8'), 'first\n')
    const record = (await f.git.operations()).records[0]
    assert.equal(record.state, 'failed'); assert.ok(record.checkpoint.tree)
    assert.equal((await f.git.command(['rev-parse', record.backup])).trim(), f.expected.head)
    assert.equal((await f.git.command(['write-tree'])).trim(), record.checkpoint.tree)
    const lock = path.join(f.folder, '.git/gitviz-operation.lock')
    let recovery = f.git
    if (uncertain) {
      assert.equal(f.git.processUncertain, true)
      const lockBefore = await fs.readFile(lock, 'utf8')
      const refsBefore = await f.git.command(['show-ref'])
      const recordsBefore = await f.git.operations()
      await assert.rejects(f.git.createBranch(f.first, 'unsafe-retry', f.expected), /不能继续写入/)
      recovery = new GitService(f.folder)
      await assert.rejects(recovery.createBranch(f.first, 'unsafe-other-host', f.expected), /另一个 Gitviz 写操作正在进行/)
      assert.equal(await fs.readFile(lock, 'utf8'), lockBefore)
      assert.equal(await f.git.command(['show-ref']), refsBefore)
      assert.deepEqual(await f.git.operations(), recordsBefore)
      assert.equal(await f.git.head(), f.expected.head)
      assert.equal((await f.git.command(['write-tree'])).trim(), record.checkpoint.tree)
      assert.equal(await fs.readFile(path.join(f.folder, 'file.txt'), 'utf8'), 'first\n')
      // Only this fixture's known process tree has been proved stopped above.
      // Simulate documented manual recovery; production must never auto-unlock.
      await fs.unlink(lock)
    } else {
      assert.notEqual(f.git.processUncertain, true)
      await assert.rejects(fs.stat(lock), { code: 'ENOENT' })
    }
    await fs.unlink(f.hook)
    await recovery.resumeCommit(record.id, f.expected, record.checkpoint)
    assert.equal(await recovery.status(), '')
    assert.equal((await recovery.command(['rev-parse', 'HEAD^'])).trim(), f.expected.head)
    assert.equal((await recovery.command(['rev-parse', 'HEAD^{tree}'])).trim(), record.checkpoint.tree)
    assert.equal((await recovery.command(['rev-parse', record.backup])).trim(), f.expected.head)
    assert.equal((await recovery.operations()).records[0].state, 'completed')
  } finally {
    // Cleanup is limited to PIDs emitted by this fixture if an assertion fails.
    for (const name of ['parent', 'child']) {
      const pid = Number(await fs.readFile(path.join(f.folder, `.git/process-${name}.pid`), 'utf8').catch(() => '0'))
      if (pid && alive(pid)) await terminateTree({ pid, exitCode: null, signalCode: null }).catch(() => {})
    }
  }
})

test('unconfirmed cleanup keeps the repository lock and blocks further writes', async () => {
  const f = await fixture(), original = f.git.command.bind(f.git)
  let owned
  f.git.command = (args, options) => original(args, args[0] === 'commit' ? {
    ...options, timeout: 3000, cleanupTimeout: 200,
    terminate: async child => { owned = child; throw new Error('injected termination failure') },
  } : options)
  try {
    await assert.rejects(f.git.restore(f.first, f.expected), /无法确认 Git/)
    assert.equal(f.git.processUncertain, true)
    assert.ok(await fs.stat(path.join(f.folder, '.git/gitviz-operation.lock')))
    await assert.rejects(f.git.createBranch(f.first, 'unsafe-retry', f.expected), /不能继续写入/)
    const record = (await f.git.operations()).records[0]
    assert.equal(record.state, 'failed'); assert.match(record.error, /无法确认 Git/)
  } finally { await cleanupKnownFixture(f, owned) }
})

test('Windows exited parent with an inherited pipe returns bounded uncertainty instead of hanging', { skip: process.platform !== 'win32' }, async () => {
  const f = await fixture(), started = Date.now()
  try {
    await assert.rejects(runGitProcess('git', ['-c', `alias.hold=!node ${quote(hookScript)} pipe-child &`, 'hold'], { cwd: f.folder, timeout: 1500, cleanupTimeout: 500 }), error => error.code === 'GIT_PROCESS_UNCERTAIN')
    assert.ok(Date.now() - started < 8000)
    const pid = Number(await fs.readFile(path.join(f.folder, '.git/process-pipe-child.pid'), 'utf8'))
    assert.equal(alive(pid), true, 'The runner must report uncertainty, not claim the orphan stopped')
  } finally {
    const pid = Number(await fs.readFile(path.join(f.folder, '.git/process-pipe-child.pid'), 'utf8').catch(() => '0'))
    if (pid && alive(pid)) await terminateTree({ pid, exitCode: null, signalCode: null })
  }
})

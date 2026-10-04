const fs = require('node:fs/promises')
const path = require('node:path')
const os = require('node:os')
const { spawn } = require('node:child_process')
const { GitService } = require('../../extensions/vscode/git-service.cjs')
const scratch = process.env.GITVIZ_LARGE_TEST_ROOT || (process.platform === 'win32' ? 'F:/Codex/work/gitviz-large-history' : path.join(os.tmpdir(), 'gitviz-large-history'))

async function largeRepo(count) {
  await fs.mkdir(scratch, { recursive: true })
  const root = await fs.mkdtemp(path.join(scratch, `repo-${count}-`)), git = new GitService(root)
  await git.command(['init', '-b', 'main'])
  await git.command(['config', 'user.name', 'Gitviz Test Fixture'])
  await git.command(['config', 'user.email', 'fixture@example.invalid'])
  await git.command(['config', 'commit.gpgsign', 'false'])
  await git.command(['config', 'core.autocrlf', 'false'])
  const lines = []
  let main = 0, pending = null
  for (let i = 1; i <= count; i++) {
    const side = i % 50 === 0
    const branch = side ? `refs/heads/experiment-${i % 500}` : 'refs/heads/main'
    const message = `${i === 1 ? 'root-marker · ' : ''}save ${String(i).padStart(5, '0')}`
    lines.push(`commit ${branch}\nmark :${i}\nauthor Fixture Author <fixture@example.invalid> ${1700000000 + (i % 71)} +0000\ncommitter Fixture Author <fixture@example.invalid> ${1700000000 + i} +0000\ndata ${Buffer.byteLength(message)}\n${message}\n`)
    if (i > 1) lines.push(`from :${side ? Math.max(1, main - 9) : main}\n`)
    if (!side && pending && i % 50 === 3) { lines.push(`merge :${pending}\n`); pending = null }
    const content = `save ${i}\n`
    lines.push(`M 100644 inline counter.txt\ndata ${Buffer.byteLength(content)}\n${content}\n`)
    if (side) pending = i; else main = i
  }
  await new Promise((resolve, reject) => {
    const child = spawn('git', ['fast-import', '--quiet'], { cwd: root, windowsHide: true, stdio: ['pipe', 'ignore', 'pipe'] })
    let error = ''
    child.stderr.on('data', value => { error += value })
    child.on('error', reject); child.on('close', code => code ? reject(new Error(error)) : resolve())
    child.stdin.on('error', reject); child.stdin.end(lines.join(''))
  })
  await git.command(['restore', '--source=HEAD', '--staged', '--worktree', '--', '.'])
  const first = (await git.command(['rev-list', '--max-parents=0', '--all'])).trim()
  await git.command(['tag', 'origin-point', first])
  return { root, git, first, count }
}
module.exports = { largeRepo, scratch }

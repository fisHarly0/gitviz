const { execFile, spawn } = require('node:child_process')
const { promisify } = require('node:util')
const fs = require('node:fs/promises')
const path = require('node:path')
const { randomUUID, createHash } = require('node:crypto')
const run = promisify(execFile)
const OID = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/

class GitService {
  constructor(root, git = 'git') { this.root = root; this.git = git; this.busy = false }

  async command(args, options = {}) {
    try {
      const result = await run(this.git, ['--no-optional-locks', '-c', 'core.quotepath=false', ...args], {
        cwd: this.root, windowsHide: true, timeout: 30000, maxBuffer: 32 * 1024 * 1024,
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_LITERAL_PATHSPECS: '1' }, ...options,
      })
      return result.stdout
    } catch (error) {
      throw new Error(String(error.stderr || error.message).trim(), { cause: error })
    }
  }

  static async open(folder, git) {
    const service = new GitService(folder, git)
    service.root = (await service.command(['rev-parse', '--show-toplevel'])).trim()
    if ((await service.command(['rev-parse', '--is-bare-repository'])).trim() === 'true') throw new Error('请打开有工作目录的仓库。')
    return service
  }

  async head() { return (await this.command(['rev-parse', '--verify', 'HEAD'])).trim() }
  async branch() { return (await this.command(['symbolic-ref', '--quiet', '--short', 'HEAD']).catch(() => '')).trim() }
  async status() { return this.command(['status', '--porcelain=v1', '-z', '--untracked-files=all']) }
  async assertOid(oid) {
    if (typeof oid !== 'string' || !OID.test(oid)) throw new Error('无效的提交编号。请刷新版本树后重试。')
    if ((await this.command(['cat-file', '-t', oid])).trim() !== 'commit') throw new Error('节点不是 Git 提交。')
    return oid
  }

  async historyState() {
    const refs = await this.command(['for-each-ref', '--format=%(refname)%00%(objectname)%00%(*objectname)', 'refs/heads', 'refs/remotes', 'refs/tags'])
    const branches = [], tags = []
    for (const line of refs.trim().split('\n').filter(Boolean)) {
      const [ref, oid, peeled] = line.split('\0')
      if (ref.startsWith('refs/tags/')) tags.push({ name: ref.slice(10), oid: peeled || oid })
      else if (!ref.endsWith('/HEAD')) branches.push({ name: ref.replace(/^refs\/(heads|remotes)\//, ''), oid, remote: ref.startsWith('refs/remotes/') })
    }
    const head = await this.head().catch(() => null)
    const branch = await this.branch()
    const shallowPath = (await this.command(['rev-parse', '--git-path', 'shallow'])).trim()
    const shallow = await fs.readFile(path.resolve(this.root, shallowPath), 'utf8').catch(error => { if (error.code === 'ENOENT') return ''; throw error })
    const revision = createHash('sha256').update(this.root + '\0' + refs + '\0' + head + '\0' + branch + '\0' + shallow).digest('hex')
    return { branches, tags, head, branch, revision, shallow: Boolean(shallow) }
  }

  historyArgs(state) { return ['--topo-order', '--branches', '--tags', '--remotes', ...(state.head ? ['HEAD'] : [])] }

  parseHistory(log) {
    const values = log.split('\0'), commits = []
    for (let i = 0; i + 4 < values.length; i += 5) {
      const oid = values[i].trim()
      if (OID.test(oid)) commits.push({ oid, parents: values[i + 1].split(' ').filter(Boolean), author: values[i + 2], timestamp: Number(values[i + 3]), message: values[i + 4] })
    }
    return commits
  }

  async assertHistory(revision) {
    const state = await this.historyState()
    if (state.revision !== revision) throw new Error('历史已变化，请刷新版本树后继续。')
    return state
  }

  async historyPage({ cursor, limit = 300 } = {}) {
    if (!cursor || typeof cursor.revision !== 'string' || !Number.isSafeInteger(cursor.offset) || cursor.offset < 0) throw new Error('历史分页已失效，请刷新版本树。')
    const state = await this.assertHistory(cursor.revision)
    const count = Math.min(2000, Math.max(20, Math.floor(Number(limit) || 300)))
    const log = await this.command(['log', ...this.historyArgs(state), `--skip=${cursor.offset}`, `--max-count=${count + 1}`, '-z', '--format=%H%x00%P%x00%an%x00%at%x00%s', '--'])
    const commits = this.parseHistory(log)
    await this.assertHistory(state.revision)
    return { commits: commits.slice(0, count), revision: state.revision, nextCursor: commits.length > count ? { revision: state.revision, offset: cursor.offset + count } : null }
  }

  async snapshot(limit = 300) {
    const state = await this.historyState()
    const { head, branch, branches, tags } = state
    const status = await this.status()
    const count = Math.min(2000, Math.max(20, Math.floor(Number(limit) || 300)))
    const log = head || branches.length || tags.length
      ? await this.command(['log', '--topo-order', '--branches', '--tags', '--remotes', ...(head ? ['HEAD'] : []), `--max-count=${count + 1}`, '-z', '--format=%H%x00%P%x00%an%x00%at%x00%s', '--']) : ''
    const commits = this.parseHistory(log)
    const visible = commits.slice(0, count)
    const headPinned = Boolean(head && !visible.some(commit => commit.oid === head))
    if (headPinned) {
      const values = (await this.command(['log', '-1', '-z', '--format=%H%x00%P%x00%an%x00%at%x00%s', head, '--'])).split('\0')
      if (visible.length >= count) visible.pop()
      visible.push({ oid: values[0].trim(), parents: values[1].split(' ').filter(Boolean), author: values[2], timestamp: Number(values[3]), message: values[4], outsideWindow: true })
    }
    const offset = headPinned && commits.length >= count ? count - 1 : Math.min(count, commits.length)
    const nextCursor = commits.length > offset ? { revision: state.revision, offset } : null
    const total = head || branches.length || tags.length ? Number((await this.command(['rev-list', '--count', ...this.historyArgs(state)])).trim()) : 0
    await this.assertHistory(state.revision)
    return { repo: this.root, name: path.basename(this.root), head, branch, dirty: Boolean(status), branches, tags, commits: visible, truncated: Boolean(nextCursor), headPinned, limit: count, revision: state.revision, nextCursor, total, shallow: state.shallow }
  }

  async searchHistory({ query, revision, cursor, limit = 50 } = {}) {
    if (typeof query !== 'string' || !query.trim() || query.length > 256) throw new Error('请输入 1–256 个字符搜索历史。')
    const state = await this.assertHistory(revision)
    const skip = cursor?.offset || 0, count = Math.min(100, Math.max(1, Math.floor(Number(limit) || 50)))
    if (!Number.isSafeInteger(skip) || skip < 0 || (cursor && (cursor.revision !== revision || cursor.query !== query))) throw new Error('搜索分页已失效。')
    const needle = query.trim().toLowerCase(), refs = new Map()
    for (const ref of [...state.branches, ...state.tags]) refs.set(ref.oid, `${refs.get(ref.oid) || ''} ${ref.name}`)
    const commits = await new Promise((resolve, reject) => {
      if (!state.head && !state.branches.length && !state.tags.length) { resolve([]); return }
      const child = spawn(this.git, ['--no-optional-locks', 'log', ...this.historyArgs(state), '-z', '--format=%H%x00%P%x00%an%x00%at%x00%s', '--'], { cwd: this.root, windowsHide: true, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } })
      let buffer = '', fields = [], matched = 0, stopped = false, stderr = ''
      const found = []
      const timer = setTimeout(() => { child.kill(); reject(new Error('搜索耗时过长，请缩小查询或稍后重试。')) }, 30000)
      child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8')
      child.stderr.on('data', data => { stderr = (stderr + data).slice(-4096) })
      child.stdout.on('data', data => {
        if (stopped) return
        buffer += data
        let end
        while ((end = buffer.indexOf('\0')) >= 0) {
          fields.push(buffer.slice(0, end)); buffer = buffer.slice(end + 1)
          if (fields.length !== 5) continue
          const [commit] = this.parseHistory(fields.join('\0') + '\0'); fields = []
          if (commit && `${commit.oid} ${commit.author} ${commit.message} ${refs.get(commit.oid) || ''}`.toLowerCase().includes(needle) && matched++ >= skip) found.push(commit)
          if (found.length > count) { stopped = true; child.kill(); break }
        }
      })
      child.on('error', error => { clearTimeout(timer); reject(error) })
      child.on('close', code => { clearTimeout(timer); if (code && !stopped) reject(new Error(stderr || '读取历史失败。')); else resolve(found) })
    })
    await this.assertHistory(revision)
    return { commits: commits.slice(0, count), revision, nextCursor: commits.length > count ? { revision, query, offset: skip + count } : null }
  }

  async files(from, to) {
    await this.assertOid(to)
    if (from) await this.assertOid(from)
    const args = from ? ['diff', '--name-status', '-z', '-M', from, to, '--'] : ['diff-tree', '--root', '--no-commit-id', '--name-status', '-r', '-z', '-M', to, '--']
    const tokens = (await this.command(args)).split('\0').filter(Boolean), files = []
    for (let i = 0; i < tokens.length;) {
      const status = tokens[i++], oldPath = tokens[i++]
      const name = /^[RC]/.test(status) ? tokens[i++] : oldPath
      if (name) files.push({ status: status[0], path: name, oldPath })
    }
    return files
  }

  async detail(oid) {
    await this.assertOid(oid)
    const values = (await this.command(['show', '-s', '--format=%H%x00%P%x00%an%x00%at%x00%B', oid, '--'])).split('\0')
    const parents = values[1].split(' ').filter(Boolean)
    return { oid, parents, author: values[2], timestamp: Number(values[3]), message: values[4].trim(), from: parents[0] || null, to: oid, files: await this.files(parents[0], oid) }
  }

  async readFile(oid, name) {
    if (!oid) return ''
    await this.assertOid(oid)
    if (typeof name !== 'string' || name.includes('\0') || name.startsWith('/') || name.split('/').includes('..')) throw new Error('无效的文件路径。')
    const entry = await this.command(['ls-tree', '-z', oid, '--', name])
    if (!entry) return ''
    const match = entry.match(/^\d+ blob ([a-f0-9]+)\t/)
    if (!match) return '[此项不是普通文件；子模块内容不在当前仓库内。]'
    const size = Number((await this.command(['cat-file', '-s', match[1]])).trim())
    if (size > 2 * 1024 * 1024) return `[文件大小 ${size} 字节，超过 2 MB 的内联比较上限。]`
    const data = await this.command(['cat-file', 'blob', match[1]], { encoding: 'buffer' })
    return data.includes(0) ? '[二进制文件，请使用适合该格式的比较工具。]' : data.toString('utf8')
  }

  async guard(expected, clean = true) {
    if (!expected || !OID.test(expected.head || '')) throw new Error('缺少当前工作区快照。请刷新。')
    if (await this.head() !== expected.head || await this.branch() !== expected.branch) throw new Error('当前分支或 HEAD 已变化。请刷新后重新选择。')
    if (clean && await this.status()) throw new Error('工作区有未提交或未跟踪文件。请先提交或暂存到 stash，再执行此操作。')
    for (const marker of ['MERGE_HEAD', 'CHERRY_PICK_HEAD', 'REVERT_HEAD', 'rebase-merge', 'rebase-apply', 'sequencer']) {
      const file = (await this.command(['rev-parse', '--git-path', marker])).trim()
      if (await fs.stat(path.resolve(this.root, file)).catch(() => null)) throw new Error('仓库正在合并、变基或挑选提交。请先完成或中止该操作。')
    }
  }

  async exclusive(action) {
    if (this.busy) throw new Error('另一个 Git 操作正在进行，请稍后重试。')
    this.busy = true
    try { return await action() } finally { this.busy = false }
  }

  async validateBranch(name) {
    if (typeof name !== 'string' || !name || name.startsWith('-') || name.length > 150) throw new Error('请输入有效的分支名。')
    await this.command(['check-ref-format', '--branch', name])
    // check-ref-format expands @{-1}; only accept literal names.
    if (name.includes('@{')) throw new Error('分支名不能包含引用表达式。')
  }

  async createBranch(oid, name, expected) {
    return this.exclusive(async () => {
      await this.assertOid(oid); await this.validateBranch(name); await this.guard(expected, false)
      await this.command(['branch', '--', name, oid])
      return { message: `已创建分支 ${name}；当前工作区保持不变。` }
    })
  }

  async switchBranch(name, expected) {
    return this.exclusive(async () => {
      await this.validateBranch(name); await this.guard(expected)
      await this.command(['show-ref', '--verify', `refs/heads/${name}`])
      await this.command(['switch', '--no-guess', '--no-overwrite-ignore', '--', name])
      return { message: `已切换到 ${name}，工作文件已同步。` }
    })
  }

  async createWorktree(oid, name, parentDirectory, expected) {
    return this.exclusive(async () => {
      await this.assertOid(oid); await this.validateBranch(name); await this.guard(expected, false)
      const parent = path.resolve(parentDirectory)
      await fs.mkdir(parent, { recursive: true })
      const folder = path.join(parent, `${path.basename(this.root)}-${oid.slice(0, 7)}-${randomUUID().slice(0, 8)}`)
      await this.command(['worktree', 'add', '-b', name, '--', folder, oid])
      return { message: `已创建独立试验线 ${name}，原工作区未切换。`, worktree: folder }
    })
  }

  async restore(oid, expected) {
    return this.exclusive(async () => {
      await this.assertOid(oid); await this.guard(expected)
      if (!expected.branch) throw new Error('当前处于游离 HEAD。请先创建并切换到分支。')
      const sparse = (await this.command(['config', '--bool', 'core.sparseCheckout']).catch(() => '')).trim()
      if (sparse === 'true') throw new Error('稀疏检出仓库暂不支持整树恢复。')
      const targetTree = await this.command(['ls-tree', '-r', '-z', oid])
      const currentTree = await this.command(['ls-tree', '-r', '-z', expected.head])
      if (/(^|\0)160000 /.test(targetTree + '\0' + currentTree)) throw new Error('包含子模块的版本暂不支持整树恢复。')
      const changes = await this.files(expected.head, oid)
      if (!changes.length) throw new Error('这个存档与当前版本的文件内容相同，无需恢复。')
      const ignored = (await this.command(['ls-files', '--others', '--ignored', '--exclude-standard', '-z'])).split('\0').filter(Boolean)
      const targetPaths = targetTree.split('\0').filter(Boolean).map(entry => entry.slice(entry.indexOf('\t') + 1))
      const collision = ignored.find(file => targetPaths.some(target => file === target || file.startsWith(target + '/') || target.startsWith(file + '/')))
      if (collision) throw new Error(`恢复会覆盖被忽略的文件 ${collision}。请先移走该文件。`)
      // Check identity before touching the worktree. Hooks may still fail; keep their output intact.
      await this.command(['var', 'GIT_AUTHOR_IDENT']); await this.command(['var', 'GIT_COMMITTER_IDENT'])
      const backup = `gitviz/backup-${new Date().toISOString().replace(/[-:.TZ]/g, '')}-${randomUUID().slice(0, 6)}`
      await this.guard(expected)
      await this.command(['branch', '--', backup, expected.head])
      try {
        await this.command(['restore', `--source=${oid}`, '--staged', '--worktree', '--', '.'])
        await this.command(['commit', '-m', `Restore snapshot ${oid.slice(0, 7)}\n\nGitviz restore of ${oid}; previous HEAD preserved on ${backup}.`], { timeout: 120000 })
      } catch (error) {
        throw new Error(`恢复未完成：${error.message}\n恢复前版本保存在 ${backup}。已产生的文件/暂存更改会保留，请检查 Git 状态并解决问题后提交；没有自动丢弃文件。`, { cause: error })
      }
      const expectedTree = (await this.command(['rev-parse', `${oid}^{tree}`])).trim()
      const actualTree = (await this.command(['rev-parse', 'HEAD^{tree}'])).trim()
      if (actualTree !== expectedTree) throw new Error(`已创建提交，但提交钩子修改了文件，结果与所选存档不完全相同。请检查差异；恢复前版本保存在 ${backup}。`)
      return { message: `已恢复为新提交，原历史保留在 ${backup}。`, backup, head: await this.head() }
    })
  }
}
module.exports = { GitService }

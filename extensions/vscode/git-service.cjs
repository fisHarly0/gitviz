const { runGitProcess } = require('./git-process.cjs')
const { StringDecoder } = require('node:string_decoder')
const fs = require('node:fs/promises')
const path = require('node:path')
const { randomUUID, createHash } = require('node:crypto')
const { OperationJournal } = require('./operation-journal.cjs')
const OID = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/

class GitService {
  constructor(root, git = 'git') { this.root = root; this.git = git; this.busy = false; this.journal = new OperationJournal(this) }

  async command(args, options = {}) {
    try {
      return await runGitProcess(this.git, ['--no-optional-locks', '-c', 'core.quotepath=false', ...args], {
        cwd: this.root, timeout: 30000, maxBuffer: 32 * 1024 * 1024,
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_LITERAL_PATHSPECS: '1' }, ...options,
      })
    } catch (error) {
      if (error.code === 'GIT_PROCESS_UNCERTAIN') this.processUncertain = true
      throw error
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
  async status() { return this.command(['status', '--porcelain=v1', '-z', '--untracked-files=all', '--ignore-submodules=none']) }
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
    const commits = []
    if (state.head || state.branches.length || state.tags.length) {
      let buffer = '', fields = [], matched = 0
      const decoder = new StringDecoder('utf8')
      await this.command(['log', ...this.historyArgs(state), '-z', '--format=%H%x00%P%x00%an%x00%at%x00%s', '--'], { onStdout: data => {
        buffer += decoder.write(data)
        if (buffer.length > 2 * 1024 * 1024) throw new Error('单条历史信息过大，无法继续搜索。')
        let end
        while ((end = buffer.indexOf('\0')) >= 0) {
          fields.push(buffer.slice(0, end)); buffer = buffer.slice(end + 1)
          if (fields.length !== 5) continue
          const [commit] = this.parseHistory(fields.join('\0') + '\0'); fields = []
          if (commit && `${commit.oid} ${commit.author} ${commit.message} ${refs.get(commit.oid) || ''}`.toLowerCase().includes(needle) && matched++ >= skip) commits.push(commit)
          if (commits.length > count) return false
        }
      } })
    }
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
    if (expected.repo && expected.repo !== this.root) throw new Error('仓库已变化，请重新预览操作。')
    if (await this.head() !== expected.head || await this.branch() !== expected.branch) throw new Error('当前分支或 HEAD 已变化。请刷新后重新选择。')
    if (expected.revision && (await this.historyState()).revision !== expected.revision) throw new Error('历史已变化，请重新预览操作。')
    if (clean && await this.status()) throw new Error('工作区有未提交或未跟踪文件。请先提交或暂存到 stash，再执行此操作。')
    for (const marker of ['MERGE_HEAD', 'CHERRY_PICK_HEAD', 'REVERT_HEAD', 'rebase-merge', 'rebase-apply', 'sequencer']) {
      const file = (await this.command(['rev-parse', '--git-path', marker])).trim()
      if (await fs.stat(path.resolve(this.root, file)).catch(error => { if (error.code === 'ENOENT') return null; throw error })) throw new Error('仓库正在合并、变基或挑选提交。请先完成或中止该操作。')
    }
  }

  async exclusive(action) {
    if (this.processUncertain) throw new Error('上次 Git 进程状态尚未确认，本会话不能继续写入。请先检查进程、Git 状态和保留的操作锁。')
    if (this.busy) throw new Error('另一个 Git 操作正在进行，请稍后重试。')
    this.busy = true
    let lock, file
    try {
      file = path.resolve(this.root, (await this.command(['rev-parse', '--git-path', 'gitviz-operation.lock'])).trim())
      lock = await fs.open(file, 'wx').catch(error => { if (error.code === 'EEXIST') throw new Error('另一个 Gitviz 写操作正在进行；若上次异常退出，请先检查 Git 状态与操作记录。'); throw error })
      await lock.writeFile(String(process.pid))
      return await action()
    } finally { try { if (lock) { await lock.close(); if (!this.processUncertain) await fs.unlink(file) } } finally { this.busy = false } }
  }

  async operations(params) { return this.journal.list(params) }

  async recorded(action, params, expected, runAction, previous) {
    const record = previous || await this.journal.begin(action, params, expected)
    if (previous) { record.state = 'running'; record.attempts += 1; record.updatedAt = Date.now(); await this.journal.save(record) }
    let result
    try { result = await runAction(record) }
    catch (error) {
      let recordError = ''
      try { await this.journal.finish(record, {}, error) } catch (failure) { recordError = `\n记录更新失败：${failure.message}` }
      throw new Error(`${error.message}\n操作记录：${record.id}${recordError}`, { cause: error })
    }
    try { await this.journal.finish(record, result) }
    catch (error) { throw new Error(`Git 操作已执行，但记录更新失败：${error.message}。请刷新检查实际状态。`, { cause: error }) }
    return { ...result, head: record.result.head, branch: record.result.branch, operationId: record.id }
  }

  async pendingCommit(id, expected) {
    const record = await this.journal.read(id)
    if (record.state !== 'failed' || !['restore', 'saveEdit'].includes(record.action) || !record.checkpoint) throw new Error('该记录没有可继续的失败提交。')
    await this.checkCheckpoint(record, expected)
    return record
  }

  async checkCheckpoint(record, expected) {
    if (record.before?.head !== expected?.head || record.before?.branch !== expected?.branch) throw new Error('当前位置与失败操作的起点不同，请检查记录和 Git 状态。')
    await this.guard(expected, false)
    if (!expected.branch) throw new Error('游离 HEAD 不能继续提交。')
    const { tree, message } = record.checkpoint
    if (!OID.test(tree || '') || typeof message !== 'string' || !message.trim() || Buffer.byteLength(message) > 2000 || message.includes('\0')) throw new Error('提交检查点无效，请手动检查 Git 状态。')
    if ((await this.command(['cat-file', '-t', tree])).trim() !== 'tree') throw new Error('提交检查点不是 Git tree。')
    if (record.backup) {
      await this.validateBranch(record.backup)
      if ((await this.command(['rev-parse', '--verify', `refs/heads/${record.backup}`])).trim() !== expected.head) throw new Error('备份引用已变化，请先检查恢复前的位置。')
    }
    await this.fullCheckout()
    await this.command(['diff', '--cached', '--quiet', '--no-ext-diff', '--no-textconv', '--ignore-submodules=none', tree, '--']).catch(() => { throw new Error('暂存区与失败时的检查点不同，请先检查差异；不会提交新增改动。') })
    await this.command(['diff', '--quiet', '--no-ext-diff', '--no-textconv', '--ignore-submodules=none', '--']).catch(() => { throw new Error('工作文件在失败后发生变化，请先检查差异；不会自动暂存。') })
    if (await this.command(['ls-files', '--others', '--exclude-standard', '-z'])) throw new Error('存在未跟踪文件，请先处理后再继续提交。')
    await this.command(['var', 'GIT_AUTHOR_IDENT']); await this.command(['var', 'GIT_COMMITTER_IDENT'])
  }

  async resumeCommit(id, expected, checkpoint) {
    return this.exclusive(async () => {
      const record = await this.pendingCommit(id, expected)
      if (checkpoint && (record.checkpoint.tree !== checkpoint.tree || record.checkpoint.message !== checkpoint.message)) throw new Error('失败检查点已变化，请重新预览。')
      return this.recorded(record.action, record.params, expected, async () => {
        await this.checkCheckpoint(record, expected)
        await this.command(['commit', '-m', record.checkpoint.message], { timeout: 120000 })
        if ((await this.command(['rev-parse', 'HEAD^{tree}'])).trim() !== record.checkpoint.tree) throw new Error('提交已创建，但钩子改变了结果，请检查新提交与检查点的差异。')
        return { message: '失败操作已继续提交，原备份保留。', backup: record.backup }
      }, record)
    })
  }

  async validateBranch(name) {
    if (typeof name !== 'string' || !name || name.startsWith('-') || name.length > 150) throw new Error('请输入有效的分支名。')
    await this.command(['check-ref-format', '--branch', name])
    // check-ref-format expands @{-1}; only accept literal names.
    if (name.includes('@{')) throw new Error('分支名不能包含引用表达式。')
  }

  async fullCheckout() {
    if ((await this.command(['config', '--bool', '--default=false', '--get', 'core.sparseCheckout'])).trim() === 'true') throw new Error('稀疏检出仓库暂不支持此操作，请先在 Git 中恢复完整检出。')
    const entries = (await this.command(['ls-files', '-v', '-z'])).split('\0')
    if (entries.some(entry => /^[a-zS] /.test(entry))) throw new Error('暂存区包含 skip-worktree 或 assume-unchanged 标记，可能隐藏文件改动。请先在 Git 中检查并处理这些标记。')
  }

  async checkRestore(oid, expected) {
    await this.fullCheckout()
    if (!expected.branch) throw new Error('当前处于游离 HEAD。请先创建并切换到分支。')
    const targetTree = await this.command(['ls-tree', '-r', '-z', oid])
    const currentTree = await this.command(['ls-tree', '-r', '-z', expected.head])
    if (/(^|\0)160000 /.test(targetTree + '\0' + currentTree)) throw new Error('包含子模块的版本暂不支持整树恢复。')
    if (!(await this.files(expected.head, oid)).length) throw new Error('这个存档与当前版本的文件内容相同，无需恢复。')
    const ignored = (await this.command(['ls-files', '--others', '--ignored', '--exclude-standard', '-z'])).split('\0').filter(Boolean)
    const targetPaths = targetTree.split('\0').filter(Boolean).map(entry => entry.slice(entry.indexOf('\t') + 1))
    const collision = ignored.find(file => targetPaths.some(target => file === target || file.startsWith(target + '/') || target.startsWith(file + '/')))
    if (collision) throw new Error(`恢复会覆盖被忽略的文件 ${collision}。请先移走该文件。`)
    await this.command(['var', 'GIT_AUTHOR_IDENT']); await this.command(['var', 'GIT_COMMITTER_IDENT'])
  }

  async prepareAction(action, params = {}) {
    if (!['createBranch', 'switchBranch', 'createWorktree', 'restore', 'resumeCommit'].includes(action)) throw new Error('不支持的 Git 操作。')
    const initial = await this.historyState()
    const expected = { repo: this.root, head: params.expected?.head, branch: params.expected?.branch, revision: initial.revision }
    await this.guard(expected, ['switchBranch', 'restore'].includes(action))
    if (action === 'switchBranch') await this.fullCheckout()
    const operation = { action, expected }
    let target, recovery
    if (action === 'resumeCommit') {
      recovery = await this.pendingCommit(params.id, expected)
      operation.id = params.id; operation.checkpoint = recovery.checkpoint
      target = recovery.params.oid
    } else if (action === 'switchBranch') {
      await this.validateBranch(params.name)
      target = (await this.command(['rev-parse', '--verify', `refs/heads/${params.name}`])).trim()
      await this.assertOid(target)
      operation.name = params.name
    } else {
      target = await this.assertOid(params.oid); operation.oid = target
      if (action !== 'restore') {
        await this.validateBranch(params.name)
        const exists = await this.command(['show-ref', '--verify', `refs/heads/${params.name}`]).then(() => true, () => false)
        if (exists) throw new Error('分支名已存在，请选择其他名称。')
        operation.name = params.name
      }
      if (action === 'createWorktree') {
        if (typeof params.directory !== 'string' || !path.isAbsolute(params.directory)) throw new Error('试验目录必须是绝对路径。')
        operation.directory = path.resolve(params.directory)
      }
    }
    if (action === 'restore') await this.checkRestore(target, expected)
    const files = recovery
      ? (await this.command(['diff', '--cached', '--name-only', '-z', '--'])).split('\0').filter(Boolean)
      : (await this.command(['diff', '--name-only', '-z', expected.head, target, '--'])).split('\0').filter(Boolean)
    if (action === 'restore' && !files.length) throw new Error('这个存档与当前文件内容相同，无需恢复。')
    const copy = {
      createBranch: ['创建分支', '确认创建分支', '增加分支引用，当前工作文件保持不变。'],
      switchBranch: ['切换分支', '切换分支', '切换真实分支，并同步暂存区与工作文件。'],
      createWorktree: ['从此存档创建试验工作区', '确认创建工作区', '新建独立工作目录，原工作目录保持不变。'],
      restore: ['恢复此存档', '备份并恢复为新提交', '先建立备份分支，再恢复文件并创建新提交，后续历史保留。Git 身份、签名和钩子仍生效。'],
      resumeCommit: ['继续失败的提交', '检查并继续提交', '仅提交与失败检查点完全一致的暂存内容；不会自动暂存新的改动。Git 身份、签名和钩子继续生效。'],
    }[action]
    const preview = {
      title: copy[0], confirmLabel: copy[1], impact: copy[2], expected, target,
      branchName: operation.name, directory: operation.directory, files,
      filesLabel: ['createBranch', 'createWorktree'].includes(action) ? '目标存档与当前 HEAD 的差异（原目录不变）' : recovery ? '将提交的暂存文件' : '将更新的文件',
      operationId: recovery?.id, backup: recovery?.backup,
    }
    await this.guard(expected, ['switchBranch', 'restore'].includes(action))
    return { operation, preview, expires: Date.now() + 300000, used: false }
  }

  async executePrepared(plan) {
    if (plan.used || plan.expires <= Date.now()) throw new Error('确认已过期或已使用，请重新预览。')
    plan.used = true
    const op = plan.operation
    if (op.expected.repo !== this.root) throw new Error('仓库已变化，请重新预览操作。')
    if (op.action === 'createBranch') return this.createBranch(op.oid, op.name, op.expected)
    if (op.action === 'switchBranch') return this.switchBranch(op.name, op.expected)
    if (op.action === 'createWorktree') return this.createWorktree(op.oid, op.name, op.directory, op.expected)
    if (op.action === 'resumeCommit') return this.resumeCommit(op.id, op.expected, op.checkpoint)
    if (op.action === 'restore') return this.restore(op.oid, op.expected)
    throw new Error('不支持的 Git 操作。')
  }

  static confirmationText(preview) {
    const lines = [preview.impact, '', `仓库：${preview.expected.repo}`, `实际位置：${preview.expected.branch || '游离 HEAD'} · ${preview.expected.head}`]
    if (preview.target) lines.push(`目标存档：${preview.target}`)
    if (preview.branchName) lines.push(`分支名称：${preview.branchName}`)
    if (preview.directory) lines.push(`试验父目录：${preview.directory}（将在这里新建独立子目录）`)
    if (preview.operationId) lines.push(`继续操作：${preview.operationId}`)
    if (preview.backup) lines.push(`恢复前备份：${preview.backup}`)
    lines.push('', `${preview.filesLabel}（${preview.files.length}）`, ...preview.files.slice(0, 8))
    if (preview.files.length > 8) lines.push(`列表显示前 8 个文件，其余 ${preview.files.length - 8} 个文件未展开。`)
    return lines.join('\n')
  }

  async createBranch(oid, name, expected) {
    return this.exclusive(async () => {
      await this.assertOid(oid); await this.validateBranch(name); await this.guard(expected, false)
      return this.recorded('createBranch', { oid, name }, expected, async () => {
        await this.command(['branch', '--', name, oid])
        return { message: `已创建分支 ${name}；当前工作区保持不变。` }
      })
    })
  }

  async switchBranch(name, expected) {
    return this.exclusive(async () => {
      await this.validateBranch(name); await this.guard(expected)
      await this.fullCheckout()
      await this.command(['show-ref', '--verify', `refs/heads/${name}`])
      return this.recorded('switchBranch', { name }, expected, async () => {
        await this.command(['switch', '--no-guess', '--no-overwrite-ignore', '--', name])
        return { message: `已切换到 ${name}，工作文件已同步。` }
      })
    })
  }

  async createWorktree(oid, name, parentDirectory, expected) {
    return this.exclusive(async () => {
      await this.assertOid(oid); await this.validateBranch(name); await this.guard(expected, false)
      const parent = path.resolve(parentDirectory)
      return this.recorded('createWorktree', { oid, name, directory: parent }, expected, async record => {
        await fs.mkdir(parent, { recursive: true })
        const folder = path.join(parent, `${path.basename(this.root)}-${oid.slice(0, 7)}-${randomUUID().slice(0, 8)}`)
        record.worktree = folder; await this.journal.save(record)
        await this.command(['worktree', 'add', '-b', name, '--', folder, oid])
        return { message: `已创建独立试验线 ${name}，原工作区未切换。`, worktree: folder }
      })
    })
  }

  async restore(oid, expected) {
    return this.exclusive(async () => {
      await this.assertOid(oid); await this.guard(expected)
      await this.checkRestore(oid, expected)
      return this.recorded('restore', { oid }, expected, async record => {
      const backup = `gitviz/backup-${new Date().toISOString().replace(/[-:.TZ]/g, '')}-${randomUUID().slice(0, 6)}`
      record.backup = backup; await this.journal.save(record)
      await this.guard(expected)
      await this.command(['branch', '--', backup, expected.head])
      try {
        await this.command(['restore', `--source=${oid}`, '--staged', '--worktree', '--', '.'])
        const message = `Restore snapshot ${oid.slice(0, 7)}\n\nGitviz restore of ${oid}; previous HEAD preserved on ${backup}.`
        await this.journal.checkpoint(record, message)
        await this.command(['commit', '-m', message], { timeout: 120000 })
      } catch (error) {
        throw new Error(`恢复未完成：${error.message}\n恢复前版本保存在 ${backup}。已产生的文件/暂存更改会保留，请检查 Git 状态并解决问题后提交；没有自动丢弃文件。`, { cause: error })
      }
      const expectedTree = (await this.command(['rev-parse', `${oid}^{tree}`])).trim()
      const actualTree = (await this.command(['rev-parse', 'HEAD^{tree}'])).trim()
      if (actualTree !== expectedTree) throw new Error(`已创建提交，但提交钩子修改了文件，结果与所选存档不完全相同。请检查差异；恢复前版本保存在 ${backup}。`)
      return { message: `已恢复为新提交，原历史保留在 ${backup}。`, backup, head: await this.head() }
      })
    })
  }
}
module.exports = { GitService }

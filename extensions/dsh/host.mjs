import path from 'node:path'
import os from 'node:os'
import { randomUUID } from 'node:crypto'

const writes = new Set(['createBranch', 'switchBranch', 'createWorktree', 'restore', 'resumeCommit'])
const empty = { repo: null, name: '', head: null, branch: '', dirty: false, commits: [], branches: [], tags: [], writable: false }

// No model tool registration: this carrier only serves the local browser panel.
export function createHandler({ GitService, config = {}, port, now = Date.now }) {
  const repositories = new Map(), byRoot = new Map(), tickets = new Map()
  let disposed = false
  const worktrees = config.worktreeDirectory || (process.platform === 'win32' ? 'F:/Codex/worktrees' : path.join(os.homedir(), 'gitviz-worktrees'))
  if (!path.isAbsolute(worktrees)) throw new Error('worktreeDirectory 必须是绝对路径。')
  const open = async folder => {
    if (typeof folder !== 'string' || !path.isAbsolute(folder)) throw new Error('请输入本机 Git 仓库的绝对路径。')
    const service = await GitService.open(folder)
    const canonical = process.platform === 'win32' ? service.root.toLowerCase() : service.root
    let id = byRoot.get(canonical)
    if (!id) { id = randomUUID(); repositories.set(id, service); byRoot.set(canonical, id) }
    return { ...await repositories.get(id).snapshot(), writable: true, repoId: id }
  }
  const dispatch = async body => {
    if (body.method === 'open') return open(body.params?.path)
    if (body.method === 'snapshot' && !body.repoId) return config.initialRepository ? open(config.initialRepository) : empty
    const git = repositories.get(body.repoId)
    if (!git) throw new Error('仓库会话已失效，请重新选择仓库。')
    const p = body.params || {}
    const snapshot = async () => ({ ...await git.snapshot(), writable: true, repoId: body.repoId })
    switch (body.method) {
      case 'snapshot': return snapshot()
      case 'historyPage': return git.historyPage(p)
      case 'searchHistory': return git.searchHistory(p)
      case 'operations': return git.operations(p)
      case 'detail': return git.detail(p.oid)
      case 'compare': return { from: p.from, to: p.to, files: await git.files(p.from, p.to) }
      case 'openDiff': {
        const file = (await git.files(p.from, p.to)).find(file => file.path === p.path)
        if (!file) throw new Error('该文件不在所选差异中。请刷新后重试。')
        const [before, after] = await Promise.all([git.readFile(p.from, file.oldPath), git.readFile(p.to, file.path)])
        return { from: p.from, to: p.to, path: file.path, oldPath: file.oldPath, before, after }
      }
      case 'prepare': {
        if (!writes.has(p.action)) throw new Error('不支持的 Git 操作。')
        if (!p.expected || typeof p.expected.branch !== 'string') throw new Error('缺少预览状态，请刷新后重试。')
        await git.assertOid(p.expected.head)
        if (!['switchBranch', 'resumeCommit'].includes(p.action)) await git.assertOid(p.oid)
        if (!['restore', 'resumeCommit'].includes(p.action)) await git.validateBranch(p.name)
        await git.guard(p.expected, ['restore', 'switchBranch'].includes(p.action))
        const recovery = p.action === 'resumeCommit' ? await git.pendingCommit(p.id, p.expected) : null
        for (const [key, ticket] of tickets) if (ticket.expires <= now()) tickets.delete(key)
        if (tickets.size >= 100) throw new Error('待确认操作过多，请稍后重试。')
        const token = randomUUID()
        const operation = { action: p.action, oid: p.oid, name: p.name, id: p.id, checkpoint: recovery?.checkpoint, expected: { head: p.expected.head, branch: p.expected.branch } }
        tickets.set(token, { repoId: body.repoId, operation, expires: now() + 300000 })
        const descriptions = {
          createBranch: `创建分支 ${p.name}，起点 ${p.oid?.slice(0, 7)}。当前工作文件保持不变。`,
          switchBranch: `从 ${p.expected.branch || '游离 HEAD'} 切换到 ${p.name}。当前工作目录中的文件将随分支更新。`,
          createWorktree: `从 ${p.oid?.slice(0, 7)} 创建分支 ${p.name} 和独立工作目录。目录位于 ${worktrees}；当前工作区不变。`,
          restore: `将当前分支 ${p.expected.branch} 的全部跟踪文件恢复到 ${p.oid?.slice(0, 7)}，并创建新提交。恢复前 HEAD ${p.expected.head.slice(0, 7)} 将保存在备份分支；原历史保留。Git 提交钩子会正常运行。`,
          resumeCommit: `继续操作 ${p.id} 的失败提交。只提交与失败检查点完全一致的暂存内容，不自动暂存新的改动；Git 钩子、身份和签名仍生效。`,
        }
        return { token, description: descriptions[p.action], repo: git.root }
      }
      case 'cancel': {
        if (tickets.get(p.token)?.repoId === body.repoId) tickets.delete(p.token)
        return { cancelled: true }
      }
      case 'execute': {
        const ticket = tickets.get(p.token)
        if (!ticket || ticket.repoId !== body.repoId || ticket.expires <= now()) throw new Error('确认已过期或已使用，请重新操作。')
        tickets.delete(p.token)
        const op = ticket.operation
        const result = op.action === 'createBranch' ? await git.createBranch(op.oid, op.name, op.expected)
          : op.action === 'switchBranch' ? await git.switchBranch(op.name, op.expected)
            : op.action === 'createWorktree' ? await git.createWorktree(op.oid, op.name, worktrees, op.expected)
              : op.action === 'resumeCommit' ? await git.resumeCommit(op.id, op.expected, op.checkpoint) : await git.restore(op.oid, op.expected)
        return { ...result, snapshot: await snapshot() }
      }
      default: throw new Error('不支持的请求。')
    }
  }
  const handler = async (req, res) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('X-Content-Type-Options', 'nosniff')
    try {
      const address = req.socket.remoteAddress
      const hosts = [`127.0.0.1:${port()}`, `localhost:${port()}`, `[::1]:${port()}`]
      if (disposed || !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(address) || !hosts.includes(req.headers.host)
        || req.headers.origin !== `http://${req.headers.host}` || req.method !== 'POST'
        || req.headers['x-gitviz-client'] !== '1' || !/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) {
        res.statusCode = 403; res.end(JSON.stringify({ error: 'Gitviz 仅接受本机 DSH 面板请求。' })); return
      }
      const chunks = []
      let bytes = 0
      for await (const chunk of req) { bytes += chunk.length; if (bytes > 65536) throw new Error('请求过大。'); chunks.push(chunk) }
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
      if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('无效请求。')
      const result = await dispatch(body)
      res.end(JSON.stringify({ result }))
    } catch (error) { res.statusCode = 400; res.end(JSON.stringify({ error: error.message })) }
  }
  handler.dispose = () => { disposed = true; repositories.clear(); byRoot.clear(); tickets.clear() }
  return handler
}

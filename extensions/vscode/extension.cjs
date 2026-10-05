const vscode = require('vscode')
const path = require('node:path')
const fs = require('node:fs/promises')
const { randomBytes } = require('node:crypto')
const { GitService } = require('./git-service.cjs')

function activate(context) {
  const documents = new Map(), services = new Map(), allowedWorktrees = new Set()
  let panel, service, requestBusy = false
  const getService = async folder => {
    const candidate = await GitService.open(folder, vscode.workspace.getConfiguration('git').get('path') || 'git')
    if (!services.has(candidate.root)) services.set(candidate.root, candidate)
    return services.get(candidate.root)
  }
  const ensureTrusted = () => { if (!vscode.workspace.isTrusted) throw new Error('请先信任工作区，再使用 Gitviz。') }
  const ensureSavedEditors = repo => {
    const dirty = vscode.workspace.textDocuments.find(doc => {
      if (!doc.isDirty || doc.uri.scheme !== 'file') return false
      const relative = path.relative(repo.root, doc.uri.fsPath)
      return !relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative)
    })
    if (dirty) throw new Error(`编辑器中有尚未保存的文件：${path.basename(dirty.uri.fsPath)}。请先保存并处理 Git 修改。`)
  }
  const chooseRepo = async (explicit = false) => {
    ensureTrusted()
    let folders = (vscode.workspace.workspaceFolders || []).filter(folder => folder.uri.scheme === 'file').map(folder => ({ label: folder.name, description: folder.uri.fsPath }))
    // The built-in Git extension also finds nested repositories and worktrees.
    const gitExtension = vscode.extensions.getExtension('vscode.git')
    if (gitExtension) {
      const api = (await gitExtension.activate()).getAPI(1)
      folders = [...new Map([...folders, ...api.repositories.map(repo => ({ label: path.basename(repo.rootUri.fsPath), description: repo.rootUri.fsPath }))].map(item => [item.description, item])).values()]
    }
    let chosen
    if (folders.length === 1 && !explicit) chosen = folders[0].description
    else if (folders.length > 0) {
      const selected = await vscode.window.showQuickPick([...folders, { label: '浏览其他文件夹…' }], { title: '选择 Git 仓库' })
      if (!selected) return
      chosen = selected.description
    }
    if (!chosen) {
      const selected = await vscode.window.showOpenDialog({ canSelectFolders: true, canSelectFiles: false, canSelectMany: false, title: '打开 Git 仓库' })
      chosen = selected?.[0]?.fsPath
    }
    if (chosen) service = await getService(chosen)
  }
  const getSnapshot = async () => service ? { ...await service.snapshot(vscode.workspace.getConfiguration('gitviz').get('historyLimit')), writable: vscode.workspace.isTrusted } : { commits: [], branches: [], tags: [], head: null, branch: '', name: '', writable: false }
  const nativeDiff = async (repo, params) => {
    const files = await repo.files(params.from, params.to)
    const file = files.find(item => item.path === params.path)
    if (!file) throw new Error('文件不在本次比较中。请刷新后重试。')
    const makeUri = (oid, name) => {
      const key = randomBytes(12).toString('hex')
      documents.set(key, { repo, oid, name })
      return vscode.Uri.from({ scheme: 'gitviz', path: '/' + name, query: key })
    }
    const before = makeUri(file.status === 'A' ? null : params.from, file.oldPath)
    const after = makeUri(file.status === 'D' ? null : params.to, file.path)
    await vscode.commands.executeCommand('vscode.diff', before, after, `${file.path} · ${(params.from || '空版本').slice(0, 7)} → ${params.to.slice(0, 7)}`, { preview: true })
    return {}
  }
  context.subscriptions.push(vscode.workspace.registerTextDocumentContentProvider('gitviz', {
    provideTextDocumentContent: async uri => {
      const item = documents.get(uri.query)
      if (!item) throw new Error('比较已失效。请从版本树重新打开。')
      return item.repo.readFile(item.oid, item.name)
    },
  }), vscode.workspace.onDidCloseTextDocument(doc => {
    if (doc.uri.scheme === 'gitviz') documents.delete(doc.uri.query)
  }))

  async function handle(method, params = {}) {
    ensureTrusted()
    if (method === 'snapshot') return getSnapshot()
    if (method === 'chooseRepo') { await chooseRepo(true); return getSnapshot() }
    if (!service) throw new Error('请先打开一个 Git 仓库。')
    const repo = service
    if (method === 'historyPage') return repo.historyPage(params)
    if (method === 'searchHistory') return repo.searchHistory(params)
    if (method === 'operations') return repo.operations(params)
    if (method === 'detail') return repo.detail(params.oid)
    if (method === 'compare') return { from: params.from, to: params.to, files: await repo.files(params.from, params.to) }
    if (method === 'openDiff') return nativeDiff(repo, params)
    if (method === 'openWorktree') {
      if (!allowedWorktrees.has(params.path)) throw new Error('只能打开本次创建的试验工作区。')
      await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(params.path), { forceNewWindow: true })
      return {}
    }
    if (method === 'resumeCommit') {
      ensureSavedEditors(repo)
      const record = await repo.pendingCommit(params.id, params.expected)
      const files = (await repo.command(['diff', '--cached', '--name-only', '-z', '--'])).split('\0').filter(Boolean)
      const okay = await vscode.window.showWarningMessage('继续失败的提交？', { modal: true, detail: `仓库：${repo.root}\n操作：${record.id}\n将提交 ${files.length} 个文件，仅接受失败时的检查点，不自动暂存新的改动。Git 身份、签名和钩子继续生效。\n\n${files.slice(0, 8).join('\n')}` }, '检查并继续提交')
      if (!okay) return { cancelled: true }
      ensureSavedEditors(repo)
      return { ...await repo.resumeCommit(params.id, params.expected, record.checkpoint), snapshot: await getSnapshot() }
    }
    if (!['createBranch', 'switchBranch', 'createWorktree', 'restore'].includes(method)) throw new Error('不支持的请求。')
    if (['switchBranch', 'restore'].includes(method)) ensureSavedEditors(repo)
    await repo.guard(params.expected, ['switchBranch', 'restore'].includes(method))
    let result
    if (method === 'createBranch' || method === 'createWorktree') {
      await repo.assertOid(params.oid)
      const name = await vscode.window.showInputBox({ title: method === 'createBranch' ? '创建分支（不切换）' : '创建独立试验工作区', value: `if-${params.oid.slice(0, 7)}-${Date.now().toString(36)}`, prompt: '输入新分支名；原工作目录保持不变。', validateInput: async value => { try { await repo.validateBranch(value); return null } catch { return '请输入有效的 Git 分支名。' } } })
      if (!name) return { cancelled: true }
      if (method === 'createBranch') result = await repo.createBranch(params.oid, name, params.expected)
      else {
        const defaultRoot = process.platform === 'win32' && await fs.stat('F:/').catch(() => null) ? 'F:/Codex/worktrees' : path.join(path.dirname(repo.root), 'gitviz-worktrees')
        const parent = vscode.workspace.getConfiguration('gitviz').get('worktreeDirectory') || defaultRoot
        result = await repo.createWorktree(params.oid, name, parent, params.expected)
        allowedWorktrees.add(result.worktree)
      }
    } else if (method === 'switchBranch') {
      const okay = await vscode.window.showWarningMessage(`切换到 ${params.name}？`, { modal: true, detail: '工作文件会同步到这个分支。未提交或未跟踪文件会阻止切换。' }, '切换分支')
      if (!okay) return { cancelled: true }
      ensureSavedEditors(repo)
      result = await repo.switchBranch(params.name, params.expected)
    } else {
      const files = await repo.files(params.expected.head, params.oid)
      if (!files.length) throw new Error('这个存档与当前文件内容相同，无需恢复。')
      const okay = await vscode.window.showWarningMessage(`将 ${params.expected.branch || '游离 HEAD'} 恢复到存档 ${params.oid.slice(0, 7)}？`, { modal: true, detail: `将更新 ${files.length} 个文件，并创建一个新提交。恢复前会保留备份分支，现有提交历史不会删除。\n\n${files.slice(0, 8).map(file => `${file.status}  ${file.path}`).join('\n')}${files.length > 8 ? '\n…' : ''}` }, '备份并恢复为新提交')
      if (!okay) return { cancelled: true }
      ensureSavedEditors(repo)
      result = await repo.restore(params.oid, params.expected)
    }
    return { ...result, snapshot: await getSnapshot() }
  }

  async function open() {
    ensureTrusted()
    if (panel) { panel.reveal(); return }
    if (!service) await chooseRepo()
    panel = vscode.window.createWebviewPanel('gitviz.tree', 'Gitviz · 版本树', vscode.ViewColumn.Active, { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'media')] })
    const current = panel
    const script = current.webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'media', 'tree.js'))
    const style = current.webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'media', 'tree.css'))
    const nonce = randomBytes(18).toString('base64')
    current.webview.html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${current.webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; font-src ${current.webview.cspSource}; img-src ${current.webview.cspSource} data:;"><link rel="stylesheet" href="${style}"><title>Gitviz 版本树</title></head><body><div id="root"></div><script nonce="${nonce}" src="${script}"></script></body></html>`
    current.webview.onDidReceiveMessage(async message => {
      if (!message || typeof message.id !== 'string' || message.id.length > 100 || typeof message.method !== 'string') return
      if (requestBusy && !['snapshot', 'detail', 'compare', 'openDiff', 'historyPage', 'searchHistory', 'operations'].includes(message.method)) {
        await current.webview.postMessage({ id: message.id, error: '另一个操作正在进行。' }); return
      }
      const mutation = !['snapshot', 'detail', 'compare', 'openDiff', 'historyPage', 'searchHistory', 'operations'].includes(message.method)
      if (mutation) requestBusy = true
      try { await current.webview.postMessage({ id: message.id, result: await handle(message.method, message.params) }) }
      catch (error) { await current.webview.postMessage({ id: message.id, error: error.message }) }
      finally { if (mutation) requestBusy = false }
    }, undefined, context.subscriptions)
    current.onDidDispose(() => { if (panel === current) panel = undefined }, undefined, context.subscriptions)
  }
  context.subscriptions.push(vscode.commands.registerCommand('gitviz.open', async () => {
    try { await open() } catch (error) { vscode.window.showErrorMessage(`Gitviz：${error.message}`) }
  }), vscode.window.onDidChangeWindowState(state => {
    if (state.focused && panel) panel.webview.postMessage({ event: 'refresh' })
  }))
  return { getSnapshot, open }
}
module.exports = { activate }

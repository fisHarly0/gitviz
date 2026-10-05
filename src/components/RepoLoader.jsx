import { useState } from 'react'
import { open as openDialog } from '@tauri-apps/plugin-dialog'
import { openRepo, createTauriAdapter } from '../adapters/tauriAdapter.js'
import {
  createGithubAdapter,
  loadPAT,
  parseRepoSpec,
  savePAT,
} from '../adapters/githubAdapter.js'

export default function RepoLoader({ onLoaded, desktop, confirm, run }) {
  const [mode, setMode] = useState(desktop ? 'local' : 'github')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [pickedPath, setPickedPath] = useState('')
  const [repoSpec, setRepoSpec] = useState('fisHarly0/gitviz')
  const [pat, setPat] = useState(loadPAT)

  async function loadLocal(path) {
    setPickedPath(path)
    const info = await openRepo(path)
    onLoaded(createTauriAdapter({ repo: info.path, confirm, run }))
  }

  async function handleLocalLoad(event) {
    event.preventDefault()
    if (busy || !desktop || !pickedPath.trim()) return
    setError(''); setBusy(true)
    try { await loadLocal(pickedPath.trim()) }
    catch (err) { setError(err.message || String(err)) }
    finally { setBusy(false) }
  }

  async function handlePickFolder() {
    if (busy || !desktop) return
    setError('')
    setBusy(true)
    try {
      const path = await openDialog({
        directory: true,
        multiple: false,
        title: '选择 Git 仓库的工作目录',
      })
      if (!path) {
        return
      }
      await loadLocal(path)
    } catch (err) {
      setError(err.message || String(err))
    } finally {
      setBusy(false)
    }
  }

  async function handleGithubLoad(event) {
    event.preventDefault()
    if (busy) return
    setError('')
    setBusy(true)
    try {
      const { owner, repo } = parseRepoSpec(repoSpec)
      const token = pat.trim()
      const adapter = createGithubAdapter({
        owner,
        repo,
        token: token || undefined,
      })
      const branches = await adapter.listBranches()
      if (branches.length === 0) {
        throw new Error('这个仓库还没有分支。先向 GitHub 推送一次提交，再重新打开。')
      }
      savePAT(token)
      onLoaded(adapter)
    } catch (err) {
      const messages = {
        401: 'GitHub 未接受这个令牌。请更新令牌；公开仓库也可以清空令牌后重试。',
        403: 'GitHub 拒绝访问或请求额度已用完。请检查令牌权限，或稍后重试。',
        404: '仓库不存在或没有访问权限。请检查所有者/仓库名；私有仓库需要有读取权限的令牌。',
        429: 'GitHub 请求过于频繁。请稍后重试。',
      }
      setError(messages[err.status] || err.message || '无法连接 GitHub。请检查网络后重试。')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="repo-loader" aria-busy={busy}>
      <div className="mode-tabs">
        <button
          className={mode === 'local' ? 'tab active' : 'tab'}
          disabled={busy || !desktop}
          aria-pressed={mode === 'local'}
          title={desktop ? '打开本地 Git 仓库' : '本地仓库需要使用桌面应用'}
          onClick={() => setMode('local')}
        >
          本地仓库
        </button>
        <button
          className={mode === 'github' ? 'tab active' : 'tab'}
          disabled={busy}
          aria-pressed={mode === 'github'}
          onClick={() => setMode('github')}
        >
          GitHub
        </button>
      </div>

      {!desktop && (
        <p className="hint runtime-hint">
          网页模式只读浏览 GitHub 仓库。要打开本地文件夹，请使用 Gitviz 桌面应用。
        </p>
      )}

      {mode === 'local' && (
        <form className="mode-body" onSubmit={handleLocalLoad}>
          <p className="hint">
            打开包含 <code>.git</code> 的工作目录，也支持 Git worktree。直接读取本机文件，不上传仓库。
          </p>
          <label>本机仓库路径<input value={pickedPath} onChange={event => setPickedPath(event.target.value)} placeholder="粘贴仓库的完整路径" disabled={busy} autoCapitalize="none" spellCheck={false}/></label>
          <div className="repo-open-actions"><button type="submit" disabled={busy || !pickedPath.trim()}>{busy ? '正在打开…' : '打开仓库'}</button><button type="button" onClick={handlePickFolder} disabled={busy}>选择文件夹</button></div>
          <p className="hint">需要已安装 Git。点击节点只预览；切换、恢复或编辑会另行说明影响并请你确认。</p>
        </form>
      )}

      {mode === 'github' && (
        <form className="mode-body" onSubmit={handleGithubLoad}>
          <label>
            GitHub 仓库（所有者/仓库名或网址）
            <input
              value={repoSpec}
              onChange={(e) => setRepoSpec(e.target.value)}
              placeholder="fisHarly0/gitviz"
              disabled={busy}
              required
              autoCapitalize="none"
              spellCheck={false}
            />
          </label>
          <label>
            访问令牌（可选，仅当前标签页）
            <input
              type="password"
              value={pat}
              onChange={(e) => setPat(e.target.value)}
              placeholder="ghp_..."
              disabled={busy}
              autoComplete="off"
              spellCheck={false}
            />
            <small>
              公开仓库通常无需令牌；私有仓库请使用只读权限。浏览器允许会话存储时，令牌仅在当前标签页保留。
            </small>
          </label>
          <button type="submit" disabled={busy || !repoSpec.trim()}>
            {busy ? '正在读取仓库…' : '只读打开 GitHub 仓库'}
          </button>
        </form>
      )}

      {error && <div className="error" role="alert">{error}</div>}
    </div>
  )
}

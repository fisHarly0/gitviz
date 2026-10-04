import { useState } from 'react'
import { open as openDialog } from '@tauri-apps/plugin-dialog'
import { openRepo, createTauriAdapter } from '../adapters/tauriAdapter.js'
import {
  createGithubAdapter,
  loadPAT,
  parseRepoSpec,
  savePAT,
} from '../adapters/githubAdapter.js'

export default function RepoLoader({ onLoaded, desktop }) {
  const [mode, setMode] = useState(desktop ? 'local' : 'github')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [pickedPath, setPickedPath] = useState('')
  const [repoSpec, setRepoSpec] = useState('fisHarly0/gitviz')
  const [pat, setPat] = useState(loadPAT)

  async function handlePickFolder() {
    if (busy || !desktop) return
    setError('')
    setBusy(true)
    try {
      const path = await openDialog({
        directory: true,
        multiple: false,
        title: 'Pick repo folder (containing .git)',
      })
      if (!path) {
        return
      }
      setPickedPath(path)
      await openRepo(path)
      const adapter = createTauriAdapter()
      const branches = await adapter.listBranches()
      if (branches.length === 0) {
        throw new Error(
          'This repository has no local branches. Create a commit in Git first, then open the repository root.',
        )
      }
      onLoaded(adapter)
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
        throw new Error('This repository has no branches yet. Push a commit to GitHub, then try again.')
      }
      savePAT(token)
      onLoaded(adapter)
    } catch (err) {
      const messages = {
        401: 'GitHub rejected this token. Update it, or clear it to browse a public repository.',
        403: 'GitHub denied access or the API limit was reached. Check token permissions or try again later.',
        404: 'Repository not found or not accessible. Check owner/repo and token access for private repositories.',
        429: 'GitHub API limit reached. Wait a moment and try again.',
      }
      setError(messages[err.status] || err.message || 'Could not connect to GitHub. Check your connection and try again.')
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
          title={desktop ? 'Open a local repository' : 'Local repositories require the desktop app'}
          onClick={() => setMode('local')}
        >
          Local repo
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
          Browser mode: browse GitHub repositories read-only. To open local folders,
          start the desktop app with <code>npm run desktop:dev</code>.
        </p>
      )}

      {mode === 'local' && (
        <div className="mode-body">
          <p className="hint">
            Pick the folder that contains <code>.git</code> (your repo root).
            Reads directly from disk through the Tauri backend - no upload, no sandbox copy.
          </p>
          <button onClick={handlePickFolder} disabled={busy}>
            {busy ? 'Opening...' : 'Choose folder'}
          </button>
          {pickedPath && !busy && (
            <div className="progress-current" style={{ marginTop: 6, opacity: 0.7 }}>
              {pickedPath}
            </div>
          )}
        </div>
      )}

      {mode === 'github' && (
        <form className="mode-body" onSubmit={handleGithubLoad}>
          <label>
            Repo (owner/repo or URL)
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
            Personal access token (optional, session only)
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
              Kept for this tab only when session storage is available. Public repositories
              work without a token; use read-only access for private repositories.
            </small>
          </label>
          <button type="submit" disabled={busy || !repoSpec.trim()}>
            {busy ? 'Loading repository...' : 'Load repository'}
          </button>
        </form>
      )}

      {error && <div className="error" role="alert">{error}</div>}
    </div>
  )
}

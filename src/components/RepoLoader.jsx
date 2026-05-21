import { useState } from 'react'
import { open as openDialog } from '@tauri-apps/plugin-dialog'
import { openRepo, createTauriAdapter } from '../adapters/tauriAdapter.js'
import {
  createGithubAdapter,
  loadPAT,
  parseRepoSpec,
  savePAT,
} from '../adapters/githubAdapter.js'

export default function RepoLoader({ onLoaded }) {
  const [mode, setMode] = useState('local')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [pickedPath, setPickedPath] = useState('')
  const [repoSpec, setRepoSpec] = useState('isomorphic-git/isomorphic-git')
  const [pat, setPat] = useState(loadPAT())

  async function handlePickFolder() {
    setError('')
    setBusy(true)
    try {
      const path = await openDialog({
        directory: true,
        multiple: false,
        title: 'Pick repo folder (containing .git)',
      })
      if (!path) {
        setBusy(false)
        return
      }
      setPickedPath(path)
      await openRepo(path)
      const adapter = createTauriAdapter()
      const branches = await adapter.listBranches()
      if (branches.length === 0) {
        throw new Error(
          'No git refs found. Pick the repo root (the folder containing .git).',
        )
      }
      setBusy(false)
      onLoaded(adapter)
    } catch (err) {
      setBusy(false)
      setError(err.message || String(err))
    }
  }

  async function handleGithubLoad() {
    setError('')
    try {
      const { owner, repo } = parseRepoSpec(repoSpec)
      savePAT(pat)
      const adapter = createGithubAdapter({
        owner,
        repo,
        token: pat || undefined,
      })
      await adapter.listBranches()
      onLoaded(adapter)
    } catch (err) {
      setError(err.message || String(err))
    }
  }

  return (
    <div className="repo-loader">
      <div className="mode-tabs">
        <button
          className={mode === 'local' ? 'tab active' : 'tab'}
          onClick={() => setMode('local')}
        >
          Local repo
        </button>
        <button
          className={mode === 'github' ? 'tab active' : 'tab'}
          onClick={() => setMode('github')}
        >
          GitHub
        </button>
      </div>

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
        <div className="mode-body">
          <label>
            Repo (owner/repo or URL)
            <input
              value={repoSpec}
              onChange={(e) => setRepoSpec(e.target.value)}
              placeholder="isomorphic-git/isomorphic-git"
            />
          </label>
          <label>
            Personal access token (optional, session only)
            <input
              type="password"
              value={pat}
              onChange={(e) => setPat(e.target.value)}
              placeholder="ghp_..."
            />
            <small>
              Stored in sessionStorage only. Cleared when you close this tab.
              Without a token, GitHub allows 60 requests per hour.
            </small>
          </label>
          <button onClick={handleGithubLoad}>Load</button>
        </div>
      )}

      {error && <div className="error">{error}</div>}
    </div>
  )
}

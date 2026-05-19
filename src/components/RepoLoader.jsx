import { useRef, useState } from 'react'
import { loadFilesIntoFs, loadDirHandleIntoFs, createLocalAdapter } from '../adapters/localAdapter.js'
import {
  createGithubAdapter,
  loadPAT,
  parseRepoSpec,
  savePAT,
} from '../adapters/githubAdapter.js'

export default function RepoLoader({ onLoaded }) {
  const [mode, setMode] = useState('local')
  const [progress, setProgress] = useState(null)
  const [error, setError] = useState('')
  const [repoSpec, setRepoSpec] = useState('isomorphic-git/isomorphic-git')
  const [pat, setPat] = useState(loadPAT())
  const inputRef = useRef(null)

  const hasFSA = typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function'

  async function handleFSAPick() {
    setError('')
    if (!hasFSA) {
      setError(
        'File System Access API not available. Need Chrome/Edge 86+ on https or localhost.',
      )
      return
    }
    try {
      const dirHandle = await window.showDirectoryPicker({ mode: 'read' })
      setProgress({ done: 0, total: 0, current: 'scanning...' })
      await loadDirHandleIntoFs(dirHandle, setProgress)
      const adapter = createLocalAdapter()
      const branches = await adapter.listBranches().catch(() => [])
      if (branches.length === 0) {
        throw new Error('No git refs found. Pick the repo root (the folder containing .git).')
      }
      setProgress(null)
      onLoaded(adapter)
    } catch (err) {
      setProgress(null)
      if (err && err.name === 'AbortError') return // user cancelled picker
      setError(err.message || String(err))
    }
  }

  async function handleDirChange(event) {
    setError('')
    const files = event.target.files
    if (!files || files.length === 0) return
    try {
      setProgress({ done: 0, total: files.length, current: '' })
      await loadFilesIntoFs(files, setProgress)
      const adapter = createLocalAdapter()
      const branches = await adapter.listBranches().catch(() => [])
      if (branches.length === 0) {
        throw new Error(
          'No git refs found via webkitdirectory (Chrome usually skips .git folders). Try the "Choose folder (modern)" button above.',
        )
      }
      setProgress(null)
      onLoaded(adapter)
    } catch (err) {
      setProgress(null)
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
            All files stay in the browser; nothing is uploaded.
          </p>
          {hasFSA && (
            <button onClick={handleFSAPick}>
              Choose folder (modern · reads .git reliably)
            </button>
          )}
          <button onClick={() => inputRef.current?.click()} className="alt-btn">
            Choose folder (legacy · webkitdirectory · may skip .git)
          </button>
          <input
            ref={inputRef}
            type="file"
            webkitdirectory=""
            directory=""
            multiple
            style={{ display: 'none' }}
            onChange={handleDirChange}
          />
          {progress && (
            <div className="progress">
              Loading {progress.done}
              {progress.total ? ` / ${progress.total}` : ''}
              {progress.current ? `: ${progress.current}` : ''}
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

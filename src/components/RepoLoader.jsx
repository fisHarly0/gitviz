import { useRef, useState } from 'react'
import { loadFilesIntoFs, loadDirHandleIntoFs, createLocalAdapter } from '../adapters/localAdapter.js'

function fmtBytes(n) {
  if (n < 1024) return n + ' B'
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB'
  if (n < 1024 * 1024 * 1024) return (n / 1024 / 1024).toFixed(1) + ' MB'
  return (n / 1024 / 1024 / 1024).toFixed(2) + ' GB'
}
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
              <div>
                Loading {progress.done}
                {progress.total ? ` / ${progress.total}` : ''}
                {typeof progress.bytes === 'number' ? ` · ${fmtBytes(progress.bytes)}` : ''}
              </div>
              {progress.current && (
                <div className="progress-current">
                  {progress.current}
                  {typeof progress.currentBytes === 'number' && progress.currentBytes > 1024 * 1024
                    ? ` (${fmtBytes(progress.currentBytes)})`
                    : ''}
                </div>
              )}
              {(progress.largeFiles > 0 || progress.slowFiles > 0 || progress.skipped > 0) && (
                <div className="progress-flags">
                  {progress.largeFiles > 0 && (
                    <span className="flag large" title="files > 5MB">
                      {progress.largeFiles} large
                    </span>
                  )}
                  {progress.slowFiles > 0 && (
                    <span className="flag slow" title="single-write > 200ms">
                      {progress.slowFiles} slow
                    </span>
                  )}
                  {progress.skipped > 0 && (
                    <span className="flag skipped" title="skipped: >100MB or error">
                      {progress.skipped} skipped
                    </span>
                  )}
                </div>
              )}
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

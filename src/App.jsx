import { useEffect, useState } from 'react'
import { isTauri } from '@tauri-apps/api/core'
import { getCurrentWebview } from '@tauri-apps/api/webview'
import RepoLoader from './components/RepoLoader.jsx'
import CommitGraph from './components/CommitGraph.jsx'
import CommitDetail from './components/CommitDetail.jsx'
import PreviewBanner from './components/PreviewBanner.jsx'
import ModeStatusBar from './components/ModeStatusBar.jsx'
import IfLinesPanel from './components/IfLinesPanel.jsx'
import { useSession } from './state/useSession.js'
import { openRepo, createTauriAdapter } from './adapters/tauriAdapter.js'
import './App.css'

export default function App() {
  const desktop = isTauri()
  const [adapter, setAdapter] = useState(null)
  const [branches, setBranches] = useState([])
  const [refreshKey, setRefreshKey] = useState(0) // commit 后 ++ 触发 CommitGraph 重新拉
  const [dragOver, setDragOver] = useState(false)
  const [dropError, setDropError] = useState('')
  const session = useSession()

  // 整窗口拖放：拖任意文件夹进窗口 → 自动 openRepo 切换 adapter
  useEffect(() => {
    if (!desktop) return
    let unlisten
    let disposed = false
    ;(async () => {
      try {
        unlisten = await getCurrentWebview().onDragDropEvent(async (evt) => {
          const t = evt.payload.type
          if (t === 'enter' || t === 'over') {
            setDragOver(true)
          } else if (t === 'leave') {
            setDragOver(false)
          } else if (t === 'drop') {
            setDragOver(false)
            const paths = evt.payload.paths || []
            if (paths.length === 0) return
            const picked = paths[0]
            try {
              await openRepo(picked)
              const a = createTauriAdapter()
              const refs = await a.listBranches()
              if (refs.length === 0) {
                throw new Error('No git refs found. Drop the repo root (the folder containing .git).')
              }
              setRefreshKey(0)
              setAdapter(a)
              setDropError('')
            } catch (err) {
              setDropError(err.message || String(err))
            }
          }
        })
        if (disposed) unlisten()
      } catch {
        // 非 Tauri 环境（pure vite preview）忽略
      }
    })()
    return () => {
      disposed = true
      if (typeof unlisten === 'function') unlisten()
    }
  }, [desktop])

  // 拉 branches 列表 + 选 main · adapter 切换 OR 用户 commit 后都要重拉
  useEffect(() => {
    if (!adapter) return
    let cancelled = false
    Promise.all([
      adapter.listBranches(),
      typeof adapter.currentBranch === 'function' ? adapter.currentBranch() : null,
    ])
      .then(([refs, currentBranch]) => {
        if (cancelled) return
        setBranches(refs)
        const names = refs.map((r) => r.name)
        const main = names.includes('main')
          ? 'main'
          : names.includes('master')
            ? 'master'
            : names[0] || 'main'
        const initialBranch = names.includes(currentBranch) ? currentBranch : main
        const initialRef = refs.find((r) => r.name === initialBranch)
        // 首次加载（refreshKey === 0）才 setupRepo · 后续 commit 触发的 refresh 不应 reset session
        if (refreshKey === 0) {
          session.setupRepo(names, initialRef ? initialRef.oid : null, initialBranch)
        }
      })
      .catch((err) => {
        if (!cancelled) setDropError(err.message || String(err))
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adapter, refreshKey])

  // commit 完触发：更新 refreshKey 让 graph + branches 重拉
  const handleCommitted = () => {
    setRefreshKey((k) => k + 1)
  }

  if (!adapter) {
    return (
      <div className={dragOver ? 'app start drag-over' : 'app start'}>
        <header className="app-header">
          <h1>gitviz</h1>
          <p>Browse Git history as a timeline of save points.</p>
          <p className="tagline">{desktop ? 'Preview past commits, then create an if-line to experiment.' : 'Explore branches and changes in a GitHub repository.'}</p>
          {desktop && <p className="drop-hint">Tip: drop a repository folder here to open it.</p>}
        </header>
        <RepoLoader desktop={desktop} onLoaded={(a) => {
          setRefreshKey(0)
          setDropError('')
          setAdapter(a)
        }} />
        {dropError && <div className="error drop-error">{dropError}</div>}
        {dragOver && <div className="drop-overlay">Drop folder to open</div>}
      </div>
    )
  }

  const onSelectCommit = (oid) => {
    if (!oid) {
      session.leaveToBrowse()
      return
    }
    // 点了当前 HEAD（最新的 commit）= 回到 browse
    if (oid === session.headOid) {
      session.leaveToBrowse(oid)
      return
    }
    session.enterPreview(oid)
  }

  return (
    <div className={dragOver ? 'app loaded drag-over' : 'app loaded'}>
      {dragOver && <div className="drop-overlay">Drop folder to switch repo</div>}
      {dropError && <div className="error drop-error">{dropError}</div>}
      <header className="app-header">
        <h1>gitviz</h1>
        <div className="source-info">
          Source: {adapter.kind()}
          {adapter.spec ? ` (${adapter.spec.owner}/${adapter.spec.repo})` : ''}
          <button
            className="switch"
            onClick={() => {
              setAdapter(null)
            }}
          >
            Switch repo
          </button>
        </div>
      </header>

      {session.mode === 'preview' && (
        <PreviewBanner
          viewingOid={session.viewingOid}
          currentBranch={session.currentBranch}
          readOnly={adapter.kind() !== 'local'}
          onReturn={() => session.leaveToBrowse()}
        />
      )}

      <main className="split">
        <section className="graph-pane">
          <IfLinesPanel
            branches={branches}
            currentBranch={session.currentBranch}
            mainBranch={session.mainBranch}
            adapter={adapter}
            onSwitched={(name, oid) => { session.switchToBranch(name, oid); handleCommitted() }}
          />
          <CommitGraph
            adapter={adapter}
            onSelect={onSelectCommit}
            selectedOid={session.viewingOid}
            refreshKey={refreshKey}
          />
        </section>
        <section className="detail-pane">
          <CommitDetail
            adapter={adapter}
            oid={session.viewingOid}
            session={session}
            onCommitted={handleCommitted}
          />
        </section>
      </main>

      <ModeStatusBar
        readOnly={adapter.kind() !== 'local'}
        mode={session.mode}
        currentBranch={session.currentBranch}
        viewingOid={session.viewingOid}
        currentIfBranch={session.currentIfBranch}
        changedFilesInIf={session.changedFilesInIf}
        headOid={session.headOid}
      />
    </div>
  )
}

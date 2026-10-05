import { useCallback, useEffect, useState } from 'react'
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
import OperationDialog from './components/OperationDialog.jsx'
import useOperationDialog from './state/useOperationDialog.js'
import DesktopActions from './components/DesktopActions.jsx'
import OperationHistory from './version-tree/OperationHistory.jsx'

export default function App() {
  const desktop = isTauri()
  const [adapter, setAdapter] = useState(null)
  const [branches, setBranches] = useState([])
  const [refreshKey, setRefreshKey] = useState(0) // commit 后 ++ 触发 CommitGraph 重新拉
  const [recoveryRevision, setRecoveryRevision] = useState(0)
  const [dragOver, setDragOver] = useState(false)
  const [dropError, setDropError] = useState('')
  const [repoSnapshot, setRepoSnapshot] = useState(null)
  const session = useSession()
  const operation = useOperationDialog()
  const runOperation = operation.run, confirmOperation = operation.confirm
  const setupRepo = session.setupRepo
  const acceptAdapter = useCallback(a => {
    setupRepo([], null, '')
    setRepoSnapshot(null); setBranches([]); setRefreshKey(0); setDropError(''); setAdapter(a)
  }, [setupRepo])
  const openLocalPath = useCallback(async path => {
    if (session.editingFile) throw new Error('请先完成或取消当前编辑，再打开其他仓库。')
    return runOperation(async () => {
      const info = await openRepo(path)
      acceptAdapter(createTauriAdapter({ repo: info.path, confirm: confirmOperation, run: runOperation }))
    })
  }, [session.editingFile, runOperation, confirmOperation, acceptAdapter])

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
              if (session.editingFile || operation.busy) throw new Error('请先完成当前操作或取消编辑，再打开其他仓库。')
              await openLocalPath(picked)
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
  }, [desktop, session.editingFile, operation.busy, openLocalPath])

  // 拉 branches 列表 + 选 main · adapter 切换 OR 用户 commit 后都要重拉
  useEffect(() => {
    if (!adapter || adapter.historyRequest) return
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
        <RepoLoader desktop={desktop} confirm={operation.confirm} run={operation.run} onLoaded={acceptAdapter} />
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
      <OperationDialog request={operation.request} onAnswer={operation.answer}/>
      {dragOver && <div className="drop-overlay">Drop folder to switch repo</div>}
      {dropError && <div className="error drop-error">{dropError}</div>}
      <header className="app-header">
        <h1>gitviz</h1>
        <div className="source-info">
          Source: {adapter.kind()}
          {adapter.spec ? ` (${adapter.spec.owner}/${adapter.spec.repo})` : ''}
          {adapter.repo && <span className="source-repo-path" title={adapter.repo}>{adapter.repo}</span>}
          <button
            className="switch"
            disabled={Boolean(session.editingFile) || operation.busy}
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
            onReturn={() => { if (!operation.busy) session.leaveToBrowse() }}
        />
      )}

      <main className="split">
        <section className="graph-pane">
          <IfLinesPanel
            branches={branches}
            currentBranch={session.currentBranch}
            mainBranch={session.mainBranch}
            adapter={adapter}
            headOid={session.headOid}
            editing={Boolean(session.editingFile) || operation.busy}
            dirty={Boolean(repoSnapshot?.dirty)}
            onRefresh={handleCommitted}
            onSwitched={(name, oid) => { session.switchToBranch(name, oid); handleCommitted() }}
          />
          <CommitGraph
            adapter={adapter}
            onSelect={oid => { if (!session.editingFile && !operation.busy) onSelectCommit(oid) }}
            selectedOid={session.viewingOid}
            refreshKey={refreshKey}
            editing={Boolean(session.editingFile)}
            blocked={operation.busy}
            onSnapshot={snapshot => {
              setRepoSnapshot(snapshot)
              setBranches(snapshot.branches.filter(ref => !ref.remote))
              session.syncSnapshot(snapshot)
            }}
          />
        </section>
        <section className="detail-pane">
          {adapter.kind() === 'local' && <DesktopActions
            key={`actions-${adapter.historyId}-${recoveryRevision}`}
            adapter={adapter}
            oid={session.viewingOid}
            snapshot={repoSnapshot}
            blocked={Boolean(session.editingFile) || operation.busy}
            editing={Boolean(session.editingFile)}
            onRefresh={handleCommitted}
            onOpenWorktree={openLocalPath}
            onResult={(result, action) => {
              if (action === 'restore') session.switchToBranch(result.branch, result.head)
              handleCommitted()
            }}
          />}
          {adapter.kind() === 'local' && <OperationHistory key={`operations-${adapter.historyId}`} load={params => adapter.historyRequest('operations', params)} refreshKey={`${refreshKey}-${operation.busy}`} blocked={operation.busy} editing={Boolean(session.editingFile)} onResume={async record => {
            try {
              const result = await adapter.performAction({ action: 'resumeCommit', id: record.id }, { head: session.headOid, branch: session.currentBranch })
              if (!result.cancelled) {
                session.switchToBranch(result.branch, result.head)
                // A completed recovery replaces the failed action's transient feedback.
                // Its original error remains available in the persistent operation log.
                setRecoveryRevision(value => value + 1)
              }
              return result
            } finally { handleCommitted() }
          }}/>}
          <CommitDetail
            key={`detail-${adapter.historyId || `${adapter.spec?.owner}/${adapter.spec?.repo}`}`}
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

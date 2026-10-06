import { useCallback, useEffect, useRef, useState } from 'react'
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
import useDesktopCloseGuard from './state/useDesktopCloseGuard.js'
import DesktopActions from './components/DesktopActions.jsx'
import OperationHistory from './version-tree/OperationHistory.jsx'

export default function App() {
  const desktop = isTauri()
  const [adapter, setAdapter] = useState(null)
  const [branches, setBranches] = useState([])
  const [refreshKey, setRefreshKey] = useState(0) // commit 后 ++ 触发 CommitGraph 重新拉
  const [recoveryRevision, setRecoveryRevision] = useState(0)
  const operationHistory = useRef(null)
  const [dragOver, setDragOver] = useState(false)
  const [dropError, setDropError] = useState('')
  const [repoSnapshot, setRepoSnapshot] = useState(null)
  const [repoTrail, setRepoTrail] = useState([])
  const session = useSession()
  const operation = useOperationDialog()
  const closeGuard = useDesktopCloseGuard(desktop, operation)
  const { isReady } = closeGuard
  const { run, confirm: confirmOperation } = operation
  const runOperation = useCallback(action => {
    if (!isReady()) return Promise.reject(new Error('关闭保护尚未准备好，请稍后重试或重启应用。'))
    return run(action)
  }, [run, isReady])
  const blocked = operation.busy || !closeGuard.ready
  const setupRepo = session.setupRepo
  const acceptAdapter = useCallback(a => {
    setupRepo([], null, '')
    setRepoSnapshot(null); setBranches([]); setRefreshKey(0); setDropError(''); setAdapter(a)
    setRepoTrail([])
  }, [setupRepo])
  const openLocalPath = useCallback(async (path, trail = []) => {
    if (session.editingFile) throw new Error('请先完成或取消当前编辑，再打开其他仓库。')
    return runOperation(async () => {
      const info = await openRepo(path)
      acceptAdapter(createTauriAdapter({ repo: info.path, confirm: confirmOperation, run: runOperation }))
      setRepoTrail(trail)
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

  // commit 完触发：更新 refreshKey 让 graph + branches 重拉
  const handleCommitted = () => {
    setRefreshKey((k) => k + 1)
  }

  if (!adapter) {
    return (
      <div className={dragOver ? 'app start drag-over' : 'app start'}>
        <OperationDialog request={operation.request} onAnswer={operation.answer} notice={closeGuard.notice}/>
        {closeGuard.notice && !operation.request && <p className="close-notice" role="alert">{closeGuard.notice}</p>}
        <header className="app-header">
          <h1>gitviz</h1>
          <p>把 Git 历史展开成可探索的版本地图。</p>
          <p className="tagline">{desktop ? '先查看存档，再决定切换、恢复或创建试验分支。' : '只读查看 GitHub 仓库的分支与文件变化。'}</p>
          {desktop && <p className="drop-hint">也可以把仓库文件夹拖到窗口中打开。</p>}
        </header>
        <RepoLoader desktop={desktop} confirm={operation.confirm} run={runOperation} onLoaded={acceptAdapter} />
        {dropError && <div className="error drop-error">{dropError}</div>}
        {dragOver && <div className="drop-overlay">松开以打开仓库</div>}
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
      <OperationDialog request={operation.request} onAnswer={operation.answer} notice={closeGuard.notice}/>
      {closeGuard.notice && !operation.request && <p className="close-notice" role="alert">{closeGuard.notice}</p>}
      {dragOver && <div className="drop-overlay">松开以打开另一个仓库</div>}
      {dropError && <div className="error drop-error">{dropError}</div>}
      <header className="app-header">
        <h1>gitviz</h1>
        <div className="source-info">
          {adapter.kind() === 'local' ? '本地仓库' : 'GitHub · 只读'}
          {adapter.spec ? ` (${adapter.spec.owner}/${adapter.spec.repo})` : ''}
          {adapter.repo && <span className="source-repo-path" title={adapter.repo}>{adapter.repo}</span>}
          <button
            className="switch"
            disabled={Boolean(session.editingFile) || blocked}
            onClick={() => {
              setAdapter(null)
            }}
          >
            更换仓库
          </button>
        </div>
      </header>

      {repoTrail.length > 0 && <nav className="trial-return" aria-label="试验工作区导航">
        <div><strong>正在查看试验工作区</strong><p>返回只更换地图中的仓库，试验目录与修改都会保留。</p></div>
        <button disabled={Boolean(session.editingFile) || blocked} title={repoTrail.at(-1)} onClick={() => openLocalPath(repoTrail.at(-1), repoTrail.slice(0, -1)).catch(reason => setDropError(reason.message || String(reason)))}>返回上个仓库</button>
        {session.editingFile && <span>先完成或取消编辑，再返回。</span>}
      </nav>}

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
            key={`branches-${adapter.historyId}-${recoveryRevision}`}
            branches={branches}
            currentBranch={session.currentBranch}
            mainBranch={session.mainBranch}
            adapter={adapter}
            headOid={session.headOid}
            editing={Boolean(session.editingFile) || blocked}
            dirty={Boolean(repoSnapshot?.dirty)}
            onRefresh={handleCommitted}
            onSwitched={(name, oid) => { session.switchToBranch(name, oid); if (adapter.kind() === 'local') handleCommitted() }}
          />
          <CommitGraph
            adapter={adapter}
            onSelect={oid => { if (!session.editingFile && !operation.busy) onSelectCommit(oid) }}
            selectedOid={session.viewingOid}
            currentBranch={session.currentBranch}
            onRemoteHistory={data => {
              setBranches(data.branches)
              const names = data.branches.map(ref => ref.name)
              const branch = names.includes(session.currentBranch) ? session.currentBranch : names.includes('main') ? 'main' : names.includes('master') ? 'master' : names[0] || ''
              session.syncSnapshot({ branches: data.branches, branch, head: data.branches.find(ref => ref.name === branch)?.oid || null })
            }}
            refreshKey={refreshKey}
            editing={Boolean(session.editingFile)}
            blocked={blocked}
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
            blocked={Boolean(session.editingFile) || blocked}
            editing={Boolean(session.editingFile)}
            onRefresh={handleCommitted}
            onOpenWorktree={path => openLocalPath(path, [...repoTrail, adapter.repo])}
            onOpenRecords={() => {
              const records = operationHistory.current
              if (!records) return
              records.open = true
              records.querySelector('summary')?.focus({ preventScroll: true })
              records.scrollIntoView({ block: 'nearest' })
            }}
            onResult={(result, action) => {
              if (action === 'restore') session.switchToBranch(result.branch, result.head)
              handleCommitted()
            }}
          />}
          {adapter.kind() === 'local' && <OperationHistory detailsRef={operationHistory} key={`operations-${adapter.historyId}`} load={params => adapter.historyRequest('operations', params)} refreshKey={repoSnapshot} blocked={blocked} editing={Boolean(session.editingFile)} onResume={async record => {
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
            onDraft={closeGuard.onDraft}
            blocked={blocked}
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

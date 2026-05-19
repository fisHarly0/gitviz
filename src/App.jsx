import { useEffect, useState } from 'react'
import RepoLoader from './components/RepoLoader.jsx'
import CommitGraph from './components/CommitGraph.jsx'
import CommitDetail from './components/CommitDetail.jsx'
import PreviewBanner from './components/PreviewBanner.jsx'
import ModeStatusBar from './components/ModeStatusBar.jsx'
import IfLinesPanel from './components/IfLinesPanel.jsx'
import { useSession } from './state/useSession.js'
import './App.css'

export default function App() {
  const [adapter, setAdapter] = useState(null)
  const [branches, setBranches] = useState([])
  const [refreshKey, setRefreshKey] = useState(0) // commit 后 ++ 触发 CommitGraph 重新拉
  const session = useSession()

  // 拉 branches 列表 + 选 main · adapter 切换 OR 用户 commit 后都要重拉
  useEffect(() => {
    if (!adapter) return
    let cancelled = false
    adapter
      .listBranches()
      .then((refs) => {
        if (cancelled) return
        setBranches(refs)
        const names = refs.map((r) => r.name)
        const main = names.includes('main')
          ? 'main'
          : names.includes('master')
            ? 'master'
            : names[0] || 'main'
        const mainRef = refs.find((r) => r.name === main)
        // 首次加载（refreshKey === 0）才 setupRepo · 后续 commit 触发的 refresh 不应 reset session
        if (refreshKey === 0) {
          session.setupRepo(names, mainRef ? mainRef.oid : null)
        }
      })
      .catch(() => {
        if (refreshKey === 0) session.setupRepo(['main'], null)
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
      <div className="app start">
        <header className="app-header">
          <h1>gitviz</h1>
          <p>Browse a git repo visually. Local folders or any GitHub repo.</p>
          <p className="tagline">Past commits are save slots. Edit anything to fork an if-line.</p>
        </header>
        <RepoLoader onLoaded={(a) => setAdapter(a)} />
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
      session.leaveToBrowse()
      return
    }
    session.enterPreview(oid)
  }

  return (
    <div className="app loaded">
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
            onSwitched={(name, oid) => session.switchToBranch(name, oid)}
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

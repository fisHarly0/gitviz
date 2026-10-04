// IfLinesPanel · graph-pane 顶部分支切换条
// 显示 main 主线 + 所有 if-* 分支 · 点击切换 checkout 该分支 HEAD
// 当 currentBranch 是 if-* 时末尾显示 Export 按钮导出 .zip

import { isIfBranch } from '../state/useSession.js'
import { useState } from 'react'
import ExportButton from './ExportButton.jsx'

function short(oid) {
  return oid ? oid.slice(0, 7) : '?'
}

export default function IfLinesPanel({
  branches, // [{ name, oid }]
  currentBranch,
  mainBranch,
  adapter,
  onSwitched, // (branchName, headOid) => void
  headOid,
  editing,
}) {
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  if (!branches || branches.length === 0) return null

  const mainRef = branches.find((b) => b.name === mainBranch)
  const ifBranches = branches.filter((b) => isIfBranch(b.name))

  const switchTo = async (b) => {
    if (busy || b.name === currentBranch) return
    setBusy(true)
    setError('')
    try {
      if (typeof adapter.checkout === 'function') {
        const result = await adapter.checkout(b.name, { head: headOid, branch: currentBranch })
        if (result.cancelled) return
        onSwitched(result.branch, result.head)
        return
      }
      onSwitched(b.name, b.oid)
    } catch (err) {
      setError(err.message || String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="if-lines-panel">
      <div className="if-lines-row">
        <span className="lbl">branches</span>
        {mainRef && (
          <button
            className={`branch-chip main ${currentBranch === mainBranch ? 'active' : ''}`}
            onClick={() => switchTo(mainRef)}
            disabled={busy || editing}
            title={`switch to ${mainBranch} (HEAD = ${short(mainRef.oid)})`}
          >
            <span className="dot" />
            {mainBranch}
            <code>{short(mainRef.oid)}</code>
          </button>
        )}
        {ifBranches.map((b, i) => (
          <button
            key={b.name}
            className={`branch-chip if i${i % 5} ${currentBranch === b.name ? 'active' : ''}`}
            onClick={() => switchTo(b)}
            disabled={busy || editing}
            title={`switch to ${b.name} (HEAD = ${short(b.oid)})`}
          >
            <span className="dot" />
            {b.name}
            <code>{short(b.oid)}</code>
          </button>
        ))}
        {ifBranches.length === 0 && (
          <span className="empty-hint">{adapter.kind() === 'local' ? 'Preview an old commit and edit a file to create an if-line.' : 'Read-only GitHub repository.'}</span>
        )}
        {isIfBranch(currentBranch) && typeof adapter.exportBranchAsBundle === 'function' && (
          <span className="export-slot">
            <ExportButton adapter={adapter} branchName={currentBranch} />
          </span>
        )}
      </div>
      {error && <div className="error" role="alert">Could not switch branch: {error}</div>}
    </div>
  )
}

// IfLinesPanel · graph-pane 顶部分支切换条
// 显示全部本地分支 · 点击确认后切换真实 HEAD 与文件
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
  dirty,
  onRefresh,
}) {
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const readOnly = adapter.kind() !== 'local'
  if (!branches || branches.length === 0) return null

  const mainRef = branches.find((b) => b.name === mainBranch)
  const otherBranches = branches.filter((b) => b.name !== mainBranch)

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
      onRefresh?.()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="if-lines-panel">
      <div className="if-lines-row">
        <span className="lbl">{readOnly ? '远程分支' : '本地分支'}</span>
        {mainRef && (
          <button
            className={`branch-chip main ${currentBranch === mainBranch ? 'active' : ''}`}
            onClick={() => switchTo(mainRef)}
            disabled={busy || editing || dirty}
            aria-pressed={currentBranch === mainBranch}
            title={readOnly ? `查看 ${mainBranch}（${short(mainRef.oid)}），不切换仓库` : `切换到 ${mainBranch}（HEAD = ${short(mainRef.oid)}）`}
          >
            <span className="dot" />
            {mainBranch}
            <code>{short(mainRef.oid)}</code>
          </button>
        )}
        {otherBranches.map((b, i) => (
          <button
            key={b.name}
            className={`branch-chip if i${i % 5} ${currentBranch === b.name ? 'active' : ''}`}
            onClick={() => switchTo(b)}
            disabled={busy || editing || dirty}
            aria-pressed={currentBranch === b.name}
            title={readOnly ? `查看 ${b.name}（${short(b.oid)}），不切换仓库` : `切换到 ${b.name}（HEAD = ${short(b.oid)}）`}
          >
            <span className="dot" />
            {b.name}
            <code>{short(b.oid)}</code>
          </button>
        ))}
        {otherBranches.length === 0 && (
          <span className="empty-hint">{adapter.kind() === 'local' ? '选择存档，可建分支或在独立目录试一版。' : 'GitHub 仓库只读。'}</span>
        )}
        {isIfBranch(currentBranch) && typeof adapter.exportBranchAsBundle === 'function' && (
          <span className="export-slot">
            <ExportButton adapter={adapter} branchName={currentBranch} disabled={busy || editing} />
          </span>
        )}
      </div>
      {error && <div className="error" role="alert">分支未切换：{error}</div>}
    </div>
  )
}

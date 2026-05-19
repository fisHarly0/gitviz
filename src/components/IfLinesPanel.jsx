// IfLinesPanel · graph-pane 顶部分支切换条
// 显示 main 主线 + 所有 if-* 分支 · 点击切换 checkout 该分支 HEAD
// 当 currentBranch 是 if-* 时末尾显示 Export 按钮导出 .zip

import { isIfBranch } from '../state/useSession.js'
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
}) {
  if (!branches || branches.length === 0) return null

  const mainRef = branches.find((b) => b.name === mainBranch)
  const ifBranches = branches.filter((b) => isIfBranch(b.name))

  const switchTo = async (b) => {
    if (b.name === currentBranch) return
    try {
      if (typeof adapter.checkout === 'function') {
        await adapter.checkout(b.name)
      }
      onSwitched(b.name, b.oid)
    } catch (err) {
      console.error('switch failed:', err)
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
            title={`switch to ${b.name} (HEAD = ${short(b.oid)})`}
          >
            <span className="dot" />
            {b.name}
            <code>{short(b.oid)}</code>
          </button>
        ))}
        {ifBranches.length === 0 && (
          <span className="empty-hint">// no if-lines yet · preview an old commit and edit a file to fork one</span>
        )}
        {isIfBranch(currentBranch) && (
          <span className="export-slot">
            <ExportButton adapter={adapter} branchName={currentBranch} />
          </span>
        )}
      </div>
    </div>
  )
}

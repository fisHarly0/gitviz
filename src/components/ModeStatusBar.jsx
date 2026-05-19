// 底部状态栏 · 单行显示当前 mode + branch + HEAD + 改动计数

function short(oid) {
  return oid ? oid.slice(0, 7) : '?'
}

export default function ModeStatusBar({
  mode,
  currentBranch,
  viewingOid,
  currentIfBranch,
  changedFilesInIf,
  headOid,
}) {
  let cls = 'mode-status-bar'
  let content

  if (mode === 'browse') {
    content = (
      <>
        <span className="tag browse">BROWSE</span>
        <span>
          on <code>{currentBranch}</code> · HEAD = <code>{short(headOid)}</code>
        </span>
      </>
    )
  } else if (mode === 'preview') {
    cls += ' preview'
    content = (
      <>
        <span className="tag preview">PREVIEW</span>
        <span>
          looking at <code>{short(viewingOid)}</code> on <code>{currentBranch}</code> · no changes yet ·
          edit to fork an if-line
        </span>
      </>
    )
  } else if (mode === 'edit') {
    cls += ' edit'
    content = (
      <>
        <span className="tag edit">EDIT</span>
        <span>
          on if-line <code>{currentIfBranch}</code> · {changedFilesInIf} file
          {changedFilesInIf === 1 ? '' : 's'} committed · Save &amp; Commit to write more
        </span>
      </>
    )
  } else {
    content = <span className="tag">?</span>
  }

  return <div className={cls}>{content}</div>
}

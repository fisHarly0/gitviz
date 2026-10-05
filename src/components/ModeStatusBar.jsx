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
  readOnly = false,
}) {
  let cls = 'mode-status-bar'
  let content

  if (mode === 'browse') {
    content = (
      <>
        <span className="tag browse">浏览</span>
        <span>
          {headOid ? <>{readOnly ? '远程浏览基准' : '实际位置'} <code>{currentBranch || '游离 HEAD'}</code> · {readOnly ? '' : 'HEAD '}<code>{short(headOid)}</code></> : readOnly ? '正在读取远程分支' : '尚无可显示的 HEAD'}
        </span>
      </>
    )
  } else if (mode === 'preview') {
    cls += ' preview'
    content = (
      <>
        <span className="tag preview">预览</span>
        <span>
          查看 <code>{short(viewingOid)}</code> · {readOnly ? '浏览基准' : '实际 HEAD'} <code>{short(headOid)}</code> ·{' '}
          {readOnly ? 'GitHub 只读' : '工作文件未切换'}
        </span>
      </>
    )
  } else if (mode === 'edit') {
    cls += ' edit'
    content = (
      <>
        <span className="tag edit">编辑</span>
        <span>
          试验分支 <code>{currentIfBranch}</code> · 本次已提交 {changedFilesInIf} 次 · 保存并提交会写入工作文件
        </span>
      </>
    )
  } else {
    content = <span className="tag">?</span>
  }

  return <div className={cls}>{content}</div>
}

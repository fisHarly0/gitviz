// preview 模式顶部横幅 · 提示用户"你在看过去存档 · 修改 = 自动起 if 线"

export default function PreviewBanner({ viewingOid, currentBranch, onReturn, readOnly = false }) {
  const short = viewingOid ? viewingOid.slice(0, 7) : '?'
  return (
    <div className="preview-banner" role="status">
      <span className="badge">预览</span>
      <span className="msg">
        正在查看存档 <code>{short}</code>。{readOnly ? 'GitHub 历史只读。' : '工作文件未切换；编辑前会确认创建并切换到试验分支。'}
      </span>
      <button className="return-btn" onClick={onReturn}>
        {readOnly ? '返回远程分支顶端' : '返回实际位置'}{currentBranch ? `（${currentBranch}）` : readOnly ? '' : '（游离 HEAD）'}
      </button>
    </div>
  )
}

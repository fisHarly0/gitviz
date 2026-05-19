// preview 模式顶部横幅 · 提示用户"你在看过去存档 · 修改 = 自动起 if 线"

export default function PreviewBanner({ viewingOid, currentBranch, onReturn }) {
  const short = viewingOid ? viewingOid.slice(0, 7) : '?'
  return (
    <div className="preview-banner" role="alert">
      <span className="badge">PREVIEW</span>
      <span className="msg">
        You are looking at past commit <code>{short}</code> on <code>{currentBranch}</code>.
        Make any edit to fork into a new <strong>if-line</strong>.
      </span>
      <button className="return-btn" onClick={onReturn}>
        ← back to {currentBranch} HEAD
      </button>
    </div>
  )
}

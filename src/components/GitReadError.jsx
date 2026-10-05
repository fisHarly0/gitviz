export default function GitReadError({ message }) {
  if (!message.startsWith('无法启动 Git')) return <p role="alert">{message}</p>
  return <div className="git-read-error" role="alert">
    <p>Git 未能启动，暂时无法读取本地历史。</p>
    <p>在终端运行 <code>git --version</code>，并确认仓库目录仍然存在。若命令不可用，请安装 Git 并将它加入 PATH。</p>
    <p>安装或修改 PATH 后，完全退出并重新打开 Gitviz，再打开这个仓库。若只是修正了目录或访问权限，可直接重新读取。</p>
    <details><summary>查看详细原因</summary><p>{message}</p></details>
  </div>
}

// A normal close reserves the same gate as Git writes and exports.
export function createDesktopCloseController({ isActive, run, confirm, readDraft, destroy, report }) {
  let closing = false, disposed = false
  return {
    dispose() { disposed = true },
    async request() {
      if (disposed || closing) return
      if (isActive()) {
        report({ kind: 'busy', text: '操作或确认尚未结束，请先完成或取消，再关闭窗口。' })
        return
      }
      closing = true
      report(null)
      try {
        await run(async () => {
          const draft = readDraft()
          if (draft?.dirty && !await confirm({
            title: '关闭并放弃未保存的编辑？',
            impact: '尚未保存到磁盘的编辑内容和提交说明将丢弃。已写入的文件、暂存更改、分支和操作记录都会保留。',
            files: [draft.path],
            confirmLabel: '放弃编辑并关闭',
          })) return
          if (!disposed) await destroy()
        })
      } catch (error) {
        if (!disposed) report({ kind: 'error', text: `窗口未关闭：${error?.message || String(error)}。请重试关闭。` })
      } finally { closing = false }
    },
  }
}

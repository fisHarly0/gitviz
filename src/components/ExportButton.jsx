// 导出 if 分支为 .zip 含 git loose objects + ref + HEAD + README
// 解压后 git fetch 进真仓库即可（README 含命令模板）

import { useState } from 'react'
import { save } from '@tauri-apps/plugin-dialog'
import { invoke } from '@tauri-apps/api/core'

async function getJSZip() {
  const mod = await import('jszip')
  return mod.default || mod
}

export default function ExportButton({ adapter, branchName }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const handleExport = async () => {
    if (busy) return
    if (typeof adapter.exportBranchAsBundle !== 'function') {
      setError('adapter does not support export')
      return
    }
    setBusy(true)
    setError('')
    try {
      const { objects, ref, headOid } = await adapter.exportBranchAsBundle(branchName)

      // 先弹保存对话框, 用户取消就直接退出
      const targetPath = await save({
        defaultPath: `${ref}.zip`,
        filters: [{ name: 'Zip Archive', extensions: ['zip'] }],
      })
      if (!targetPath) {
        setBusy(false)
        return
      }

      const JSZip = await getJSZip()
      const zip = new JSZip()
      let totalBytes = 0
      for (const o of objects) {
        zip.file(`objects/${o.path}`, o.bytes)
        totalBytes += o.bytes.byteLength
      }
      zip.file(`refs/heads/${ref}`, headOid + '\n')
      zip.file('HEAD', `ref: refs/heads/${ref}\n`)
      zip.file(
        'README.txt',
        `gitviz exported if-line: ${ref}
HEAD: ${headOid}
objects: ${objects.length} loose objects (${totalBytes} bytes total, zlib-compressed)

== Import into your real git repo ==

1) Unzip to a temp dir, e.g.:
     unzip ${ref}.zip -d /tmp/gitviz-import

2) From your real repo, fetch the branch:
     cd /path/to/real/repo
     git fetch /tmp/gitviz-import ${ref}:${ref}-imported

3) Checkout to inspect:
     git checkout ${ref}-imported

4) Push to remote if you like:
     git push origin ${ref}-imported

Notes:
- 用 loose objects 格式（每个 git object 一个文件 in objects/ab/cdef.../）
  git fetch 会自动找它们，不需要 .idx
- 如果 'git fetch' 报缺 object，检查 objects/ 下文件数 = ${objects.length}
- 想转成 packfile 节省空间，可在 import 后跑：
     cd /path/to/real/repo && git gc --aggressive
`,
      )
      const zipBytes = await zip.generateAsync({ type: 'uint8array' })
      // Tauri 2 webview 不接 a.click + blob URL 下载, 必须走 dialog.save + Rust 写盘
      await invoke('save_export_zip', { path: targetPath, bytes: Array.from(zipBytes) })
    } catch (err) {
      setError(err?.message || String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button onClick={handleExport} disabled={busy} className="export-btn" title={`Export ${branchName} as .zip`}>
        {busy ? 'Packing...' : `↓ Export ${branchName}`}
      </button>
      {error && <span className="export-error">! {error}</span>}
    </>
  )
}

// 导出 if 分支为 .zip 含 git pack + ref + import README
// 用户解压到任意目录后 git fetch 进真仓库即可（README 含命令模板）

import { useState } from 'react'

async function getJSZip() {
  // 动态 import 减少首屏包
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
      const { packfile, packname, ref, headOid } = await adapter.exportBranchAsBundle(branchName)
      const JSZip = await getJSZip()
      const zip = new JSZip()
      // 标准 git dir layout（最小子集）
      zip.file(`objects/pack/${packname}`, packfile)
      zip.file(`refs/heads/${ref}`, headOid + '\n')
      zip.file('HEAD', `ref: refs/heads/${ref}\n`)
      zip.file(
        'README.txt',
        `gitviz exported if-line: ${ref}
HEAD: ${headOid}
packfile: ${packname} (${packfile.byteLength} bytes)

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
- git will auto-build the pack .idx on first fetch (no need to ship it).
- If 'git fetch' complains about missing objects, run:
     cd /tmp/gitviz-import && git index-pack objects/pack/${packname}
  then retry the fetch.
`,
      )
      const blob = await zip.generateAsync({ type: 'blob' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${ref}.zip`
      document.body.appendChild(a)
      a.click()
      a.remove()
      // 延迟 revoke 让浏览器下载完
      setTimeout(() => URL.revokeObjectURL(url), 4000)
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

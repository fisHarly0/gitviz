import { useEffect, useId, useRef } from 'react'
import './operation-dialog.css'

export default function OperationDialog({ request, onAnswer }) {
  const dialog = useRef(null), title = useId()
  useEffect(() => {
    if (!request) return
    const previous = document.activeElement
    const element = dialog.current
    element.showModal()
    return () => { element.close(); previous?.focus?.() }
  }, [request])
  if (!request) return null
  return <dialog ref={dialog} className="operation-dialog" aria-labelledby={title} onCancel={event => { event.preventDefault(); onAnswer(false) }}>
    <h2 id={title}>{request.title || '确认 Git 操作'}</h2>
    <p>{request.impact}</p>
    {request.expected && <dl><dt>仓库</dt><dd>{request.expected.repo}</dd><dt>实际位置</dt><dd>{request.expected.branch || '游离 HEAD'} · <code>{request.expected.head.slice(0, 7)}</code></dd></dl>}
    {(request.target || request.branchName || request.directory) && <dl>{request.target && <><dt>目标存档</dt><dd><code>{request.target}</code></dd></>}{request.branchName && <><dt>分支名称</dt><dd>{request.branchName}</dd></>}{request.directory && <><dt>试验父目录</dt><dd>{request.directory}<br/>将在这里新建独立子目录。</dd></>}</dl>}
    {request.files?.length > 0 && <><h3>{request.filesLabel || '涉及文件'}（{request.files.length}）</h3><ul>{request.files.slice(0, 100).map(file => <li key={file}><code>{file}</code></li>)}</ul>{request.files.length > 100 && <p>列表显示前 100 个文件。</p>}</>}
    <div className="operation-dialog-actions"><button autoFocus onClick={() => onAnswer(false)}>取消</button><button onClick={() => onAnswer(true)}>{request.confirmLabel || '确认操作'}</button></div>
  </dialog>
}

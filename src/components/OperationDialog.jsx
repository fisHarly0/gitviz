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
    {request.files?.length > 0 && <><h3>涉及 {request.files.length} 个文件</h3><ul>{request.files.slice(0, 100).map(file => <li key={file}><code>{file}</code></li>)}</ul>{request.files.length > 100 && <p>列表显示前 100 个文件。</p>}</>}
    <div className="operation-dialog-actions"><button autoFocus onClick={() => onAnswer(false)}>取消</button><button onClick={() => onAnswer(true)}>{request.confirmLabel || '确认操作'}</button></div>
  </dialog>
}

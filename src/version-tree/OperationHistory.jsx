import { useEffect, useRef, useState } from 'react'

const actions = { createBranch: '创建分支', switchBranch: '切换分支', createWorktree: '创建试验工作区', forkEdit: '创建编辑分支', saveEdit: '保存并提交', restore: '恢复存档' }
const states = { running: '进行中或已中断', completed: '已完成', failed: '未完成', unreadable: '记录无法读取' }
const text = value => typeof value === 'string' ? value : ''

export default function OperationHistory({ load, onResume, refreshKey, blocked, editing }) {
  const [open, setOpen] = useState(false), [records, setRecords] = useState([]), [cursor, setCursor] = useState(null)
  const [loading, setLoading] = useState(false), [error, setError] = useState(''), [revision, setRevision] = useState(0)
  const sequence = useRef(0)
  // DSH supplies its own React; shared components also support its older hooks.
  const reader = useRef(load)
  useEffect(() => { reader.current = load }, [load])
  useEffect(() => {
    if (!open || blocked) return
    const id = ++sequence.current
    ;(async () => {
      setLoading(true)
      try {
        const result = await reader.current({})
        if (id === sequence.current) { setRecords(result.records); setCursor(result.nextCursor) }
      } catch (reason) { if (id === sequence.current) setError(reason.message || String(reason)) }
      finally { if (id === sequence.current) setLoading(false) }
    })()
    return () => { sequence.current += 1 }
  }, [open, refreshKey, revision, blocked])
  const more = async () => {
    const id = ++sequence.current
    setLoading(true); setError('')
    try {
      const result = await load({ before: cursor })
      if (id === sequence.current) { setRecords(previous => [...previous, ...result.records]); setCursor(result.nextCursor) }
    } catch (reason) { if (id === sequence.current) setError(reason.message || String(reason)) }
    finally { if (id === sequence.current) setLoading(false) }
  }
  const resume = async record => {
    setError('')
    try { const result = await onResume(record); if (result?.error) setError(result.error) }
    catch (reason) { setError(reason.message || String(reason)) }
    finally { setRevision(value => value + 1) }
  }
  return <details className="operation-history" onToggle={event => { if (event.target === event.currentTarget) setOpen(event.currentTarget.open) }}>
    <summary>操作记录与恢复</summary>
    {open && <div className="operation-history-content">
      <div className="operation-history-toolbar"><span>当前工作区的记录，重新打开后仍可查看。</span><button disabled={loading || blocked} onClick={() => { setError(''); setRevision(value => value + 1) }}>刷新记录</button></div>
      {loading && <p role="status">正在读取操作记录…</p>}
      {error && <p className="operation-history-error" role="alert">{error}</p>}
      {editing && <p>先结束文件编辑，再继续失败的提交；工作文件和暂存更改会保留。</p>}
      {!loading && !records.length && !error && <p>还没有操作记录。取消确认不会留下执行记录。</p>}
      <div className="operation-history-list">{records.map(record => <details className="operation-record" key={record.id}>
        <summary><span>{actions[record.action] || 'Git 操作'} · {states[record.state] || '未知状态'}</span><time>{Number.isFinite(record.startedAt) ? new Date(record.startedAt).toLocaleString() : ''}</time></summary>
        <dl><dt>记录编号</dt><dd><code>{text(record.id)}</code></dd>{record.before && <><dt>开始位置</dt><dd>{text(record.before.branch) || '游离 HEAD'} · <code>{text(record.before.head).slice(0, 7)}</code></dd></>}{record.params?.oid && <><dt>目标存档</dt><dd><code>{text(record.params.oid).slice(0, 7)}</code></dd></>}{record.params?.name && <><dt>分支</dt><dd>{text(record.params.name)}</dd></>}{record.params?.path && <><dt>文件</dt><dd>{text(record.params.path)}</dd></>}{record.backup && <><dt>恢复前备份</dt><dd><code>{text(record.backup)}</code></dd></>}{record.worktree && <><dt>试验工作区</dt><dd><code>{text(record.worktree)}</code></dd></>}{record.result?.head && <><dt>结束位置</dt><dd>{text(record.result.branch) || '游离 HEAD'} · <code>{text(record.result.head).slice(0, 7)}</code></dd></>}{record.attempts > 1 && <><dt>尝试次数</dt><dd>{Number(record.attempts)}</dd></>}</dl>
        {record.state === 'running' && <p>操作可能仍在执行，或上次意外中断。请先检查 Git 状态；不会自动重试或删除锁。</p>}
        {(record.error || record.lastError) && <p className={record.error ? 'operation-history-error' : ''}>{!record.error && '此前失败：'}{text(record.error || record.lastError)}</p>}
        {record.state === 'failed' && record.checkpoint && <><p>解决身份、签名或钩子问题后，可检查并继续提交。暂存区和文件有新变化时会拒绝。</p><button disabled={blocked || editing || loading} onClick={() => resume(record)}>检查并继续提交</button></>}
      </details>)}</div>
      {cursor && <button disabled={loading || blocked} onClick={more}>加载更早的记录</button>}
    </div>}
  </details>
}

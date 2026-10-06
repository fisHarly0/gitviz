import { useRef, useState } from 'react'
import './desktop-actions.css'

export default function DesktopActions({ adapter, oid, snapshot, blocked, editing, onResult, onRefresh, onOpenWorktree, onOpenRecords }) {
  const [draft, setDraft] = useState(null), [error, setError] = useState(''), [result, setResult] = useState(null)
  const [pending, setPending] = useState(false), active = useRef(false)
  const disabled = blocked || pending || !snapshot?.head || !oid
  const form = draft?.oid === oid ? draft : null
  const expected = () => ({ head: snapshot.head, branch: snapshot.branch })

  const begin = action => {
    setError(''); setResult(null)
    setDraft({ action, oid, name: `if-${oid.slice(0, 7)}-${Date.now().toString(36)}`, directory: '' })
  }
  const execute = async (action, baseline) => {
    if (active.current || disabled) return
    active.current = true; setPending(true); setError(''); setResult(null)
    try {
      const value = await adapter.performAction(action, baseline)
      if (value.cancelled) return
      setResult({ ...value, action: action.action, name: action.name }); setDraft(null)
      onResult(value, action.action)
    } catch (reason) {
      setError(reason.message || String(reason)); onRefresh()
    } finally { active.current = false; setPending(false) }
  }
  const chooseDirectory = async () => {
    try {
      const path = await adapter.chooseWorktreeParent()
      if (path) setDraft(value => ({ ...value, directory: path }))
    } catch (reason) { setError(reason.message || String(reason)) }
  }
  const openWorktree = async () => {
    if (active.current || disabled) return
    active.current = true; setPending(true); setError('')
    try { await onOpenWorktree(result.worktree) }
    catch (reason) { setError(reason.message || String(reason)) }
    finally { active.current = false; setPending(false) }
  }

  return <section className="desktop-actions" aria-label="存档操作" aria-busy={pending}>
    <div className="desktop-action-heading"><h2>存档操作</h2><span>{oid ? <>目标 <code>{oid.slice(0, 7)}</code></> : '选择地图节点以查看操作'}</span></div>
    {oid && <p className="desktop-action-context">先查看下方文件变化。想基于 <code>{oid.slice(0, 7)}</code> 尝试修改，可以从这里试一版。</p>}
    <div className="desktop-action-buttons">
      <button disabled={disabled} onClick={() => begin('createWorktree')}>从这里试一版</button>
      <button disabled={disabled} onClick={() => begin('createBranch')}>建分支</button>
      <button disabled={disabled || snapshot?.dirty || !snapshot?.branch || oid === snapshot?.head} onClick={() => execute({ action: 'restore', oid }, expected())}>恢复此存档</button>
    </div>
    <p className="desktop-action-hint">试验使用独立目录；建分支保留当前位置；恢复会备份并创建新提交。</p>
    {editing && <p className="desktop-action-hint">请先完成或取消文件编辑，再操作其他存档。</p>}
    {snapshot?.dirty && <p className="desktop-action-hint">有未提交修改，切换和恢复暂不可用。可以创建独立试验目录。</p>}
    {snapshot?.head && !snapshot.branch && <p className="desktop-action-hint">当前为游离 HEAD。可以建分支，再从分支栏切换后恢复。</p>}
    {form && <form className="desktop-action-form" onSubmit={event => { event.preventDefault(); execute({ ...form, name: form.name.trim(), directory: form.directory.trim() }, expected()) }}>
      <label>新分支名称<input required maxLength={150} value={form.name} disabled={disabled} onChange={event => setDraft({ ...form, name: event.target.value })}/></label>
      {form.action === 'createWorktree' && <label>试验工作区的父目录<div className="desktop-directory-field"><input required value={form.directory} disabled={disabled} placeholder="输入绝对路径，或选择文件夹" onChange={event => setDraft({ ...form, directory: event.target.value })}/><button type="button" disabled={disabled} onClick={chooseDirectory}>选择目录</button></div><span className="desktop-action-hint">将在此目录下新建文件夹，不修改原仓库的文件。</span></label>}
      <div className="desktop-action-buttons"><button type="submit" disabled={disabled}>预览{form.action === 'createWorktree' ? '试验工作区' : '分支创建'}</button><button type="button" disabled={disabled} onClick={() => setDraft(null)}>取消填写</button></div>
    </form>}
    {pending && <p role="status">正在处理，请查看操作确认。</p>}
    {error && <div role="alert" className="desktop-action-error"><p><strong>操作未完成</strong>，请先检查实际状态与操作记录。</p><details><summary>查看错误详情</summary><p>{error}</p></details><div className="desktop-action-buttons"><button disabled={blocked || pending} onClick={onOpenRecords}>查看操作记录</button><button disabled={blocked || pending} onClick={onRefresh}>刷新实际状态</button></div></div>}
    {result && <div className="desktop-action-result" role="status">
      {result.action === 'createBranch' && <p>已创建分支 <strong>{result.name}</strong>，当前文件未切换。可从分支栏切换。</p>}
      {result.worktree && <><p>试验工作区已创建，原仓库保持不变。</p><code>{result.worktree}</code><p>打开后可从顶部返回上个仓库，试验目录会保留。</p><button disabled={disabled} onClick={openWorktree}>在地图中打开试验工作区</button></>}
      {result.backup && <><p>已恢复为新提交 <code>{result.head.slice(0, 7)}</code>，后续历史保留。</p><p>恢复前的位置保存在分支：</p><code>{result.backup}</code></>}
    </div>}
  </section>
}

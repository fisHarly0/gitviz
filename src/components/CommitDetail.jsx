import { useEffect, useState } from 'react'
import ReactDiffViewer from 'react-diff-viewer-continued'
import EditorPanel from './EditorPanel.jsx'
import { makeIfBranchName } from '../state/useSession.js'
import { githubErrorMessage } from '../adapters/githubHistory.js'

function StatusBadge({ status }) {
  const colors = {
    add: '#2da44e',
    modify: '#bf8700',
    remove: '#cf222e',
    rename: '#0969da',
  }
  return (
    <span
      className="status-badge"
      style={{ background: colors[status] || '#666' }}
    >
      {{ add: '新增', modify: '修改', remove: '删除', rename: '重命名' }[status] || status}
    </span>
  )
}

function CommitDetailSkeleton() {
  return (
    <div className="commit-detail" role="status" aria-label="正在读取提交详情">
      <header>
        <div className="skel-line oid" />
        <div className="skel-line msg" style={{ marginTop: 8 }} />
        <div className="skel-line meta" style={{ marginTop: 6 }} />
      </header>
      <div className="files-and-diff">
        <ul className="file-list" style={{ padding: '12px' }}>
          <li style={{ display: 'block', padding: '6px 0' }}>
            <div className="skel-line file" />
          </li>
          <li style={{ display: 'block', padding: '6px 0' }}>
            <div className="skel-line file short" />
          </li>
          <li style={{ display: 'block', padding: '6px 0' }}>
            <div className="skel-line file" />
          </li>
        </ul>
        <div className="diff-pane" style={{ padding: 12 }}>
          <div className="skel-block" />
          <div className="skel-block" style={{ marginTop: 10, height: 80 }} />
        </div>
      </div>
    </div>
  )
}

function PatchView({ patch, remote }) {
  if (!patch) return <div className="muted">{remote ? 'GitHub 未提供这个文件的文本差异，可能是二进制文件或差异过大。可在 GitHub 查看原提交；这不表示文件没有变化。' : '没有可显示的文本差异。'}</div>
  return (
    <pre className="patch">
      {patch.split('\n').map((line, i) => {
        let cls = ''
        if (line.startsWith('+') && !line.startsWith('+++')) cls = 'add'
        else if (line.startsWith('-') && !line.startsWith('---')) cls = 'rem'
        else if (line.startsWith('@@')) cls = 'hunk'
        return (
          <span key={i} className={cls}>
            {line}
            {'\n'}
          </span>
        )
      })}
    </pre>
  )
}

export default function CommitDetail({ adapter, oid, session, onCommitted, onDraft, blocked }) {
  const [detail, setDetail] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [activeFile, setActiveFile] = useState(null)
  const [editError, setEditError] = useState('')
  const [editBusy, setEditBusy] = useState(false)
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    if (!oid) return
    let cancelled = false
    const controller = new AbortController()
    ;(async () => {
      // deps 变化时 reset，lint 对此误报 set-state-in-effect
      setLoading(true)
      setError('')
      setActiveFile(null)
      try {
        const d = await adapter.getCommitDetail(oid, { signal: controller.signal })
        if (cancelled) return
        setDetail(d)
        if (d.files.length > 0) setActiveFile(d.files[0].path)
        setLoading(false)
      } catch (err) {
        if (cancelled) return
        setError(adapter.kind() === 'github' ? githubErrorMessage(err) : err.message || String(err))
        setLoading(false)
      }
    })()
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [adapter, oid, revision])

  if (!oid) {
    return <div className="placeholder">选择地图中的存档，查看提交说明和文件变化。</div>
  }
  if (loading) return <CommitDetailSkeleton />
  if (error) return <div className="detail-read-error"><p className="error" role="alert">{error}</p><button onClick={() => setRevision(value => value + 1)}>重新读取详情</button></div>
  if (!detail) return null

  const { commit, files } = detail
  const file = files.find((f) => f.path === activeFile)
  const useSideBySide =
    file && typeof file.oldText === 'string' && typeof file.newText === 'string' && !file.patch

  const canEdit =
    !!session &&
    (session.mode === 'preview' || session.mode === 'edit' || (session.mode === 'browse' && session.currentIfBranch)) &&
    adapter.kind() === 'local' &&
    typeof adapter.forkEdit === 'function'

  const handleEdit = async (filepath) => {
    if (!session || editBusy || blocked) return
    setEditBusy(true)
    setEditError('')
    try {
      let ifBranchName = session.currentIfBranch
      // preview 状态首次按 Edit → 起新 if 分支
      if (session.mode === 'preview' || !ifBranchName) {
        const counter = session.allocateIfCounter()
        ifBranchName = makeIfBranchName(oid.slice(0, 7), counter)
        const result = await adapter.forkEdit(ifBranchName, oid, { head: session.headOid, branch: session.currentBranch })
        if (result.cancelled) return
        session.startEdit(filepath, result.branch, result.head)
        onCommitted?.()
        return
      }
      session.startEdit(filepath, ifBranchName)
    } catch (err) {
      setEditError(err?.message || String(err))
    } finally { setEditBusy(false) }
  }

  const handleSaveCommit = async (newContent, commitMsg) => {
    const filepath = session.editingFile
    if (!filepath) throw new Error('尚未选择要编辑的文件。')
    const result = await adapter.saveEdit(filepath, newContent, commitMsg, { head: session.headOid, branch: session.currentBranch })
    if (result.cancelled) return { cancelled: true }
    session.onCommitInIf(result.head)
    if (onCommitted) onCommitted()
  }

  const handleCancelEdit = () => {
    // 仅退出当前文件编辑回 file list · 不退 edit 模式 · 也不删 if 分支
    session.startEdit(null, session.currentIfBranch)
  }

  // === edit 模式且选中了某文件 → 渲染 EditorPanel ===
  if (session && session.mode === 'edit' && session.editingFile) {
    return (
      <EditEnter
        adapter={adapter}
        filepath={session.editingFile}
        ifBranchName={session.currentIfBranch}
        sourceOid={session.headOid}
        onSave={handleSaveCommit}
        onCancel={handleCancelEdit}
        confirm={adapter.confirmDiscard}
        onDraft={onDraft}
      />
    )
  }

  return (
    <div className="commit-detail">
      <header>
        <div className="oid">{commit.oid}</div>
        <div className="msg">{commit.fullMessage}</div>
        <div className="meta">
          {commit.author} ·{' '}
          {new Date(commit.timestamp * 1000).toLocaleString()}
        </div>
        <p className="diff-baseline">下方显示这次提交相对父提交的文件变化；合并提交以第一个父提交为基准，首次提交以空版本为基准。</p>
        {detail.url && <p className="diff-baseline">{detail.filesPartial ? `当前仅显示前 ${files.length} 个变化文件，列表不完整。` : '文本差异由 GitHub 提供，可能省略或截断。'} <a href={detail.url} target="_blank" rel="noreferrer">在 GitHub 查看原提交</a></p>}
      </header>

      {editError && <div className="error edit-error">! {editError}</div>}

      <div className="files-and-diff">
        <ul className="file-list">
          {files.length === 0 && (
            <li className="muted">没有文件变化，可能是合并或空提交。</li>
          )}
          {files.map((f) => (
            <li
              key={f.path}
              className={f.path === activeFile ? 'active' : ''}
            >
              <button type="button" className="file-row-main" onClick={() => setActiveFile(f.path)} aria-pressed={f.path === activeFile}>
                <StatusBadge status={f.status} />
                <span className="path">{f.path}</span>
              </button>
              {canEdit && f.status !== 'remove' && (
                <button
                  className="edit-file-btn"
                  disabled={editBusy || blocked}
                  onClick={() => handleEdit(f.path)}
                  title={
                    session.mode === 'preview'
                      ? '编辑前将确认创建并切换到新的试验分支'
                      : '在当前试验分支编辑这个文件'
                  }
                >
                  编辑文件
                </button>
              )}
            </li>
          ))}
        </ul>

        <div className="diff-pane">
          {file && useSideBySide && (
            <ReactDiffViewer
              oldValue={file.oldText || ''}
              newValue={file.newText || ''}
              splitView
              useDarkTheme
            />
          )}
          {file && !useSideBySide && <PatchView patch={file.patch} remote={adapter.kind() === 'github'} />}
          {!file && <div className="muted">选择文件以查看差异。</div>}
        </div>
      </div>
    </div>
  )
}

// 进入 edit 模式后异步拉初始内容（从 sourceOid 时刻读文件 · 不是从当前 HEAD）
function EditEnter({ adapter, filepath, ifBranchName, sourceOid, onSave, onCancel, confirm, onDraft }) {
  const [initial, setInitial] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (typeof adapter.readFileAt !== 'function') {
        setError('adapter does not support readFileAt')
        return
      }
      try {
        const c = await adapter.readFileAt(filepath, sourceOid)
        if (!cancelled) setInitial(c)
      } catch (err) {
        if (!cancelled) setError(err?.message || String(err))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [adapter, filepath, sourceOid])

  if (error) return <div className="error">{error}</div>
  if (initial === null) return <div className="loading" role="status">正在读取 {filepath}…</div>

  return (
    <EditorPanel
      filepath={filepath}
      initialContent={initial}
      ifBranchName={ifBranchName}
      onSave={onSave}
      onCancel={onCancel}
      confirm={confirm}
      onDraft={onDraft}
    />
  )
}

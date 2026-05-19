import { useEffect, useState } from 'react'
import ReactDiffViewer from 'react-diff-viewer-continued'
import EditorPanel from './EditorPanel.jsx'
import { makeIfBranchName } from '../state/useSession.js'

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
      {status}
    </span>
  )
}

function PatchView({ patch }) {
  if (!patch) return <div className="muted">No patch available.</div>
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

export default function CommitDetail({ adapter, oid, session, onCommitted }) {
  const [detail, setDetail] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [activeFile, setActiveFile] = useState(null)
  const [editError, setEditError] = useState('')

  useEffect(() => {
    if (!oid) return
    let cancelled = false
    ;(async () => {
      // deps 变化时 reset，lint 对此误报 set-state-in-effect
      setLoading(true)
      setError('')
      setActiveFile(null)
      try {
        const d = await adapter.getCommitDetail(oid)
        if (cancelled) return
        setDetail(d)
        if (d.files.length > 0) setActiveFile(d.files[0].path)
        setLoading(false)
      } catch (err) {
        if (cancelled) return
        setError(err.message || String(err))
        setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [adapter, oid])

  if (!oid) {
    return <div className="placeholder">Pick a commit on the left.</div>
  }
  if (loading) return <div className="loading">Loading commit...</div>
  if (error) return <div className="error">{error}</div>
  if (!detail) return null

  const { commit, files } = detail
  const file = files.find((f) => f.path === activeFile)
  const useSideBySide =
    file && typeof file.oldText === 'string' && typeof file.newText === 'string' && !file.patch

  const canEdit =
    !!session &&
    (session.mode === 'preview' || session.mode === 'edit') &&
    adapter.kind() === 'local' &&
    typeof adapter.createBranch === 'function'

  const handleEdit = async (filepath) => {
    if (!session) return
    setEditError('')
    try {
      let ifBranchName = session.currentIfBranch
      // preview 状态首次按 Edit → 起新 if 分支
      if (session.mode === 'preview' || !ifBranchName) {
        const counter = session.allocateIfCounter()
        ifBranchName = makeIfBranchName(oid.slice(0, 7), counter)
        await adapter.createBranch(ifBranchName, oid)
        await adapter.checkout(ifBranchName)
      }
      session.startEdit(filepath, ifBranchName)
    } catch (err) {
      setEditError(err?.message || String(err))
    }
  }

  const handleSaveCommit = async (newContent, commitMsg) => {
    const filepath = session.editingFile
    if (!filepath) throw new Error('no editing file')
    await adapter.writeFile(filepath, newContent)
    const newHeadOid = await adapter.addAndCommit(filepath, commitMsg)
    session.onCommitInIf(newHeadOid)
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
        sourceOid={oid}
        onSave={handleSaveCommit}
        onCancel={handleCancelEdit}
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
      </header>

      {editError && <div className="error edit-error">! {editError}</div>}

      <div className="files-and-diff">
        <ul className="file-list">
          {files.length === 0 && (
            <li className="muted">No file changes (merge or empty).</li>
          )}
          {files.map((f) => (
            <li
              key={f.path}
              className={f.path === activeFile ? 'active' : ''}
            >
              <span className="file-row-main" onClick={() => setActiveFile(f.path)}>
                <StatusBadge status={f.status} />
                <span className="path">{f.path}</span>
              </span>
              {canEdit && f.status !== 'remove' && (
                <button
                  className="edit-file-btn"
                  onClick={() => handleEdit(f.path)}
                  title={
                    session.mode === 'preview'
                      ? 'Edit this file (will fork into a new if-line)'
                      : 'Edit this file on current if-line'
                  }
                >
                  Edit
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
          {file && !useSideBySide && <PatchView patch={file.patch} />}
          {!file && <div className="muted">Select a file.</div>}
        </div>
      </div>
    </div>
  )
}

// 进入 edit 模式后异步拉初始内容（从 sourceOid 时刻读文件 · 不是从当前 HEAD）
function EditEnter({ adapter, filepath, ifBranchName, sourceOid, onSave, onCancel }) {
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
  if (initial === null) return <div className="loading">Loading {filepath}...</div>

  return (
    <EditorPanel
      filepath={filepath}
      initialContent={initial}
      ifBranchName={ifBranchName}
      onSave={onSave}
      onCancel={onCancel}
    />
  )
}

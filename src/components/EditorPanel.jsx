// Monaco 编辑器 wrapper · 动态 import 减小首屏包
// props:
//   filepath          要编辑的文件路径
//   initialContent    该文件在 preview commit 时刻的内容
//   ifBranchName      当前 if 分支名（顶部显示）
//   onSave(content, commitMessage)  写文件 + commit · async · 返回新 HEAD oid 或 throw
//   onCancel          放弃修改返回 detail 视图

import { Suspense, lazy, useState } from 'react'

const Editor = lazy(() => import('@monaco-editor/react'))

// 文件后缀 → Monaco language id
const LANG_BY_EXT = {
  js: 'javascript',
  jsx: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  json: 'json',
  md: 'markdown',
  css: 'css',
  html: 'html',
  htm: 'html',
  vue: 'html',
  py: 'python',
  go: 'go',
  rs: 'rust',
  java: 'java',
  kt: 'kotlin',
  c: 'c',
  cpp: 'cpp',
  h: 'cpp',
  hpp: 'cpp',
  cs: 'csharp',
  rb: 'ruby',
  php: 'php',
  sh: 'shell',
  bash: 'shell',
  zsh: 'shell',
  yml: 'yaml',
  yaml: 'yaml',
  toml: 'ini',
  ini: 'ini',
  xml: 'xml',
  sql: 'sql',
  swift: 'swift',
  scala: 'scala',
  lua: 'lua',
  r: 'r',
}

function detectLanguage(filepath) {
  const dot = filepath.lastIndexOf('.')
  if (dot < 0) return 'plaintext'
  const ext = filepath.slice(dot + 1).toLowerCase()
  return LANG_BY_EXT[ext] || 'plaintext'
}

export default function EditorPanel({
  filepath,
  initialContent,
  ifBranchName,
  onSave,
  onCancel,
}) {
  const [content, setContent] = useState(initialContent ?? '')
  const [commitMsg, setCommitMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const handleSave = async () => {
    if (busy) return
    const msg = commitMsg.trim() || `gitviz: edit ${filepath}`
    setBusy(true)
    setError('')
    try {
      await onSave(content, msg)
      setCommitMsg('')
    } catch (err) {
      setError(err?.message || String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="editor-panel">
      <header className="editor-header">
        <div className="editor-meta">
          <span className="if-badge">{ifBranchName || 'if-line'}</span>
          <code className="filepath">{filepath}</code>
        </div>
        <div className="editor-actions">
          <input
            type="text"
            placeholder={`commit msg (defaults to "edit ${filepath}")`}
            value={commitMsg}
            onChange={(e) => setCommitMsg(e.target.value)}
            className="commit-msg-input"
            maxLength={200}
            disabled={busy}
          />
          <button
            onClick={handleSave}
            disabled={busy}
            className="save-btn"
          >
            {busy ? 'Committing...' : 'Save & Commit'}
          </button>
          <button onClick={onCancel} disabled={busy} className="cancel-btn">
            Cancel
          </button>
        </div>
      </header>

      {error && <div className="error editor-error">! {error}</div>}

      <div className="editor-body">
        <Suspense fallback={<div className="loading">Loading editor (Monaco ~2MB)...</div>}>
          <Editor
            height="100%"
            language={detectLanguage(filepath)}
            theme="vs-dark"
            value={content}
            onChange={(v) => setContent(v ?? '')}
            options={{
              minimap: { enabled: false },
              fontSize: 13,
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              tabSize: 2,
              automaticLayout: true,
              wordWrap: 'on',
              scrollBeyondLastLine: false,
            }}
          />
        </Suspense>
      </div>
    </div>
  )
}

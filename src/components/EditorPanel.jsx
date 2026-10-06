// Monaco 编辑器 wrapper · 动态 import 减小首屏包
// props:
//   filepath          要编辑的文件路径
//   initialContent    该文件在 preview commit 时刻的内容
//   ifBranchName      当前 if 分支名（顶部显示）
//   onSave(content, commitMessage)  写文件 + commit · async · 返回新 HEAD oid 或 throw
//   onCancel          放弃修改返回 detail 视图

import { Suspense, lazy, useEffect, useRef, useState } from 'react'

const Editor = lazy(() => import('./LocalCodeEditor.jsx'))

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
  confirm,
  onDraft,
}) {
  const [content, setContent] = useState(initialContent ?? '')
  const [commitMsg, setCommitMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const draft = useRef({ content: initialContent ?? '', message: '' })
  const reportDraft = (changes) => {
    Object.assign(draft.current, changes)
    onDraft?.({ path: filepath, dirty: draft.current.content !== (initialContent ?? '') || draft.current.message.length > 0 })
  }
  useEffect(() => {
    onDraft?.({ path: filepath, dirty: draft.current.content !== (initialContent ?? '') || draft.current.message.length > 0 })
    return () => onDraft?.(null)
  }, [filepath, initialContent, onDraft])

  const handleSave = async () => {
    if (busy) return
    const msg = commitMsg.trim() || `gitviz: edit ${filepath}`
    setBusy(true)
    setError('')
    try {
      const result = await onSave(content, msg)
      if (result?.cancelled) return
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
          <span className="if-badge">{ifBranchName || '试验分支'}</span>
          <code className="filepath">{filepath}</code>
        </div>
        <div className="editor-actions">
          <input
            type="text"
            aria-label="提交说明"
            placeholder={`提交说明（留空使用 gitviz: edit ${filepath}）`}
            value={commitMsg}
            onChange={(e) => { reportDraft({ message: e.target.value }); setCommitMsg(e.target.value) }}
            className="commit-msg-input"
            maxLength={200}
            disabled={busy}
          />
          <button
            onClick={handleSave}
            disabled={busy}
            className="save-btn"
          >
            {busy ? '正在提交…' : '保存并提交'}
          </button>
          <button onClick={async () => { if ((content === (initialContent ?? '') && !commitMsg) || await confirm?.()) onCancel() }} disabled={busy} className="cancel-btn">
            取消编辑
          </button>
        </div>
      </header>

      {error && <div className="error editor-error" role="alert">{error}</div>}

      <div className="editor-body">
        <Suspense fallback={<div className="loading" role="status">正在加载编辑器…</div>}>
          <Editor
            height="100%"
            language={detectLanguage(filepath)}
            theme="vs-dark"
            value={content}
            onChange={(v) => { reportDraft({ content: v ?? '' }); setContent(v ?? '') }}
            options={{
              readOnly: busy,
              ariaLabel: `编辑文件：${filepath}`,
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

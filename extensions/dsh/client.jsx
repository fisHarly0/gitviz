/* eslint-disable react-refresh/only-export-components */
import { useEffect, useMemo, useRef, useState } from 'react'
import { diffLines } from 'diff'
import VersionTree from '../../src/version-tree/VersionTree.jsx'
import Icon from '../../src/version-tree/Icons.jsx'
import treeCss from 'virtual:gitviz-tree-css'
import adapterCss from './panel.css?inline'

export const inject = ['slots', 'locale']

function Modal({ model, finish }) {
  const ref = useRef(null)
  useEffect(() => { const dialog = ref.current; dialog.showModal(); return () => dialog.close() }, [])
  return <dialog ref={ref} className={`gitviz-dialog ${model.diff ? 'gitviz-diff' : ''}`} aria-labelledby="gitviz-dialog-title" onCancel={event => { event.preventDefault(); finish(null) }}>
    <form onSubmit={event => { event.preventDefault(); finish(model.input ? new FormData(event.currentTarget).get('value').trim() : true) }}>
      <header><h2 id="gitviz-dialog-title">{model.title}</h2><button type="button" aria-label="关闭对话框" onClick={() => finish(null)}><Icon name="close"/></button></header>
      {model.description && <p className="gitviz-dialog-description">{model.description}</p>}
      {model.repo && <p className="gitviz-repo-path">{model.repo}</p>}
      {model.input && <label>{model.label}<input name="value" aria-label={model.label} defaultValue={model.value || ''} placeholder={model.placeholder} required autoFocus autoComplete="off" spellCheck="false"/></label>}
      {model.diff && <DiffView diff={model.diff}/>}
      <footer>{!model.diff && <button type="button" onClick={() => finish(null)}>取消</button>}<button className="gitviz-confirm" type="submit">{model.confirm || (model.diff ? '关闭差异' : '确认操作')}</button></footer>
    </form>
  </dialog>
}

function DiffView({ diff }) {
  const view = useMemo(() => {
    // Bound both the diff algorithm and DOM size for large generated files.
    const limit = 120000, clipped = diff.before.length > limit || diff.after.length > limit
    const before = diff.before.slice(0, limit), after = diff.after.slice(0, limit)
    const parts = diffLines(before, after, { timeout: 500, maxEditLength: 5000 })
    if (!parts) return { clipped: true, rows: [{ kind: 'remove', text: before.slice(0, 30000) }, { kind: 'add', text: after.slice(0, 30000) }] }
    let old = 0, next = 0, omitted = false
    const rows = []
    for (const part of parts) for (const line of part.value.replace(/\n$/, '').split('\n')) {
      if (rows.length >= 1500) { omitted = true; break }
      rows.push({ kind: part.added ? 'add' : part.removed ? 'remove' : 'same', old: part.added ? '' : ++old, next: part.removed ? '' : ++next, text: line })
    }
    return { rows, clipped: clipped || omitted }
  }, [diff])
  return <><p className="gitviz-diff-legend"><span>− 删除</span><span>+ 新增</span><code>{diff.from?.slice(0, 7) || '空版本'} → {diff.to.slice(0, 7)}</code></p>{view.clipped && <p role="status">文件较大，仅展示部分内容。完整内容仍保存在 Git 历史中。</p>}<div className="gitviz-diff-lines" tabIndex={0} aria-label="文件逐行差异">{view.rows.map((row, index) => <div key={index} className={`gitviz-diff-line ${row.kind}`}><span>{row.old}</span><span>{row.next}</span><span>{row.kind === 'add' ? '+' : row.kind === 'remove' ? '−' : ' '}</span><pre>{row.text || ' '}</pre></div>)}</div></>
}

function Panel() {
  const [modal, setModal] = useState(null)
  const pending = useRef(null)
  const repository = useRef(null)
  const bridge = useMemo(() => {
    const created = new Set()
    const listeners = new Set()
    const rpc = async (method, params) => {
      if (method === 'snapshot' && !repository.current) {
        const previous = sessionStorage.getItem('gitviz.dsh.repository')
        if (previous) {
          try { return await rpc('open', { path: previous }) }
          catch { sessionStorage.removeItem('gitviz.dsh.repository') }
        }
      }
      const response = await fetch('/_gitviz/api', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Gitviz-Client': '1' }, body: JSON.stringify({ method, params, repoId: repository.current }) })
      const data = await response.json()
      if (!response.ok || data.error) throw new Error(data.error || '无法连接 Gitviz，请刷新 DSH。')
      if (data.result?.repoId) repository.current = data.result.repoId
      if (data.result?.repo) sessionStorage.setItem('gitviz.dsh.repository', data.result.repo)
      return data.result
    }
    const ask = model => new Promise(resolve => { pending.current = resolve; setModal(model) })
    return {
      onRefresh(callback) { listeners.add(callback); return () => listeners.delete(callback) },
      async request(method, params = {}) {
        if (method === 'chooseRepo') {
          const folder = await ask({ title: '打开 Git 仓库', input: true, label: '本机仓库的绝对路径', placeholder: 'F:\\Codex\\projects\\my-project', confirm: '展开版本树', description: '读取 DSH 所在电脑上的仓库。选择节点只预览历史。' })
          return folder ? rpc('open', { path: folder }) : rpc('snapshot')
        }
        if (method === 'openWorktree') {
          if (!created.has(params.path)) throw new Error('此工作区不是本次创建的试验目录。')
          await rpc('open', { path: params.path })
          for (const callback of listeners) callback()
          return { message: `正在查看试验工作区 ${params.path}。DSH 对话的工作目录保持不变。` }
        }
        if (method === 'openDiff') {
          const diff = await rpc('openDiff', params)
          await ask({ title: diff.path, description: diff.oldPath !== diff.path ? `原路径：${diff.oldPath}` : '', diff })
          return {}
        }
        if (['createBranch', 'createWorktree', 'switchBranch', 'restore'].includes(method)) {
          let name = params.name
          if (['createBranch', 'createWorktree'].includes(method)) {
            name = await ask({ title: method === 'createWorktree' ? '从这个存档开始试验' : '为存档创建分支', input: true, label: '新分支名称', value: `gitviz/try-${params.oid.slice(0, 7)}-${Date.now().toString(36)}`, confirm: '下一步' })
            if (!name) return { cancelled: true }
          }
          const prepared = await rpc('prepare', { ...params, name, action: method })
          const titles = { createBranch: '确认创建分支', switchBranch: '确认切换分支', createWorktree: '确认创建独立试验线', restore: '确认恢复此存档' }
          if (!await ask({ title: titles[method], description: prepared.description, repo: prepared.repo, confirm: method === 'restore' ? '保留历史并恢复' : '确认操作' })) return { cancelled: true }
          const result = await rpc('execute', { token: prepared.token })
          if (result.worktree) created.add(result.worktree)
          return result
        }
        return rpc(method, params)
      },
    }
  }, [])
  useEffect(() => () => { pending.current?.(null) }, [])
  const finish = value => { const resolve = pending.current; pending.current = null; setModal(null); resolve?.(value) }
  return <section className="gitviz-dsh" aria-label="Gitviz 版本树"><VersionTree bridge={bridge} hostName="DSH 面板" busyHint="正在处理，请完成面板中的输入或确认…"/>{modal && <Modal key={modal.title} model={modal} finish={finish}/>}</section>
}

export function apply(ctx) {
  ctx.effect(() => {
    const style = document.createElement('style')
    style.dataset.plugin = '@fisharly/gitviz-dsh'
    style.textContent = treeCss + '\n' + adapterCss
    document.head.appendChild(style)
    return () => style.remove()
  }, 'gitviz: scoped styles')
  ctx.effect(() => ctx.locale.register('gitviz', { zh: { panel: 'Gitviz 版本树' }, en: { panel: 'Gitviz version tree' } }), 'gitviz: locale')
  ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: 'gitviz' }, Panel))
  ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({ name: 'sidebar.panellist', id: 'gitviz', order: 20, label: () => ctx.locale.bind('gitviz')('panel') }, () => <Icon name="tree" size={20}/>))
}

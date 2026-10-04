import { useEffect, useRef, useState } from 'react'
import TreeMap from './TreeMap.jsx'
import Icon from './Icons.jsx'
import useHistoryPaging from './useHistoryPaging.js'
import HistoryControls from './HistoryControls.jsx'

const short = oid => oid?.slice(0, 7) || '—'
const statusLabels = { A: '新增', M: '修改', D: '删除', R: '重命名', C: '复制', T: '类型变化' }
const defaultSelection = snapshot => snapshot.commits.find(commit => commit.oid === snapshot.head)?.oid || snapshot.commits[0]?.oid || null

export default function VersionTree({ bridge, hostName = 'VS Code', busyHint = '正在处理，请留意 VS Code 顶部的输入或确认提示…' }) {
  const [snapshot, setSnapshot] = useState(null), [selected, setSelected] = useState(null)
  const [detail, setDetail] = useState(null), [comparison, setComparison] = useState(null)
  const [comparing, setComparing] = useState(false), [compareOids, setCompareOids] = useState([])
  const [query, setQuery] = useState(''), [focusOid, setFocusOid] = useState(null)
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false)
  const [worktree, setWorktree] = useState(null)
  const sequence = useRef(0)

  useEffect(() => {
    let cancelled = false
    const refresh = () => bridge.request('snapshot').then(value => {
      if (cancelled) return
      setSnapshot(value)
      setSelected(previous => value.commits.some(commit => commit.oid === previous) ? previous : defaultSelection(value))
    }).catch(reason => { if (!cancelled) setError(reason.message) })
    refresh()
    const dispose = bridge.onRefresh?.(refresh)
    return () => { cancelled = true; dispose?.() }
  }, [bridge])

  useEffect(() => {
    if (!selected) return
    let cancelled = false
    bridge.request('detail', { oid: selected }).then(value => { if (!cancelled) setDetail(value) }).catch(reason => { if (!cancelled) setError(reason.message) })
    return () => { cancelled = true }
  }, [bridge, selected, snapshot])

  useEffect(() => {
    if (compareOids.length !== 2) return
    let cancelled = false
    bridge.request('compare', { from: compareOids[0], to: compareOids[1] }).then(value => { if (!cancelled) setComparison(value) }).catch(reason => { if (!cancelled) setError(reason.message) })
    return () => { cancelled = true }
  }, [bridge, compareOids, snapshot])

  const select = (oid, shift = false) => {
    if (!oid) return
    setSelected(oid)
    if (comparing || shift) {
      setComparing(true)
      setCompareOids(previous => shift && !comparing && selected && selected !== oid ? [selected, oid] : previous.length === 1 && previous[0] !== oid ? [previous[0], oid] : [oid])
    }
  }
  const history = useHistoryPaging({ bridge, snapshot, setSnapshot, onSelect: select, query })
  const refresh = async () => {
    const value = await bridge.request('snapshot')
    setSnapshot(value)
    setSelected(previous => value.commits.some(commit => commit.oid === previous) ? previous : defaultSelection(value))
    return value
  }
  const act = async (method, params = {}) => {
    if (busy) return
    setBusy(true); setError(''); setNotice('')
    const id = ++sequence.current
    try {
      const result = method === 'snapshot' ? await refresh() : await bridge.request(method, { ...params, expected: { head: snapshot?.head, branch: snapshot?.branch } })
      if (id !== sequence.current) return
      if (result.snapshot) setSnapshot(result.snapshot)
      if (result.head) { setSelected(result.head); setComparing(false); setCompareOids([]) }
      if (method === 'switchBranch' && result.snapshot) setSelected(result.snapshot.head)
      if (method === 'chooseRepo') { setSnapshot(result); setSelected(defaultSelection(result)); setCompareOids([]); setComparing(false); setFocusOid(null); setDetail(null); setComparison(null); setWorktree(null) }
      if (result.worktree) setWorktree(result.worktree)
      if (result.message) setNotice(result.message)
    } catch (reason) {
      setError(reason.message)
      if (['restore', 'switchBranch', 'createBranch', 'createWorktree'].includes(method)) await refresh().catch(() => {})
    } finally { setBusy(false) }
  }
  const resetCompare = () => { setComparing(false); setCompareOids([]) }
  const viewing = detail?.oid === selected ? detail : null
  const comparingReady = comparing && compareOids.length === 2 && comparison?.from === compareOids[0] && comparison?.to === compareOids[1]
  const changes = comparing ? comparingReady ? comparison : null : viewing
  const selectedCommit = snapshot?.commits.find(commit => commit.oid === selected)
  const localRefs = snapshot?.branches.filter(ref => !ref.remote && ref.oid === selected && ref.name !== snapshot.branch) || []
  const writeBlocked = busy || !snapshot?.writable || !selected

  if (!snapshot) return <div className="version-tree"><div className="initial-state"><Icon name="tree" size={40}/><h1>正在展开版本树</h1><p>读取提交、分支和当前位置…</p>{error && <p role="alert">{error}</p>}<button onClick={() => act('snapshot')} disabled={busy}>重新读取</button></div></div>

  return <div className={`version-tree ${busy ? 'is-busy' : ''}`} aria-busy={busy}>
    <header className="tree-header"><div className="tree-brand"><Icon name="tree" size={25}/><h1>Gitviz</h1><span>版本树</span></div><button className="repo-picker quiet" onClick={() => act('chooseRepo')} disabled={busy} title={snapshot.repo}><Icon name="folder"/>{snapshot.name || '选择仓库'}<Icon name="arrow" size={14}/></button><button className="icon-button quiet" onClick={() => act('snapshot')} disabled={busy} title="刷新历史" aria-label="刷新历史"><Icon name="refresh"/></button></header>
    <div className="journey-bar"><div><span className="live-dot"/><strong>{snapshot.branch || (snapshot.head ? '游离 HEAD' : '尚无提交')}</strong><code>{short(snapshot.head)}</code><span className={`workspace-state ${snapshot.dirty ? 'dirty' : ''}`}>{snapshot.dirty ? '有未提交修改' : '工作区干净'}</span></div><span>{selected && selected !== snapshot.head ? <>正在预览 <code>{short(selected)}</code> · 文件未切换</> : snapshot.dirty ? '正在查看 HEAD · 另有未提交进度' : '当前位置与工作文件一致'}</span></div>
    {(error || notice || busy) && <div className={`tree-message ${error ? 'error-message' : ''}`} role={error ? 'alert' : 'status'}><span>{error || (busy ? busyHint : notice)}</span>{!busy && <button className="icon-button quiet" aria-label="关闭提示" onClick={() => { setError(''); setNotice('') }}><Icon name="close" size={16}/></button>}</div>}
    {!snapshot.commits.length ? <main className="initial-state"><Icon name="tree" size={48}/><h2>{snapshot.repo ? '故事从第一次提交开始' : '打开仓库，展开你的版本树'}</h2><p>{snapshot.repo ? '这个仓库还没有存档点。在源代码管理中完成首次提交，然后刷新。' : '选择一个本地 Git 仓库，查看分支与存档之间的关系。'}</p><button className="primary" disabled={busy} onClick={() => act(snapshot.repo ? 'snapshot' : 'chooseRepo')}>{snapshot.repo ? '刷新版本树' : '选择 Git 仓库'}</button></main> : <>
      <div className="tree-tools"><label className="tree-search"><Icon name="search"/><input aria-label="搜索存档" placeholder="搜索全部历史：说明、作者、编号…" value={query} onChange={event => setQuery(event.target.value)}/>{query && <button className="icon-button quiet" aria-label="清除搜索" onClick={() => setQuery('')}><Icon name="close" size={14}/></button>}</label><label className="branch-filter"><span>路径</span><select aria-label="聚焦分支路径" value={focusOid || ''} onChange={event => setFocusOid(event.target.value || null)}><option value="">所有分支</option>{snapshot.branches.map(ref => <option key={`${ref.remote}-${ref.name}`} value={ref.oid}>{ref.name}</option>)}</select></label><button className={comparing ? 'active-button' : 'quiet'} onClick={() => { if (comparing) resetCompare(); else { setComparing(true); setCompareOids(selected ? [selected] : []) } }}><Icon name="compare"/>比较两个存档</button></div>
      <HistoryControls history={history} snapshot={snapshot} query={query} disabled={busy}/>
      {comparing && <div className="compare-strip"><span className="compare-token">A <code>{short(compareOids[0])}</code></span><Icon name="arrow" size={14}/><span className="compare-token">B <code>{short(compareOids[1])}</code></span><span>{compareOids.length === 2 ? '查看从 A 到 B 的文件变化' : '再点一个节点，选择版本 B'}</span>{compareOids.length === 2 && <button className="quiet" onClick={() => setCompareOids(([a, b]) => [b, a])}>交换 A / B</button>}<button className="icon-button quiet" aria-label="退出比较" onClick={resetCompare}><Icon name="close" size={16}/></button></div>}
      <main className="tree-workbench"><TreeMap key={snapshot.repo} snapshot={snapshot} selected={selected} onSelect={select} comparing={comparing} compareOids={compareOids} focusOid={focusOid} query={query} locateOid={history.locateOid}/>
        <aside className="node-inspector" aria-label="存档详情"><div className="inspector-heading"><h2>{comparing ? '存档比较' : selected === snapshot.head ? '当前存档' : '存档预览'}</h2><span className="read-only-note">只读查看</span></div>
          {comparing ? <div className="commit-summary"><h3>{compareOids.length === 2 ? `${short(compareOids[0])} → ${short(compareOids[1])}` : '选择另一个存档点'}</h3><p>比较只读取历史，不会切换工作文件。</p></div> : <div className="commit-summary"><div className="commit-id"><Icon name={selectedCommit?.parents.length > 1 ? 'fork' : 'clock'} size={16}/><code>{short(selected)}</code>{selectedCommit?.parents.length > 1 && <span>合并存档</span>}</div><h3>{selectedCommit?.message || '选择一个存档点'}</h3><p>{viewing?.author || selectedCommit?.author}<span className="commit-date">{selectedCommit && new Date(selectedCommit.timestamp * 1000).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span></p>{viewing?.message.includes('\n') && <pre className="commit-body">{viewing.message.slice(viewing.message.indexOf('\n') + 1).trim()}</pre>}{viewing?.parents.length > 1 && <p className="merge-note">合并了 {viewing.parents.length} 条历史。下方变更相对第一个父存档；可选择其他父节点进行比较。</p>}</div>}
          {!comparing && <div className="node-actions"><button className="primary" disabled={writeBlocked} onClick={() => act('createWorktree', { oid: selected })}><Icon name="fork"/>从这里试一版</button><p>新建独立工作目录，保留当前进度。</p><div className="secondary-actions"><button disabled={writeBlocked} onClick={() => act('createBranch', { oid: selected })}><Icon name="plus" size={15}/>建分支</button><button disabled={writeBlocked || snapshot.dirty || !snapshot.branch || selected === snapshot.head} title={snapshot.dirty ? '先处理未提交修改' : '保留历史，恢复为新提交'} onClick={() => act('restore', { oid: selected })}><Icon name="back" size={15}/>恢复此存档</button></div>{localRefs.map(ref => <button className="switch-ref quiet" disabled={writeBlocked || snapshot.dirty} key={ref.name} onClick={() => act('switchBranch', { name: ref.name })}>切换到 {ref.name}<Icon name="arrow" size={14}/></button>)}{snapshot.dirty && <p className="dirty-hint">未提交修改会保留；切换和恢复暂不可用。</p>}{worktree && <button className="quiet" disabled={busy} onClick={() => act('openWorktree', { path: worktree })}><Icon name="folder" size={15}/>打开刚创建的试验工作区</button>}</div>}
          <div className="changes-heading"><h3>文件变化</h3><span>{changes?.files.length ?? '—'}</span></div><div className="file-changes">{!changes ? <p className="quiet-text">{comparing && compareOids.length < 2 ? '选好两个节点后，差异会显示在这里。' : '正在读取文件变化…'}</p> : changes.files.length === 0 ? <div className="no-changes"><Icon name="check"/><p>文件内容相同</p></div> : changes.files.map(file => <button key={file.path} className="file-change" disabled={busy} title={`${file.status === 'R' ? `${file.oldPath} → ` : ''}${file.path} · 在编辑器中比较`} onClick={() => act('openDiff', { from: changes.from, to: changes.to, path: file.path })}><span className={`file-status status-${file.status}`}>{file.status}</span><span className="file-name">{file.path}<small>{statusLabels[file.status] || file.status}</small></span><Icon name="arrow" size={14}/></button>)}</div><p className="diff-tip">点文件，在 {hostName} 中查看前后差异。</p>
        </aside></main>
    </>}
    <footer className="tree-status"><span><Icon name="tree" size={13}/>{snapshot.branches.filter(ref => !ref.remote).length} 条本地分支 · {snapshot.tags.length} 个标签</span><span>{snapshot.headPinned ? '较旧的当前位置已保留 · 部分历史未载入' : snapshot.truncated ? `已加载 ${snapshot.commits.length} / ${snapshot.total ?? '—'} 个存档` : '已加载可达历史'}<span className="map-heading-note"> · 点选预览，操作前确认</span></span></footer>
  </div>
}

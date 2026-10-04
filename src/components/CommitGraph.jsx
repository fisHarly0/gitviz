import { lazy, Suspense, useEffect, useEffectEvent, useMemo, useState } from 'react'
import TreeMap from '../version-tree/TreeMap.jsx'
import HistoryControls from '../version-tree/HistoryControls.jsx'
import useHistoryPaging from '../version-tree/useHistoryPaging.js'
import '../version-tree/version-tree.css'
import './desktop-history.css'

const LegacyCommitGraph = lazy(() => import('./LegacyCommitGraph.jsx'))

function LocalHistory({ adapter, onSelect, selectedOid, refreshKey, onSnapshot, editing, blocked }) {
  const [snapshot, setSnapshot] = useState(null), [error, setError] = useState('')
  const [query, setQuery] = useState(''), [orientation, setOrientation] = useState('vertical')
  const [revision, setRevision] = useState(0)
  const bridge = useMemo(() => ({ request: (method, params) => adapter.historyRequest(method, params) }), [adapter])
  const history = useHistoryPaging({ bridge, snapshot, setSnapshot, onSelect, query })
  const notifySnapshot = useEffectEvent(data => onSnapshot?.(data))
  useEffect(() => { if (snapshot) notifySnapshot(snapshot) }, [snapshot])
  useEffect(() => {
    let cancelled = false
    bridge.request('snapshot').then(data => { if (!cancelled) { setSnapshot(data); setError('') } }).catch(reason => { if (!cancelled) setError(String(reason.message || reason)) })
    return () => { cancelled = true }
  }, [bridge, refreshKey, revision, editing])
  if (!snapshot) return <div className="version-tree desktop-history"><div className="initial-state"><p role={error ? 'alert' : 'status'}>{error || '正在读取本机 Git 历史…'}</p><button onClick={() => setRevision(value => value + 1)}>重新读取</button></div></div>
  return <div className="version-tree desktop-history">
    <div className="tree-tools"><label className="tree-search"><input aria-label="搜索全部历史" value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索全部历史：说明、作者、编号…"/></label><div className="desktop-history-tools"><button aria-pressed={orientation === 'vertical'} onClick={() => setOrientation('vertical')}>竖向</button><button aria-pressed={orientation === 'horizontal'} onClick={() => setOrientation('horizontal')}>横向</button><button disabled={blocked} onClick={() => setRevision(value => value + 1)}>刷新历史</button></div></div>
    <div className="desktop-history-position">实际位置：{snapshot.branch || '游离 HEAD'} <code>{snapshot.head?.slice(0, 7)}</code>{selectedOid && selectedOid !== snapshot.head ? ' · 正在预览，工作文件未切换' : ' · 点选节点只预览'}{snapshot.dirty && ' · 有未提交修改'}</div>
    {error && <p role="alert" className="history-warning">{error}</p>}
    <HistoryControls history={history} snapshot={snapshot} query={query}/>
    {snapshot.commits.length ? <TreeMap snapshot={snapshot} selected={selectedOid || snapshot.head} onSelect={onSelect} query={query} locateOid={history.locateOid} orientation={orientation}/> : <div className="initial-state">这个仓库还没有存档点。</div>}
  </div>
}

export default function CommitGraph(props) {
  return props.adapter.historyRequest ? <LocalHistory key={props.adapter.historyId} {...props}/> : <Suspense fallback={<p className="loading">正在展开历史…</p>}><LegacyCommitGraph {...props}/></Suspense>
}

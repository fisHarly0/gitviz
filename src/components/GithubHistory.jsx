import { useEffect, useEffectEvent, useMemo, useState } from 'react'
import TreeMap from '../version-tree/TreeMap.jsx'
import { githubErrorMessage, loadGithubHistory } from '../adapters/githubHistory.js'

export default function GithubHistory({ adapter, selectedOid, currentBranch, onSelect, onRemoteHistory, refreshKey }) {
  const [outcome, setOutcome] = useState(null), [revision, setRevision] = useState(0)
  const loading = outcome?.adapter !== adapter || outcome?.revision !== revision || outcome?.refreshKey !== refreshKey
  const data = outcome?.adapter === adapter ? outcome.data : null
  const error = loading ? '' : outcome?.error
  const [query, setQuery] = useState(''), [orientation, setOrientation] = useState('vertical')
  const notify = useEffectEvent(value => onRemoteHistory(value))
  useEffect(() => {
    const controller = new AbortController()
    loadGithubHistory(adapter, controller.signal).then(value => {
      if (controller.signal.aborted) return
      setOutcome({ adapter, refreshKey, revision, data: value, error: '' }); notify(value)
    }).catch(reason => {
      if (!controller.signal.aborted) setOutcome(previous => ({ adapter, refreshKey, revision,
        data: previous?.adapter === adapter ? previous.data : null, error: githubErrorMessage(reason) }))
    })
    return () => controller.abort()
  }, [adapter, refreshKey, revision])
  const snapshot = useMemo(() => data && ({ ...data,
    branches: data.branches.map(branch => ({ ...branch, remote: true })),
    head: data.branches.find(branch => branch.name === currentBranch)?.oid,
  }), [data, currentBranch])
  const retry = <button disabled={loading} onClick={() => setRevision(value => value + 1)}>{loading ? '正在读取…' : '重新读取历史'}</button>
  return <div className="version-tree desktop-history github-history">
    <div className="tree-tools">
      <label className="tree-search"><input aria-label="搜索已读取的 GitHub 历史" value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索已读取的说明、作者、编号…"/></label>
      <div className="desktop-history-tools"><button aria-pressed={orientation === 'vertical'} onClick={() => setOrientation('vertical')}>竖向</button><button aria-pressed={orientation === 'horizontal'} onClick={() => setOrientation('horizontal')}>横向</button>{retry}</div>
    </div>
    <p className="github-scope">GitHub 只读 · 至多读取前 100 个分支、100 个标签及每分支 100 条提交。搜索仅覆盖已读取的历史。</p>
    {loading && <p className="github-scope" role="status">正在读取远程历史…{data ? '下方暂时保留上次结果。' : ''}</p>}
    {error && <p className="error" role="alert">{error}{data ? ' 下方是上次成功读取的结果。' : ''}</p>}
    {data?.warnings.length > 0 && <details className="github-warnings" open>
      <summary role="status">历史读取不完整（{data.warnings.length} 项），可重新读取</summary>
      <ul>{data.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul>
    </details>}
    {snapshot?.commits.length > 0 ? <TreeMap snapshot={snapshot} selected={selectedOid || snapshot.head} onSelect={onSelect} query={query} orientation={orientation} readOnly/>
      : !loading && !error && <p className="initial-state">{data?.warnings.length ? '未读到可显示的提交。请根据上方原因重试。' : '这个仓库还没有可显示的存档点。'}</p>}
  </div>
}

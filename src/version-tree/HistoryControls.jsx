export default function HistoryControls({ history, snapshot, query, disabled = false }) {
  if (!snapshot?.repo || !snapshot.revision) return null
  const results = history.results
  return <div className="history-controls">
    <div className="history-progress"><span role="status">已载入 <strong>{snapshot.commits.length.toLocaleString()}</strong> / {snapshot.total?.toLocaleString() ?? '—'} 个存档{snapshot.nextCursor ? '' : ' · 本机可达历史已载完'}</span>
      {history.loading ? <button onClick={history.stop}>停止加载</button> : snapshot.nextCursor && <><button disabled={disabled} onClick={() => history.load()}>加载更早历史</button><button className="quiet" disabled={disabled} onClick={() => history.load({ all: true })}>连续加载全部</button></>}
    </div>
    {snapshot.shallow && <p className="history-warning">这是浅克隆，只能读取本机已有历史；更早提交需要先在 Git 中补全。</p>}
    {history.error && <p role="alert" className="history-warning">{history.error}</p>}
    {query.trim() && <div className="history-results" aria-label="全历史搜索结果"><div className="history-results-heading"><strong>全历史搜索</strong><span role="status">{history.searching ? '正在搜索…' : results?.error || (results ? `${results.commits.length} 个结果${results.nextCursor ? '，还有更多' : ''}` : '等待搜索…')}</span></div>
      {results?.commits.map(commit => <button className="history-hit quiet" key={commit.oid} disabled={history.loading || disabled} onClick={() => history.load({ target: commit.oid })} title={`定位到 ${commit.oid}`}><code>{commit.oid.slice(0, 7)}</code><span>{commit.message}<small>{commit.author}</small></span><span>定位</span></button>)}
      {results && !results.error && !results.commits.length && !history.searching && <p>全历史中没有找到匹配的存档。</p>}
      {results?.nextCursor && <button disabled={history.searching} onClick={history.moreResults}>更多搜索结果</button>}
    </div>}
  </div>
}

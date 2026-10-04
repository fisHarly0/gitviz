import { useCallback, useEffect, useRef, useState } from 'react'

export function mergeHistory(snapshot, page) {
  if (snapshot.revision !== page.revision) throw new Error('历史已变化，请刷新版本树。')
  const commits = new Map(snapshot.commits.map(commit => [commit.oid, commit]))
  for (const commit of page.commits) commits.set(commit.oid, commit)
  const merged = [...commits.values()]
  return { ...snapshot, commits: merged, nextCursor: page.nextCursor, truncated: Boolean(page.nextCursor), headPinned: Boolean(commits.get(snapshot.head)?.outsideWindow) }
}

export default function useHistoryPaging({ bridge, snapshot, setSnapshot, onSelect, query }) {
  const [loading, setLoading] = useState(false), [error, setError] = useState('')
  const [results, setResults] = useState(null), [searching, setSearching] = useState(false)
  const [locateOid, setLocateOid] = useState(null)
  const run = useRef(0), active = useRef(false)
  const searchRun = useRef(0)
  const cancelSearch = useCallback(() => { searchRun.current++ }, [])
  const cancel = useCallback(() => { run.current++; active.current = false }, [])
  const revision = snapshot?.revision, repo = snapshot?.repo

  useEffect(() => {
    let cancelled = false
    Promise.resolve().then(() => { if (!cancelled) { setError(''); setLoading(false); active.current = false } })
    return () => { cancelled = true; cancel() }
  }, [repo, revision, bridge, cancel])

  useEffect(() => {
    let cancelled = false
    cancelSearch()
    const timer = setTimeout(async () => {
      if (!query.trim() || !revision) { setResults(null); setSearching(false); return }
      setSearching(true)
      try {
        const data = await bridge.request('searchHistory', { query, revision })
        if (!cancelled) setResults({ ...data, query })
      } catch (reason) { if (!cancelled) setResults({ query, error: reason.message, commits: [] }) }
      finally { if (!cancelled) setSearching(false) }
    }, 300)
    return () => { cancelled = true; cancelSearch(); clearTimeout(timer) }
  }, [bridge, revision, repo, query, cancelSearch])

  const load = async ({ all = false, target } = {}) => {
    if (!snapshot || active.current) return
    active.current = true
    const id = ++run.current
    setLoading(true); setError('')
    let current = snapshot
    try {
      while (current.nextCursor && (!target || !current.commits.some(commit => commit.oid === target))) {
        const page = await bridge.request('historyPage', { cursor: current.nextCursor, limit: snapshot.limit || 300 })
        if (id !== run.current) return
        current = mergeHistory(current, page)
        const next = current
        setSnapshot(previous => previous?.repo === repo && previous?.revision === revision ? { ...previous, commits: next.commits, nextCursor: next.nextCursor, truncated: next.truncated, headPinned: next.headPinned } : previous)
        if (!all && !target) break
      }
      if (target && id === run.current) {
        if (!current.commits.some(commit => commit.oid === target)) throw new Error('未找到该存档，历史可能已变化，请刷新后重试。')
        onSelect(target)
        setLocateOid({ oid: target, request: id })
      }
    } catch (reason) { if (id === run.current) setError(reason.message) }
    finally { if (id === run.current) { active.current = false; setLoading(false) } }
  }
  const moreResults = async () => {
    if (!results?.nextCursor || searching) return
    const id = searchRun.current
    setSearching(true)
    try {
      const data = await bridge.request('searchHistory', { query, revision, cursor: results.nextCursor })
      if (id === searchRun.current) setResults(previous => previous?.query === query && previous?.revision === revision ? { ...data, query, commits: [...previous.commits, ...data.commits] } : previous)
    } catch (reason) { if (id === searchRun.current) setError(reason.message) }
    finally { if (id === searchRun.current) setSearching(false) }
  }
  return { loading, error, searching, results: results?.query === query && results?.revision === revision || results?.query === query && results?.error ? results : null, locateOid, load, moreResults, stop: () => { run.current++; active.current = false; setLoading(false) } }
}

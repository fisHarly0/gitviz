import { useCallback, useEffect, useRef, useState } from 'react'

export default function useOperationDialog() {
  const [request, setRequest] = useState(null), pending = useRef(null)
  const [busy, setBusy] = useState(false), active = useRef(false)
  const run = useCallback(async action => {
    if (active.current) throw new Error('另一个 Git 操作正在进行，请稍后重试。')
    active.current = true; setBusy(true)
    try { return await action() } finally { active.current = false; setBusy(false) }
  }, [])
  const settle = useCallback(value => { pending.current?.(value); pending.current = null }, [])
  const confirm = useCallback(data => new Promise(resolve => {
    settle(false); pending.current = resolve; setRequest(data)
  }), [settle])
  const answer = useCallback(value => { settle(value); setRequest(null) }, [settle])
  useEffect(() => () => settle(false), [settle])
  return { request, confirm, answer, busy, run }
}

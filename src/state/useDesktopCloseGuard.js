import { useCallback, useEffect, useRef, useState } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { createDesktopCloseController } from './desktop-close-controller.js'

export default function useDesktopCloseGuard(enabled, operation) {
  const draft = useRef(null), readyRef = useRef(!enabled)
  const [ready, setReady] = useState(!enabled)
  const [problem, setProblem] = useState(null)
  const onDraft = useCallback(value => { draft.current = value }, [])
  const isReady = useCallback(() => readyRef.current, [])
  const { isActive, run, confirm, busy, request } = operation

  useEffect(() => {
    if (!enabled) return
    let disposed = false, unlisten
    const window = getCurrentWindow()
    const controller = createDesktopCloseController({
      isActive, run, confirm, readDraft: () => draft.current,
      destroy: () => window.destroy(), report: setProblem,
    })
    window.onCloseRequested(event => {
      event.preventDefault()
      return controller.request()
    }).then(stop => {
      if (disposed) { stop(); return }
      unlisten = stop
      readyRef.current = true
      setReady(true)
    }).catch(error => {
      if (!disposed) setProblem({ kind: 'error', text: `关闭保护未能启动，已暂停本地操作。请重启应用：${error?.message || String(error)}` })
    })
    return () => {
      disposed = true
      controller.dispose()
      readyRef.current = false
      unlisten?.()
    }
  }, [enabled, isActive, run, confirm])

  const notice = problem?.kind === 'busy' && !busy && !request ? '' : problem?.text || ''
  return { ready, isReady, onDraft, notice }
}

import { createRoot } from 'react-dom/client'
import VersionTree from '../../src/version-tree/VersionTree.jsx'
import '../../src/version-tree/version-tree.css'
import './webview.css'

const vscode = window.acquireVsCodeApi()
let nextId = 0
const pending = new Map(), listeners = new Set()
window.addEventListener('message', event => {
  const message = event.data
  if (message?.event === 'refresh') { for (const listener of listeners) listener(); return }
  const request = pending.get(message?.id)
  if (!request) return
  pending.delete(message.id); clearTimeout(request.timeout)
  if (message.error) request.reject(new Error(message.error))
  else request.resolve(message.result)
})
const bridge = {
  request(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = String(++nextId)
      const timeout = setTimeout(() => { pending.delete(id); reject(new Error('请求超时。Git 操作可能仍在运行，请刷新查看状态。')) }, 300000)
      pending.set(id, { resolve, reject, timeout })
      vscode.postMessage({ id, method, params })
    })
  },
  onRefresh(callback) { listeners.add(callback); return () => listeners.delete(callback) },
}
createRoot(document.getElementById('root')).render(<VersionTree bridge={bridge}/> )

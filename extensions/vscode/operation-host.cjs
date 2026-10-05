const { spawn } = require('node:child_process')
const path = require('node:path')

class OperationHost {
  constructor() { this.closed = false; this.pending = new Set() }
  assertOpen() { if (this.closed) throw new Error('Gitviz 已停用，未开始的操作已取消。请重新打开插件。') }
  close() { this.closed = true }
  async drain() { await Promise.allSettled([...this.pending]) }
  execute(service, plan) {
    this.assertOpen()
    if (service.processUncertain) throw new Error('上次 Git 进程状态尚未确认，不能开始新的写入。请检查进程和操作锁。')
    if (plan.used || plan.expires <= Date.now()) throw new Error('确认已过期或已使用，请重新预览。')
    const payload = { root: service.root, git: service.git, plan: { ...plan, used: false } }
    plan.used = true
    const operation = new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [path.join(__dirname, 'operation-worker.cjs')], {
        cwd: service.root, detached: true, windowsHide: true, stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
        env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
      })
      let settled = false, sent = false
      const finish = (error, result) => {
        if (settled) return
        settled = true; clearTimeout(timer)
        if (error) reject(error); else resolve(result)
      }
      const timer = setTimeout(() => {
        finish(new Error('执行进程未能启动。请检查操作记录和 Git 状态后重试。'))
        if (child.connected) child.disconnect()
      }, 15000)
      child.on('message', message => {
        if (message.ready && !sent && !settled) {
          try { this.assertOpen() } catch (error) { finish(error); child.disconnect(); return }
          sent = true; clearTimeout(timer)
          child.send(payload, error => { if (error) finish(new Error(`无法移交操作：${error.message}。请检查操作记录。`)) })
        } else if (!message.ready && sent) finish(message.error ? new Error(message.error) : null, message.result)
      })
      child.on('error', error => finish(new Error(`无法启动执行进程：${error.message}`)))
      child.on('exit', () => { if (!settled) finish(new Error('执行进程异常退出。已有更改和操作锁会保留，请检查 Git 状态与操作记录。')) })
      // The worker owns the operation; the host must be free to exit.
      child.unref(); child.channel?.unref()
    })
    this.pending.add(operation)
    operation.then(() => this.pending.delete(operation), () => this.pending.delete(operation))
    return operation
  }
}
module.exports = { OperationHost }

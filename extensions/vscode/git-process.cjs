const { spawn, execFile } = require('node:child_process')
const path = require('node:path')

function failure(code, message, cause) { return Object.assign(new Error(message, { cause }), { code }) }

async function terminateTree(child) {
  if (!child.pid) return
  if (process.platform === 'win32') {
    // Never target a PID after observing its exit (it may have been reused).
    if (child.exitCode !== null || child.signalCode !== null) throw new Error('Git 主进程已退出，但输出仍未关闭。')
    await new Promise((resolve, reject) => execFile(
      path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'taskkill.exe'),
      ['/PID', String(child.pid), '/T', '/F'],
      { windowsHide: true, timeout: 5000, maxBuffer: 65536 },
      error => error ? reject(error) : resolve(),
    ))
  } else {
    // detached spawn creates a new process group owned by this command.
    process.kill(-child.pid, 'SIGKILL')
  }
}

// Resolve only after process exit, stream closure and requested cleanup finish.
// onStdout may return false to stop a streaming history search successfully.
function runGitProcess(executable, args, options = {}) {
  const { cwd, env = process.env, timeout = 30000, maxBuffer = 32 * 1024 * 1024,
    encoding = 'utf8', onStdout, terminate = terminateTree, cleanupTimeout = 6500 } = options
  return new Promise((resolve, reject) => {
    let child, timer, cleanupTimer, stopped = false, cleanupDone = true, closed = false, settled = false
    let reason, uncertain = false, cleanupFailed = false, exitCode, signal, stdoutBytes = 0, stderrBytes = 0
    const stdout = [], stderr = []
    const finish = () => {
      if (settled || !closed || !cleanupDone) return
      settled = true; clearTimeout(timer); clearTimeout(cleanupTimer)
      const errorText = Buffer.concat(stderr).toString('utf8').trim()
      if (uncertain || (cleanupFailed && exitCode !== 0)) return reject(failure('GIT_PROCESS_UNCERTAIN', `${reason?.message || 'Git 读取已停止。'}\n无法确认 Git 及其子进程已停止；本会话暂停写入。请先检查进程和 Git 状态，再处理保留的操作锁。`, reason))
      if (reason) return reject(reason)
      if (!stopped && exitCode !== 0) return reject(failure('GIT_EXIT', errorText || `Git 未正常结束（${signal || `退出码 ${exitCode}`}）。请检查 Git 状态。`))
      const data = Buffer.concat(stdout)
      resolve(encoding === 'buffer' ? data : data.toString(encoding))
    }
    const stop = error => {
      if (settled || stopped) return
      stopped = true; reason = error; cleanupDone = false; clearTimeout(timer)
      cleanupTimer = setTimeout(() => {
        uncertain = true; cleanupDone = true; closed = true
        child.stdout.destroy(); child.stderr.destroy()
        child.unref()
        finish()
      }, cleanupTimeout)
      Promise.resolve().then(() => terminate(child)).catch(() => { cleanupFailed = true }).finally(() => { cleanupDone = true; finish() })
    }
    try {
      child = spawn(executable, args, { cwd, env, windowsHide: true, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'] })
    } catch (error) { reject(failure('GIT_START', `无法启动 Git：${error.message}`, error)); return }
    child.on('error', error => {
      reason = failure('GIT_START', `无法启动 Git：${error.message}`, error)
      if (!child.pid) { closed = true; finish() }
      else stop(reason)
    })
    for (const pipe of [child.stdout, child.stderr]) pipe.on('error', error => {
      stop(failure('GIT_IO', `读取 Git 输出失败：${error.message}`, error))
    })
    child.stdout.on('data', chunk => {
      if (stopped || settled) return
      if (onStdout) {
        try { if (onStdout(chunk) === false) stop() }
        catch (error) { stop(error) }
      } else {
        stdoutBytes += chunk.length
        if (stdoutBytes > maxBuffer) { stop(failure('GIT_OUTPUT_LIMIT', 'Git 输出超过大小限制，结果未被作为完整数据使用。请缩小读取范围。')); return }
        stdout.push(chunk)
      }
    })
    child.stderr.on('data', chunk => {
      if (stopped || settled) return
      stderrBytes += chunk.length
      if (stderrBytes > maxBuffer) { stop(failure('GIT_OUTPUT_LIMIT', 'Git 错误输出超过大小限制，请检查 Git 配置或钩子。')); return }
      stderr.push(chunk)
    })
    child.on('close', (code, exitSignal) => { closed = true; exitCode = code; signal = exitSignal; finish() })
    timer = setTimeout(() => stop(failure('GIT_TIMEOUT', `Git 操作超过 ${timeout / 1000} 秒。已产生的更改会保留，请检查 Git 状态与操作记录。`)), timeout)
  })
}

module.exports = { runGitProcess, terminateTree }

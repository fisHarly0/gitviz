// Native installed-app smoke via WebView2 CDP; no browser or extra npm dependency.
import fs from 'node:fs/promises'
import path from 'node:path'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'

const root = process.env.GITVIZ_INSTALL_TEST_ROOT, phase = process.env.GITVIZ_INSTALL_TEST_PHASE
if (!root || !path.isAbsolute(root) || !['first', 'reinstall'].includes(phase)) throw Error('Explicit installer scratch and phase required')
const repository = path.join(root, 'repo'), endpoint = 'http://127.0.0.1:9347'
const git = args => execFileSync('git', ['-C', repository, ...args], { encoding: 'utf8', windowsHide: true }).trim()
if (phase === 'first') {
  await fs.mkdir(repository)
  git(['init', '-b', 'main']); git(['config', 'user.name', 'Installer Test Fixture']); git(['config', 'user.email', 'fixture@example.invalid'])
  git(['config', 'commit.gpgsign', 'false']); git(['config', 'core.autocrlf', 'false'])
  for (let i = 1; i <= 3; i++) { await fs.writeFile(path.join(repository, 'note.txt'), `save ${i}\n`); git(['add', '.']); git(['commit', '-m', `installer save ${i}`]) }
}
const expected = { head: git(['rev-parse', 'HEAD']), status: git(['status', '--porcelain']), refs: git(['show-ref']) }
async function wait(check, label) {
  const deadline = Date.now() + 60000
  while (Date.now() < deadline) { if (await check()) return; await delay(200) }
  throw Error(`Timed out: ${label}`)
}
let target
await wait(async () => { try { target = (await (await fetch(`${endpoint}/json/list`, { signal: AbortSignal.timeout(2000) })).json()).find(item => item.type === 'page' && /tauri\.localhost/.test(item.url)); return target } catch { return false } }, 'installed WebView2 target')
const socket = new WebSocket(target.webSocketDebuggerUrl), pending = new Map(), errors = []
await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }) })
let sequence = 0
socket.addEventListener('message', event => {
  const message = JSON.parse(event.data)
  if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.text)
  const request = pending.get(message.id)
  if (request) { pending.delete(message.id); clearTimeout(request.timer); message.error ? request.reject(Error(message.error.message)) : request.resolve(message.result) }
})
const call = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++sequence, timer = setTimeout(() => { pending.delete(id); reject(Error(`CDP timeout: ${method}`)) }, 15000)
  pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params }))
})
const evaluate = async expression => { const result = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (result.exceptionDetails) throw Error(result.exceptionDetails.text); return result.result.value }
try {
  await call('Runtime.enable')
  await wait(() => evaluate('Boolean(window.__TAURI_INTERNALS__ && document.querySelector(".repo-loader"))'), 'native initial screen')
  if (phase === 'first') await evaluate('localStorage.setItem("gitviz-installer-smoke", "keep-after-reinstall")')
  else assert.equal(await evaluate('localStorage.getItem("gitviz-installer-smoke")'), 'keep-after-reinstall', 'reinstall preserves WebView data')
  // Exercise the visible path input. A synthetic startup drop can precede the
  // asynchronous event subscription; a fixed sleep is not a readiness contract.
  await evaluate(`document.querySelector('.repo-loader input[placeholder="粘贴仓库的完整路径"]').focus()`)
  await call('Input.insertText', { text: repository })
  await wait(() => evaluate(`Boolean(document.querySelector('.repo-open-actions button[type="submit"]:not(:disabled)'))`), 'repository path input accepted')
  await evaluate(`document.querySelector('.repo-open-actions button[type="submit"]').click()`)
  await wait(() => evaluate(`Boolean(document.querySelector('.save-node[data-oid="${expected.head}"]'))`), 'installed native app opens real Git repository')
  const original = git(['rev-list', '--max-parents=0', 'HEAD'])
  await evaluate(`document.querySelector('.save-node[data-oid="${original}"]').click()`)
  await wait(() => evaluate(`document.querySelector('.save-node.selected')?.dataset.oid === '${original}'`), 'preview original commit')
  const screenshot = await call('Page.captureScreenshot', { format: 'png' })
  await fs.writeFile(path.join(root, `installed-${phase}.png`), Buffer.from(screenshot.data, 'base64'))
  assert.deepEqual({ head: git(['rev-parse', 'HEAD']), status: git(['status', '--porcelain']), refs: git(['show-ref']) }, expected)
  assert.deepEqual(errors, [])
  await fs.writeFile(path.join(root, `installed-${phase}.json`), JSON.stringify({ phase, nativeStart: true, realHistoryOpened: true, previewUnchangedRepository: true, persistedWebViewData: phase === 'reinstall', errors }, null, 2))
  console.log(`PASS installed app: ${phase}, native WebView, real Git, unchanged repository`)
} catch (error) {
  // Keep the rendered failure before the installer driver closes its own app.
  try {
    const screenshot = await call('Page.captureScreenshot', { format: 'png' })
    await fs.writeFile(path.join(root, `installed-${phase}-failure.png`), Buffer.from(screenshot.data, 'base64'))
    const state = await evaluate(`({text: document.body.innerText, pathInput: document.querySelector('.repo-loader input')?.value, url: location.href})`)
    await fs.writeFile(path.join(root, `installed-${phase}-failure.json`), JSON.stringify({ error: error.message, state, errors }, null, 2))
  } catch (captureError) { console.error('Could not capture native failure:', captureError.message) }
  throw error
} finally { socket.close() }

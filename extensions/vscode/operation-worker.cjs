// One confirmed operation per process; its lifetime is independent of the UI host.
const { GitService } = require('./git-service.cjs')
let accepted = false
const readyTimeout = setTimeout(() => process.exit(1), 15000)
process.on('disconnect', () => { if (!accepted) process.exit(0) })
process.once('message', async request => {
  accepted = true; clearTimeout(readyTimeout)
  let response
  try {
    const service = await GitService.open(request.root, request.git)
    response = { result: await service.executePrepared(request.plan) }
  } catch (error) { response = { error: error.message } }
  if (process.connected) {
    try { process.send(response, () => { if (process.connected) process.disconnect() }) }
    catch { if (process.connected) process.disconnect() }
  }
})
if (process.send) process.send({ ready: true })
else { clearTimeout(readyTimeout); process.exitCode = 1 }

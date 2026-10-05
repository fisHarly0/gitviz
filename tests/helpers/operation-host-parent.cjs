const path = require('node:path')
const directory = process.env.GITVIZ_WORKER_MODULE_DIR || path.resolve(__dirname, '../../extensions/vscode')
const { GitService } = require(path.join(directory, 'git-service.cjs'))
const { OperationHost } = require(path.join(directory, 'operation-host.cjs'))
const host = new OperationHost()
process.on('message', async request => {
  if (request.stop) { host.close(); process.exit(0) }
  try {
    const git = await GitService.open(request.root)
    const expected = { head: await git.head(), branch: await git.branch() }
    const plan = await git.prepareAction('restore', { oid: request.oid, expected })
    const result = await host.execute(git, plan)
    if (process.connected) process.send({ result })
  } catch (error) { if (process.connected) process.send({ error: error.message }) }
})
process.on('disconnect', () => process.exit(0))

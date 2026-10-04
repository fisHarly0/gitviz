// Run inside a real VS Code Extension Host. Scratch paths are explicitly supplied.
const vscode = require('vscode')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
async function run() {
  const output = process.env.GITVIZ_HOST_TEST_DIR
  if (!output) throw new Error('GITVIZ_HOST_TEST_DIR is required')
  const extension = vscode.extensions.getExtension('fisHarly0.gitviz')
  assert.ok(extension, 'extension discovered')
  const api = await extension.activate()
  await vscode.workspace.getConfiguration('window').update('dialogStyle', 'custom', vscode.ConfigurationTarget.Global)
  assert.ok((await vscode.commands.getCommands()).includes('gitviz.open'))
  await api.open()
  const snapshot = await api.getSnapshot()
  assert.ok(snapshot.commits.length >= 6)
  assert.ok(snapshot.commits.some(commit => commit.parents.length === 2))
  await fs.writeFile(path.join(output, 'host-ready.json'), JSON.stringify({ version: vscode.version, snapshot }, null, 2))
  const deadline = Date.now() + 15 * 60 * 1000
  while (Date.now() < deadline) {
    if (await fs.stat(path.join(output, 'ui-done.json')).catch(() => null)) {
      const result = JSON.parse(await fs.readFile(path.join(output, 'ui-done.json'), 'utf8'))
      assert.equal(result.ok, true, 'Webview interaction test')
      const docs = vscode.workspace.textDocuments.filter(doc => doc.uri.scheme === 'gitviz')
      assert.ok(docs.length >= 2, 'native diff opened virtual documents')
      assert.ok(docs.some(doc => doc.getText().includes('theme')), 'diff reads real Git blobs')
      await fs.writeFile(path.join(output, 'host-result.json'), JSON.stringify({ ok: true, version: vscode.version, diffDocuments: docs.length, cases: result.cases }, null, 2))
      return
    }
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
  throw new Error('Timed out waiting for Webview interactions')
}
module.exports = { run }

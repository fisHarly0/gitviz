// Host API seam only: Git preparation and repository assertions use real Git.
const test = require('node:test'), assert = require('node:assert/strict')
const fs = require('node:fs/promises'), path = require('node:path'), vm = require('node:vm')
const { createRequire } = require('node:module')
const { largeRepo } = require('./helpers/large-repo.cjs')

for (const mode of ['panel close', 'deactivate']) test(`late native confirmation cannot write after ${mode}`, async () => {
  const fixture = await largeRepo(2), head = await fixture.git.head(), panels = []
  let confirm, shown
  const confirmationShown = new Promise(resolve => { shown = resolve })
  const disposable = () => ({ dispose() {} })
  const vscode = {
    workspace: {
      isTrusted: true, textDocuments: [], workspaceFolders: [{ name: 'fixture', uri: { scheme: 'file', fsPath: fixture.root } }],
      getConfiguration: () => ({ get() {} }), registerTextDocumentContentProvider: disposable, onDidCloseTextDocument: disposable,
    },
    extensions: { getExtension() {} }, ViewColumn: { Active: 1 },
    Uri: { joinPath: (_, ...parts) => parts.join('/') },
    commands: { registerCommand: disposable },
    window: {
      onDidChangeWindowState: disposable, showInputBox: async () => 'must-not-exist',
      showWarningMessage: (_title, _detail, label) => new Promise(resolve => { confirm = () => resolve(label); shown() }),
      createWebviewPanel: () => {
        const panel = { reveal() {}, webview: { cspSource: 'fixture:', asWebviewUri: value => value, postMessage: async () => true } }
        panel.webview.onDidReceiveMessage = handler => { panel.receive = handler; return disposable() }
        panel.onDidDispose = handler => { panel.close = handler; return disposable() }
        panels.push(panel); return panel
      },
    },
  }
  const filename = path.resolve('extensions/vscode/extension.cjs'), actualRequire = createRequire(filename), mod = { exports: {} }
  vm.runInNewContext(await fs.readFile(filename, 'utf8'), { require: name => name === 'vscode' ? vscode : actualRequire(name), module: mod, process }, { filename })
  const api = mod.exports.activate({ subscriptions: [], extensionUri: 'fixture:' })
  await api.open()
  const request = panels[0].receive({ id: 'late-confirmation', method: 'createBranch', params: { oid: fixture.first, expected: { head, branch: 'main' } } })
  await confirmationShown
  if (mode === 'panel close') { panels[0].close(); await api.open(); assert.equal(panels.length, 2) }
  else mod.exports.deactivate()
  confirm(); await request
  assert.equal(await fixture.git.head(), head)
  assert.equal((await fixture.git.operations()).records.length, 0)
  await assert.rejects(fixture.git.command(['show-ref', '--verify', 'refs/heads/must-not-exist']))
  assert.equal(await fixture.git.status(), '')
  mod.exports.deactivate()
})

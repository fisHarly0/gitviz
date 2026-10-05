const fs = require('node:fs/promises'), path = require('node:path'), assert = require('node:assert/strict')
const { createHash } = require('node:crypto')

module.exports = async function checkClientSource(page, installed) {
  const served = await page.evaluate(async () => {
    const entry = globalThis.__DSH_BOOT__.entries.find(entry => entry.id === '@fisharly/gitviz-dsh')
    const response = await fetch(entry.url)
    return { revision: entry.rev, status: response.status, body: await response.text() }
  })
  const source = await fs.readFile(path.join(installed, 'dist/client.js'), 'utf8')
  assert.equal(served.status, 200)
  assert.ok(served.body.startsWith(source), 'browser boot manifest points to the installed client code')
  assert.match(served.body.slice(source.length), /^\s*;\s*\/\/# sourceMappingURL=[^\r\n]+\s*$/, 'only the DSH source-map annotation follows the package code')
  return { servedClientVerified: true, clientSHA256: createHash('sha256').update(source).digest('hex'), clientRevision: served.revision }
}

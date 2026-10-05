// Only installed in generated test repositories; no production timeout bypass.
const fs = require('node:fs'), path = require('node:path'), { spawn } = require('node:child_process')
const mode = process.argv[2] || 'parent'
fs.writeFileSync(path.join('.git', `process-${mode}.pid`), String(process.pid))
if (mode === 'parent') spawn(process.execPath, [__filename, 'child'], { stdio: 'inherit', windowsHide: true })
setInterval(() => fs.appendFileSync(path.join('.git', `process-${mode}.heartbeat`), '.'), 100)
setTimeout(() => process.exit(0), 60000) // bounded fallback if the test runner crashes
if (mode === 'pipe-child') process.stdout.write('holding inherited output\n')

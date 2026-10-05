const fs = require('node:fs')
fs.writeFileSync('.git/lifecycle-entered', String(process.pid))
const deadline = Date.now() + 30000
const timer = setInterval(() => {
  if (fs.existsSync('.git/lifecycle-release')) { clearInterval(timer); process.exit(0) }
  if (Date.now() > deadline) { clearInterval(timer); process.stderr.write('fixture gate timed out\n'); process.exit(1) }
}, 100)

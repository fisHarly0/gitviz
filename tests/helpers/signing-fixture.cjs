const fs = require('node:fs/promises')
const path = require('node:path')
const { execFile } = require('node:child_process')
const { promisify } = require('node:util')
const exec = promisify(execFile)

// Fixture-only keys and repository-local config. No user keyring or SSH agent.
async function configureSigning(root) {
  const run = (program, args) => exec(program, args, { cwd: root, windowsHide: true, timeout: 15000 })
  const git = async args => (await run('git', args)).stdout.trim()
  const metadata = await git(['rev-parse', '--absolute-git-dir'])
  const directory = path.join(metadata, 'signing fixture')
  await fs.mkdir(directory)
  const key = path.join(directory, 'temporary key').replaceAll('\\', '/')
  await run('ssh-keygen', ['-q', '-t', 'ed25519', '-N', '', '-C', 'gitviz-test-only', '-f', key])
  const signers = path.join(directory, 'allowed signers').replaceAll('\\', '/')
  await fs.writeFile(signers, `fixture@example.invalid ${await fs.readFile(key + '.pub', 'utf8')}`)
  for (const [name, value] of [
    ['gpg.format', 'ssh'], ['gpg.ssh.program', 'ssh-keygen'], ['user.signingkey', key],
    ['gpg.ssh.allowedSignersFile', signers], ['commit.gpgsign', 'true'],
  ]) await git(['config', '--local', name, value])
  return { key, signers }
}

module.exports = { configureSigning }
if (require.main === module) configureSigning(process.argv[2]).then(
  result => process.stdout.write(JSON.stringify(result)),
  error => { console.error(error.message); process.exitCode = 1 },
)

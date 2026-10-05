import fs from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { checkVersion, projectRoot } from './version.mjs'

const directory = path.resolve(process.env.GITVIZ_ARTIFACTS_DIR || 'artifacts'), version = await checkVersion()
const git = args => execFileSync('git', args, { cwd: projectRoot, encoding: 'utf8' }).trim()
const files = []
async function collect(folder) {
  for (const entry of (await fs.readdir(folder, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
    const absolute = path.join(folder, entry.name)
    if (entry.isDirectory()) await collect(absolute)
    else if (entry.isFile() && !['SHA256SUMS.txt', 'build-manifest.json'].includes(entry.name)) {
      const data = await fs.readFile(absolute)
      files.push({ name: path.relative(directory, absolute).replaceAll('\\', '/'), bytes: data.length, sha256: createHash('sha256').update(data).digest('hex') })
    } else if (entry.isSymbolicLink()) throw Error('Artifact directory must not contain symlinks')
  }
}
await collect(directory)
if (!files.length) throw Error('No artifacts to record')
const manifest = { version, commit: git(['rev-parse', 'HEAD']), dirty: Boolean(git(['status', '--porcelain'])), platform: process.platform, arch: process.arch, node: process.version, rust: execFileSync('rustc', ['--version'], { encoding: 'utf8' }).trim(), files }
await fs.writeFile(path.join(directory, 'build-manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
const manifestBytes = await fs.readFile(path.join(directory, 'build-manifest.json'))
files.push({ name: 'build-manifest.json', sha256: createHash('sha256').update(manifestBytes).digest('hex') })
await fs.writeFile(path.join(directory, 'SHA256SUMS.txt'), files.map(file => `${file.sha256}  ${file.name}\n`).join(''))
console.log(`Recorded ${files.length - 1} artifacts for ${version} (${manifest.commit.slice(0, 7)}${manifest.dirty ? ', modified working tree' : ''})`)

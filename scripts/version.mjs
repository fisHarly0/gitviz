import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const manifests = ['package.json', 'extensions/vscode/package.json', 'extensions/dsh/package.json', 'src-tauri/tauri.conf.json']
const cargoVersion = /(\[package\][\s\S]*?\nversion = ")[^"]+("|$)/
const lockVersion = /(\[\[package\]\]\r?\nname = "gitviz"\r?\nversion = ")[^"]+("|$)/

export async function checkVersion(root = projectRoot) {
  const files = await Promise.all(manifests.map(async file => [file, JSON.parse(await fs.readFile(path.join(root, file), 'utf8')).version]))
  const version = files[0][1]
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw Error('Use a numeric x.y.z version supported by all three hosts')
  const lock = JSON.parse(await fs.readFile(path.join(root, 'package-lock.json'), 'utf8'))
  files.push(['package-lock.json', lock.version], ['package-lock.json packages root', lock.packages[''].version])
  for (const [file, pattern] of [['src-tauri/Cargo.toml', cargoVersion], ['src-tauri/Cargo.lock', lockVersion]]) {
    const value = (await fs.readFile(path.join(root, file), 'utf8')).match(pattern)?.[0].match(/version = "([^"]+)"/)?.[1]
    files.push([file, value])
  }
  for (const [file, actual] of files) if (actual !== version) throw Error(`${file}: expected ${version}, got ${actual}`)
  return version
}

async function setVersion(version) {
  if (!/^\d+\.\d+\.\d+$/.test(version || '')) throw Error('Usage: npm run version:set -- x.y.z')
  for (const file of [...manifests, 'package-lock.json']) {
    const target = path.join(projectRoot, file), data = JSON.parse(await fs.readFile(target, 'utf8'))
    data.version = version
    if (file === 'package-lock.json') data.packages[''].version = version
    await fs.writeFile(target, JSON.stringify(data, null, 2) + '\n')
  }
  for (const [file, pattern] of [['src-tauri/Cargo.toml', cargoVersion], ['src-tauri/Cargo.lock', lockVersion]]) {
    const target = path.join(projectRoot, file), text = await fs.readFile(target, 'utf8')
    if (!pattern.test(text)) throw Error(`Missing package version in ${file}`)
    await fs.writeFile(target, text.replace(pattern, (_, prefix, suffix) => prefix + version + suffix))
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv[2] === 'set') await setVersion(process.argv[3])
  else if (process.argv[2] && process.argv[2] !== 'check') throw Error('Expected check or set')
  const version = await checkVersion()
  if (process.env.GITHUB_REF_TYPE === 'tag' && process.env.GITHUB_REF_NAME !== `v${version}`) throw Error(`Tag must be v${version}`)
  console.log(`All manifests and locks agree: ${version}`)
}

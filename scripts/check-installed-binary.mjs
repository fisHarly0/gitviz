import fs from 'node:fs/promises'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

// Tauri 2.11.2 patches UNK -> NSS for the NSIS payload, then restores the raw exe.
// Compare every byte after that one documented marker; never rewrite either file.
export async function checkInstalledBinary(reference, installed) {
  const raw = await fs.readFile(reference), actual = await fs.readFile(installed)
  const unknown = Buffer.from('__TAURI_BUNDLE_TYPE_VAR_UNK'), nsis = Buffer.from('__TAURI_BUNDLE_TYPE_VAR_NSS')
  const offset = raw.indexOf(unknown)
  assert.ok(offset >= 0 && raw.indexOf(unknown, offset + 1) === -1, 'Raw executable must contain exactly one Tauri UNK bundle marker')
  const expected = Buffer.from(raw)
  nsis.copy(expected, offset)
  assert.ok(actual.equals(expected), 'Installed executable differs beyond the documented Tauri NSIS marker')
  const hash = bytes => createHash('sha256').update(bytes).digest('hex')
  return { referenceSHA256: hash(raw), installedSHA256: hash(actual), bytes: actual.length, bundleMarker: 'UNK -> NSS', markerOffset: offset, allOtherBytesIdentical: true }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 4) throw Error('Usage: node scripts/check-installed-binary.mjs <raw exe> <installed exe>')
  console.log(JSON.stringify(await checkInstalledBinary(process.argv[2], process.argv[3]), null, 2))
}

const fs = require('node:fs/promises')
const path = require('node:path')
const { randomUUID } = require('node:crypto')

const ID = /^[a-f0-9]{12}-[a-f0-9]{32}$/
const MAX_BYTES = 65536
const exists = async name => fs.lstat(name).catch(error => { if (error.code === 'ENOENT') return null; throw error })

class OperationJournal {
  constructor(service) { this.service = service }

  async directory(create = false) {
    const gitDirectory = (await this.service.command(['rev-parse', '--absolute-git-dir'])).trim()
    let folder = await fs.realpath(gitDirectory)
    for (const name of ['gitviz', 'operations']) {
      folder = path.join(folder, name)
      if (create) await fs.mkdir(folder).catch(error => { if (error.code !== 'EEXIST') throw error })
      const info = await exists(folder)
      if (!info) return null
      if (info.isSymbolicLink() || !info.isDirectory() || path.resolve(await fs.realpath(folder)) !== path.resolve(folder)) throw new Error('操作记录目录不能经过链接。请检查 Git 元数据。')
    }
    return folder
  }

  async read(id, validatedDirectory) {
    if (!ID.test(id || '')) throw new Error('无效的操作记录编号。')
    const folder = validatedDirectory || await this.directory()
    if (!folder) throw new Error('操作记录不存在。')
    const file = path.join(folder, id + '.json'), info = await exists(file)
    if (!info || !info.isFile() || info.isSymbolicLink() || info.size > MAX_BYTES) throw new Error('操作记录缺失、过大或不是普通文件。')
    const record = JSON.parse(await fs.readFile(file, 'utf8'))
    if (record.version !== 1 || record.id !== id || typeof record.repo !== 'string' || await fs.realpath(record.repo) !== await fs.realpath(this.service.root)) throw new Error('操作记录不属于当前工作区或版本不支持。')
    return record
  }

  async list({ before, limit = 30 } = {}) {
    if (before && !ID.test(before)) throw new Error('操作记录分页已失效。')
    const folder = await this.directory()
    if (!folder) return { records: [], nextCursor: null }
    const names = (await fs.readdir(folder)).filter(name => name.endsWith('.json') && ID.test(name.slice(0, -5))).map(name => name.slice(0, -5)).sort().reverse().filter(id => !before || id < before)
    const count = Math.max(1, Math.min(100, Number.isSafeInteger(limit) ? limit : 30))
    const records = []
    for (const id of names.slice(0, count)) {
      try { records.push(await this.read(id, folder)) }
      catch (error) { records.push({ id, state: 'unreadable', error: error.message }) }
    }
    return { records, nextCursor: names.length > count ? names[count - 1] : null }
  }

  async save(record) {
    if (!ID.test(record.id)) throw new Error('无效的操作记录编号。')
    const folder = await this.directory(true), destination = path.join(folder, record.id + '.json')
    const prior = await exists(destination)
    if (prior && (prior.isSymbolicLink() || !prior.isFile())) throw new Error('操作记录不是普通文件。')
    const data = JSON.stringify(record, null, 2)
    if (Buffer.byteLength(data) > MAX_BYTES) throw new Error('操作记录超过大小限制。')
    const temporary = path.join(folder, record.id + '.' + randomUUID() + '.tmp')
    const file = await fs.open(temporary, 'wx', 0o600)
    try { await file.writeFile(data); await file.sync() } finally { await file.close() }
    await fs.rename(temporary, destination)
  }

  async begin(action, params, before) {
    const startedAt = Date.now()
    const record = { version: 1, id: `${startedAt.toString(16).padStart(12, '0')}-${randomUUID().replaceAll('-', '')}`, action, params, before,
      repo: await fs.realpath(this.service.root), state: 'running', startedAt, updatedAt: startedAt, attempts: 1 }
    await this.save(record)
    return record
  }

  async checkpoint(record, message) {
    record.checkpoint = { tree: (await this.service.command(['write-tree'])).trim(), message }
    record.updatedAt = Date.now()
    await this.save(record)
  }

  async finish(record, result, error) {
    record.state = error ? 'failed' : 'completed'; record.updatedAt = Date.now()
    record.error = error ? String(error.message || error).slice(0, 4000) : null
    if (record.error) record.lastError = record.error
    record.result = { ...result, head: await this.service.head().catch(() => null), branch: await this.service.branch() }
    await this.save(record)
  }
}

module.exports = { OperationJournal }

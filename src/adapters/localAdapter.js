import git from 'isomorphic-git'
import LightningFS from '@isomorphic-git/lightning-fs'
import { ADAPTER_KIND } from './RepoAdapter.js'

const FS_NAME = 'gitviz-fs'
const ROOT = '/repo'

export function getFs() {
  return new LightningFS(FS_NAME)
}

export async function clearFs() {
  await new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase(FS_NAME)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
    req.onblocked = () => resolve()
  })
}

/**
 * Copy files chosen via <input webkitdirectory> into LightningFS at /repo.
 * @param {FileList} fileList
 * @param {(progress: { done: number, total: number, current: string }) => void} [onProgress]
 */
export async function loadFilesIntoFs(fileList, onProgress) {
  await clearFs()
  const fs = getFs().promises
  const files = Array.from(fileList)

  const total = files.length
  let done = 0

  await fs.mkdir(ROOT).catch(() => {})

  const mkdirs = new Set()
  async function ensureDir(dirPath) {
    if (mkdirs.has(dirPath)) return
    const parts = dirPath.split('/').filter(Boolean)
    let acc = ''
    for (const part of parts) {
      acc += '/' + part
      if (!mkdirs.has(acc)) {
        await fs.mkdir(acc).catch(() => {})
        mkdirs.add(acc)
      }
    }
  }

  let gitFileCount = 0
  let gitObjectCount = 0
  const sampleGitObjects = []
  for (const file of files) {
    const rel = file.webkitRelativePath || file.name
    const firstSlash = rel.indexOf('/')
    const inner = firstSlash >= 0 ? rel.slice(firstSlash + 1) : rel
    const target = ROOT + '/' + inner
    const dirOf = target.slice(0, target.lastIndexOf('/'))
    await ensureDir(dirOf)
    const buf = new Uint8Array(await file.arrayBuffer())
    await fs.writeFile(target, buf)
    done++
    if (inner.startsWith('.git/')) gitFileCount++
    if (inner.startsWith('.git/objects/') && !inner.endsWith('/info/packs')) {
      gitObjectCount++
      if (sampleGitObjects.length < 8) sampleGitObjects.push(inner)
    }
    if (onProgress && (done % 50 === 0 || done === total)) {
      onProgress({ done, total, current: inner })
    }
  }
  // 加载完输出 debug 摘要让 F12 console 能看到 webkitdirectory 实际抓到的内容
  console.log('[gitviz] webkitdirectory loaded', done, 'files ·', gitFileCount, '.git files ·', gitObjectCount, '.git/objects entries')
  if (gitFileCount === 0) {
    console.warn('[gitviz] webkitdirectory skipped the .git folder (browser limitation). Use the "Choose folder (modern)" button instead.')
  } else {
    console.log('[gitviz] sample .git/objects paths:', sampleGitObjects)
  }
  return { dir: ROOT }
}

/**
 * 用 File System Access API (Chrome 86+) 加载目录 · 比 webkitdirectory 可靠
 * 关键优势：能读 dot 开头的隐藏目录（如 .git），webkitdirectory 在浏览器层面会过滤
 * @param {FileSystemDirectoryHandle} dirHandle
 * @param {(progress: { done: number, total: number, current: string }) => void} [onProgress]
 */
export async function loadDirHandleIntoFs(dirHandle, onProgress) {
  await clearFs()
  const fs = getFs().promises

  await fs.mkdir(ROOT).catch(() => {})

  // 第一遍扫一遍数总文件数（progress 用）
  let total = 0
  async function countFiles(handle) {
    for await (const entry of handle.values()) {
      if (entry.kind === 'file') total++
      else if (entry.kind === 'directory') await countFiles(entry)
    }
  }
  await countFiles(dirHandle)

  let done = 0
  let gitFileCount = 0
  let gitObjectCount = 0
  const sampleGitObjects = []
  const mkdirs = new Set()
  async function ensureDir(dirPath) {
    if (mkdirs.has(dirPath)) return
    const parts = dirPath.split('/').filter(Boolean)
    let acc = ''
    for (const part of parts) {
      acc += '/' + part
      if (!mkdirs.has(acc)) {
        await fs.mkdir(acc).catch(() => {})
        mkdirs.add(acc)
      }
    }
  }

  async function walk(handle, prefix) {
    for await (const entry of handle.values()) {
      const inner = prefix ? `${prefix}/${entry.name}` : entry.name
      if (entry.kind === 'file') {
        try {
          const file = await entry.getFile()
          const target = ROOT + '/' + inner
          const dirOf = target.slice(0, target.lastIndexOf('/'))
          await ensureDir(dirOf)
          const buf = new Uint8Array(await file.arrayBuffer())
          await fs.writeFile(target, buf)
          done++
          if (inner.startsWith('.git/')) gitFileCount++
          if (inner.startsWith('.git/objects/') && !inner.endsWith('/info/packs')) {
            gitObjectCount++
            if (sampleGitObjects.length < 8) sampleGitObjects.push(inner)
          }
          if (onProgress && (done % 50 === 0 || done === total)) {
            onProgress({ done, total, current: inner })
          }
        } catch (e) {
          console.warn('[gitviz] skip file', inner, e?.message)
        }
      } else if (entry.kind === 'directory') {
        await walk(entry, inner)
      }
    }
  }
  await walk(dirHandle, '')

  console.log('[gitviz] FSA API loaded', done, 'files ·', gitFileCount, '.git files ·', gitObjectCount, '.git/objects entries')
  if (gitObjectCount === 0) {
    console.warn('[gitviz] .git/objects/ is empty — the picked folder may not be a git repo root.')
  } else {
    console.log('[gitviz] sample .git/objects paths:', sampleGitObjects)
  }
  return { dir: ROOT }
}

function parseAuthor(c) {
  const a = c.commit.author
  return `${a.name} <${a.email}>`
}

function firstLine(s) {
  const i = s.indexOf('\n')
  return i < 0 ? s : s.slice(0, i)
}

export function createLocalAdapter() {
  const fs = getFs()
  const dir = ROOT

  async function readBlobUtf8(oid) {
    try {
      const { blob } = await git.readBlob({ fs, dir, oid })
      return new TextDecoder('utf-8', { fatal: false }).decode(blob)
    } catch {
      return ''
    }
  }

  /** @type {import('./RepoAdapter.js').RepoAdapter} */
  const adapter = {
    kind: () => ADAPTER_KIND.LOCAL,

    async listBranches() {
      const names = await git.listBranches({ fs, dir })
      const refs = []
      for (const name of names) {
        try {
          const oid = await git.resolveRef({ fs, dir, ref: name })
          refs.push({ name, oid })
        } catch {
          /* 某 ref 解析失败忽略 */
        }
      }
      return refs
    },

    async listTags() {
      const names = await git.listTags({ fs, dir })
      const refs = []
      for (const name of names) {
        try {
          const oid = await git.resolveRef({ fs, dir, ref: `refs/tags/${name}` })
          refs.push({ name, oid })
        } catch {
          /* 某 tag 解析失败忽略 */
        }
      }
      return refs
    },

    async listCommits({ ref, depth = 200 } = {}) {
      const opts = { fs, dir, depth }
      if (ref) opts.ref = ref
      const commits = await git.log(opts)
      return commits.map((c) => ({
        oid: c.oid,
        parents: c.commit.parent || [],
        message: firstLine(c.commit.message),
        fullMessage: c.commit.message,
        author: parseAuthor(c),
        timestamp: c.commit.author.timestamp,
      }))
    },

    async getCommitDetail(oid) {
      const obj = await git.readCommit({ fs, dir, oid })
      const parents = obj.commit.parent || []
      const parentOid = parents[0] // null for root, ignore other parents for diff
      const trees = parentOid
        ? [git.TREE({ ref: parentOid }), git.TREE({ ref: oid })]
        : [git.TREE({ ref: oid })]

      const changes = await git.walk({
        fs,
        dir,
        trees,
        map: async (filepath, entries) => {
          if (filepath === '.' || !entries) return
          const [A, B] = parentOid ? entries : [null, entries[0]]
          const aType = A ? await A.type() : null
          const bType = B ? await B.type() : null
          if (aType === 'tree' || bType === 'tree') return
          const Aoid = A ? await A.oid() : undefined
          const Boid = B ? await B.oid() : undefined
          if (Aoid === Boid) return
          let status = 'modify'
          if (Aoid === undefined) status = 'add'
          else if (Boid === undefined) status = 'remove'
          return { path: filepath, status, oldOid: Aoid, newOid: Boid }
        },
      })

      const files = []
      for (const change of changes) {
        if (!change) continue
        const oldText = change.oldOid ? await readBlobUtf8(change.oldOid) : ''
        const newText = change.newOid ? await readBlobUtf8(change.newOid) : ''
        files.push({
          path: change.path,
          status: change.status,
          oldText,
          newText,
        })
      }

      return {
        commit: {
          oid: obj.oid,
          parents,
          message: firstLine(obj.commit.message),
          fullMessage: obj.commit.message,
          author: `${obj.commit.author.name} <${obj.commit.author.email}>`,
          timestamp: obj.commit.author.timestamp,
        },
        files,
      }
    },

    async getFileHistory(path) {
      const commits = await git.log({ fs, dir, filepath: path, follow: true, depth: 200 })
      return commits.map((c) => ({
        oid: c.oid,
        parents: c.commit.parent || [],
        message: firstLine(c.commit.message),
        fullMessage: c.commit.message,
        author: parseAuthor(c),
        timestamp: c.commit.author.timestamp,
      }))
    },

    // === 写入路径（P1 新加 · 游戏存档式 if 分支语义） ===

    /** debug 诊断：列 LightningFS 里 .git/objects/<prefix>/ 实际内容 + 抽 .git 顶层 + 试读文件 */
    async diagnose(oidPrefix) {
      const out = {
        gitRoot: [],
        objectsDir: [],
        prefixDir: [],
        hasFile: false,
        fileSize: null,
        fileFirstBytes: null,
        readError: null,
        headRefPath: null,
        headRefContent: null,
        masterRefPath: null,
        masterRefContent: null,
      }
      try {
        out.gitRoot = await fs.promises.readdir(dir + '/.git')
      } catch (e) {
        out.gitRoot = ['<readdir error: ' + e.message + '>']
      }
      try {
        out.objectsDir = await fs.promises.readdir(dir + '/.git/objects')
      } catch (e) {
        out.objectsDir = ['<readdir error: ' + e.message + '>']
      }
      try {
        const head = await fs.promises.readFile(dir + '/.git/HEAD')
        out.headRefContent = new TextDecoder().decode(head).trim()
      } catch (e) {
        out.headRefContent = '<read error: ' + e.message + '>'
      }
      try {
        const masterRef = await fs.promises.readFile(dir + '/.git/refs/heads/master')
        out.masterRefContent = new TextDecoder().decode(masterRef).trim()
      } catch (e) {
        out.masterRefContent = '<read error: ' + e.message + '>'
      }
      if (oidPrefix && oidPrefix.length >= 2) {
        const prefix = oidPrefix.slice(0, 2)
        const rest = oidPrefix.slice(2)
        const objPath = dir + '/.git/objects/' + prefix + '/' + rest
        try {
          out.prefixDir = await fs.promises.readdir(dir + '/.git/objects/' + prefix)
          out.hasFile = out.prefixDir.some((f) => f === rest)
        } catch (e) {
          out.prefixDir = ['<readdir error: ' + e.message + '>']
        }
        // 真试读这个 object 文件
        try {
          const buf = await fs.promises.readFile(objPath)
          out.fileSize = buf.byteLength || buf.length
          const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
          out.fileFirstBytes = Array.from(u8.slice(0, 8))
            .map((b) => b.toString(16).padStart(2, '0'))
            .join(' ')
        } catch (e) {
          out.readError = e.message + ' (code=' + e.code + ')'
        }
        // 直接调 isomorphic-git API 看 internal error
        try {
          const obj = await git.readObject({ fs, dir, oid: oidPrefix })
          out.readObjectOk = `type=${obj.type} format=${obj.format}`
        } catch (e) {
          out.readObjectErr =
            `${e.name || 'Error'}: ${e.message}` +
            (e.code ? ` (code=${e.code})` : '') +
            (e.data ? ` data=${JSON.stringify(e.data)}` : '')
        }
        // wrappedFs · 把 isomorphic-git 内部 fs 调用全部日志化暴露真实错误
        const fsLog = []
        const wrappedPromises = {}
        const cmds = ['readFile', 'writeFile', 'mkdir', 'rmdir', 'unlink', 'stat', 'lstat', 'readdir', 'readlink', 'symlink']
        for (const cmd of cmds) {
          const orig = fs.promises[cmd]
          if (typeof orig === 'function') {
            wrappedPromises[cmd] = async (...args) => {
              try {
                const r = await orig.apply(fs.promises, args)
                fsLog.push(`${cmd}(${args[0]}) → OK${r && r.byteLength !== undefined ? ' (' + r.byteLength + 'b)' : ''}`)
                return r
              } catch (e) {
                fsLog.push(`${cmd}(${args[0]}) → FAIL: ${e.code || e.name}: ${e.message}`)
                throw e
              }
            }
          }
        }
        const wrappedFs = Object.create(fs)
        Object.defineProperty(wrappedFs, 'promises', { value: wrappedPromises, enumerable: true })
        try {
          await git.readObject({ fs: wrappedFs, dir, oid: oidPrefix })
          out.wrappedReadObject = 'OK with wrapped fs'
        } catch (e) {
          out.wrappedReadObject = `FAIL: ${e.message}`
        }
        out.fsCallLog = fsLog.slice(-20).join('\n  · ')
        // 显式 gitdir
        try {
          await git.readObject({ fs, gitdir: dir + '/.git', oid: oidPrefix })
          out.readObjectGitdir = 'OK with explicit gitdir'
        } catch (e) {
          out.readObjectGitdir = e.message
        }
        // 用 readCommit
        try {
          const c = await git.readCommit({ fs, dir, oid: oidPrefix })
          out.readCommit = 'OK · author=' + c.commit.author.name
        } catch (e) {
          out.readCommit = e.message
        }
        // 用 fs.promises.readFile 试 isomorphic-git 期望的 path
        const expectedPath = `${dir}/.git/objects/${oidPrefix.slice(0, 2)}/${oidPrefix.slice(2)}`
        try {
          const b = await fs.promises.readFile(expectedPath)
          out.fsTestPath = `OK · path=${expectedPath} · ${b.byteLength || b.length} bytes`
        } catch (e) {
          out.fsTestPath = `FAIL · path=${expectedPath} · ${e.message}`
        }
        // 也试 resolveRef('master')
        try {
          out.resolveRefMaster = await git.resolveRef({ fs, dir, ref: 'master' })
        } catch (e) {
          out.resolveRefMaster = '<error: ' + e.message + '>'
        }
        // 也试 resolveRef('HEAD')
        try {
          out.resolveRefHead = await git.resolveRef({ fs, dir, ref: 'HEAD' })
        } catch (e) {
          out.resolveRefHead = '<error: ' + e.message + '>'
        }
      }
      return out
    },

    /**
     * 起新分支 from 某 commit oid，不动 HEAD
     * @param {string} name
     * @param {string} fromOid
     */
    async createBranch(name, fromOid) {
      await git.branch({ fs, dir, ref: name, object: fromOid, checkout: false })
    },

    /**
     * 真 checkout 分支（force：丢工作区改动）
     * MVP 用 force=true 因为 preview 时本来就没改动 · 进 if 分支 = 干净切换
     */
    async checkout(branchName) {
      await git.checkout({ fs, dir, ref: branchName, force: true })
    },

    /** 当前 HEAD 指向的分支名（如 'main' 或 'if-xxx-1'）· detached 时返 null */
    async currentBranch() {
      try {
        return await git.currentBranch({ fs, dir, fullname: false })
      } catch {
        return null
      }
    },

    /** 当前 HEAD 的 commit oid */
    async headOid() {
      try {
        return await git.resolveRef({ fs, dir, ref: 'HEAD' })
      } catch {
        return null
      }
    },

    /** 读某 commit 时刻某文件的内容（UTF-8 文本）· 用于 EditorPanel 拉初始 content */
    async readFileAt(filepath, oid) {
      try {
        const { blob } = await git.readBlob({ fs, dir, oid, filepath })
        return new TextDecoder('utf-8', { fatal: false }).decode(blob)
      } catch {
        return ''
      }
    },

    /** 写文件到工作区（不动 index · 后续 addAndCommit 会 add 它） */
    async writeFile(filepath, content) {
      const full = dir + '/' + filepath
      const idx = full.lastIndexOf('/')
      const dirOf = full.slice(0, idx)
      // 确保父目录存在
      const parts = dirOf.split('/').filter(Boolean)
      let acc = ''
      for (const p of parts) {
        acc += '/' + p
        await fs.promises.mkdir(acc).catch(() => {})
      }
      const buf = new TextEncoder().encode(content)
      await fs.promises.writeFile(full, buf)
    },

    /** add 单个文件 + commit · 返回新 commit oid */
    async addAndCommit(filepath, message, author) {
      const auth = author || {
        name: 'gitviz-player',
        email: 'player@gitviz.local',
      }
      await git.add({ fs, dir, filepath })
      const oid = await git.commit({
        fs,
        dir,
        message: message || 'gitviz: if-line edit',
        author: { ...auth, timestamp: Math.floor(Date.now() / 1000), timezoneOffset: 0 },
      })
      return oid
    },

    /**
     * 导出某分支的所有 reachable git objects 到 packfile + ref · 给 Export 按钮用
     * 调用方负责打包成 .zip 下载
     */
    async exportBranchAsBundle(branchName) {
      const headOid = await git.resolveRef({ fs, dir, ref: branchName })
      // 收集所有 reachable oids（commits / trees / blobs）
      const oids = new Set()
      const commits = await git.log({ fs, dir, ref: branchName, depth: 9999 })
      for (const c of commits) {
        oids.add(c.oid)
        try {
          await git.walk({
            fs,
            dir,
            trees: [git.TREE({ ref: c.oid })],
            map: async (filepath, entries) => {
              if (!entries || !entries[0]) return
              const o = await entries[0].oid()
              if (o) oids.add(o)
              return undefined
            },
          })
        } catch {
          /* 某 commit 的 tree walk 失败忽略 · pack 体积少几个 blob 不影响 import */
        }
        try {
          const cobj = await git.readCommit({ fs, dir, oid: c.oid })
          if (cobj.commit.tree) oids.add(cobj.commit.tree)
        } catch {
          /* commit 读不到忽略 */
        }
      }
      const { packfile, filename } = await git.packObjects({
        fs,
        dir,
        oids: [...oids],
        write: false,
      })
      return { packfile, packname: filename, ref: branchName, headOid }
    },
  }

  return adapter
}

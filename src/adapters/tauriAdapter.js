import { invoke } from '@tauri-apps/api/core'
import { ADAPTER_KIND } from './RepoAdapter.js'

export async function openRepo(path) {
  return invoke('open_repo', { path })
}

export function createTauriAdapter() {
  /** @type {import('./RepoAdapter.js').RepoAdapter} */
  const adapter = {
    kind: () => ADAPTER_KIND.LOCAL,

    async listBranches() {
      return invoke('list_branches')
    },

    async listTags() {
      return []
    },

    async listCommits({ ref, depth = 200 } = {}) {
      return invoke('list_commits', { branch: ref || null, depth })
    },

    async getCommitDetail(oid) {
      return invoke('get_commit_detail', { oid })
    },

    async getFileHistory() {
      return []
    },

    async createBranch(name, fromOid) {
      return invoke('create_branch', { name, fromOid })
    },

    async checkout(branchName) {
      return invoke('checkout', { branch: branchName })
    },

    async currentBranch() {
      return invoke('current_branch')
    },

    async headOid() {
      return invoke('head_oid')
    },

    async readFileAt(filepath, oid) {
      try {
        return await invoke('read_file_at', { path: filepath, oid })
      } catch {
        return ''
      }
    },

    async writeFile(filepath, content) {
      return invoke('write_file', { path: filepath, content })
    },

    async addAndCommit(filepath, message, author) {
      const a = author || { name: 'gitviz-player', email: 'player@gitviz.local' }
      return invoke('add_and_commit', {
        path: filepath,
        message: message || 'gitviz: if-line edit',
        authorName: a.name,
        authorEmail: a.email,
      })
    },

    async exportBranchAsBundle(branchName) {
      const r = await invoke('export_bundle', { branch: branchName })
      // P-Tauri-1.3 走 loose-objects 路径而非 packfile (gix-pack low-level 太复杂)
      // 每个 object 是 zlib-compressed 的 git loose object format
      // path 形如 "ab/cdef..." 直接对应 .git/objects/ 布局
      return {
        objects: r.objects.map((o) => ({
          path: o.path,
          bytes: new Uint8Array(o.bytes),
        })),
        ref: r.refName,
        headOid: r.headOid,
      }
    },
  }
  return adapter
}

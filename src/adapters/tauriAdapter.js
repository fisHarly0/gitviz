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
      return {
        packfile: new Uint8Array(r.packfile),
        packname: r.packname,
        ref: r.refName,
        headOid: r.headOid,
      }
    },
  }
  return adapter
}

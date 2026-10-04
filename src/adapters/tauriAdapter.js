import { invoke } from '@tauri-apps/api/core'
import { ADAPTER_KIND } from './RepoAdapter.js'

export async function openRepo(path) {
  return invoke('open_repo', { path })
}

export function createTauriAdapter({ repo, confirm, run } = {}) {
  const request = async (command, args) => {
    try { return await invoke(command, args) }
    catch (reason) { throw reason instanceof Error ? reason : new Error(String(reason)) }
  }
  /** @type {import('./RepoAdapter.js').RepoAdapter} */
  const adapter = {
    kind: () => ADAPTER_KIND.LOCAL,
    historyId: crypto.randomUUID(),
    confirmDiscard: () => confirm({ title: '放弃当前编辑？', impact: '尚未保存到磁盘的编辑内容将丢弃。已经创建的分支和已保存的文件会保留。', confirmLabel: '放弃编辑' }),

    async historyRequest(method, params = {}) {
      try {
        if (method === 'snapshot') return await invoke('history_snapshot', { limit: 300 })
        if (method === 'historyPage') return await invoke('history_page', { params })
        if (method === 'searchHistory') return await invoke('history_search', { params })
        throw new Error('不支持的历史请求。')
      } catch (reason) {
        throw reason instanceof Error ? reason : new Error(String(reason))
      }
    },

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

    async performAction(action, expected) {
      if (!repo || !confirm || !run) throw new Error('仓库会话不完整，请重新打开仓库。')
      return run(async () => {
        const plan = await request('desktop_prepare', { action, expected: { ...expected, repo } })
        if (!await confirm(plan)) { await request('desktop_cancel', { token: plan.token }); return { cancelled: true } }
        return request('desktop_execute', { token: plan.token })
      })
    },

    async checkout(name, expected) {
      return adapter.performAction({ action: 'switchBranch', name }, expected)
    },

    async forkEdit(name, oid, expected) {
      return adapter.performAction({ action: 'forkEdit', name, oid }, expected)
    },

    async currentBranch() {
      return invoke('current_branch')
    },

    async headOid() {
      return invoke('head_oid')
    },

    async readFileAt(filepath, oid) {
      return request('read_file_at', { path: filepath, oid })
    },

    async saveEdit(path, content, message, expected) {
      return adapter.performAction({ action: 'saveEdit', path, content, message }, expected)
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

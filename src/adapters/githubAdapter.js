import { Octokit } from '@octokit/rest'
import { ADAPTER_KIND } from './RepoAdapter.js'

const PAT_KEY = 'gitviz:gh-pat'

export function savePAT(token) {
  try {
    if (token) sessionStorage.setItem(PAT_KEY, token)
    else sessionStorage.removeItem(PAT_KEY)
    return true
  } catch {
    return false
  }
}

export function loadPAT() {
  try {
    return sessionStorage.getItem(PAT_KEY) || ''
  } catch {
    return ''
  }
}

export function parseRepoSpec(input) {
  const trimmed = input.trim().replace(/\/$/, '').replace(/\.git$/, '')
  const m = trimmed.match(/^(?:https?:\/\/github\.com\/)?([A-Za-z0-9][A-Za-z0-9-]*)\/([A-Za-z0-9_.-]+)$/i)
  if (!m || /^\.+$/.test(m[2])) throw new Error('Use owner/repo or a GitHub repository URL, such as fisHarly0/gitviz.')
  return { owner: m[1], repo: m[2] }
}

function firstLine(s) {
  const i = s.indexOf('\n')
  return i < 0 ? s : s.slice(0, i)
}

function mapCommit(c) {
  const author = c.commit?.author?.name || c.author?.login || 'unknown'
  const email = c.commit?.author?.email || ''
  const ts = c.commit?.author?.date
    ? Math.floor(new Date(c.commit.author.date).getTime() / 1000)
    : 0
  return {
    oid: c.sha,
    parents: (c.parents || []).map((p) => p.sha),
    message: firstLine(c.commit?.message || ''),
    fullMessage: c.commit?.message || '',
    author: email ? `${author} <${email}>` : author,
    timestamp: ts,
  }
}

export function createGithubAdapter({ owner, repo, token }) {
  const octokit = new Octokit({ ...(token ? { auth: token } : {}), request: { timeout: 15000 } })

  return {
    kind: () => ADAPTER_KIND.GITHUB,
    spec: { owner, repo },

    async listBranches() {
      const res = await octokit.repos.listBranches({ owner, repo, per_page: 100 })
      return res.data.map((b) => ({ name: b.name, oid: b.commit.sha }))
    },

    async listTags() {
      const res = await octokit.repos.listTags({ owner, repo, per_page: 100 })
      return res.data.map((t) => ({ name: t.name, oid: t.commit.sha }))
    },

    async listCommits({ ref, depth = 100 } = {}) {
      const opts = { owner, repo, per_page: Math.min(depth, 100) }
      if (ref) opts.sha = ref
      const res = await octokit.repos.listCommits(opts)
      return res.data.map(mapCommit)
    },

    async getCommitDetail(oid) {
      const res = await octokit.repos.getCommit({ owner, repo, ref: oid })
      const c = res.data
      const files = (c.files || []).map((f) => ({
        path: f.filename,
        status:
          f.status === 'added'
            ? 'add'
            : f.status === 'removed'
              ? 'remove'
              : f.status === 'renamed'
                ? 'rename'
                : 'modify',
        patch: f.patch || '',
        oldText: '',
        newText: '',
      }))
      return { commit: mapCommit(c), files }
    },

    async getFileHistory(path) {
      const res = await octokit.repos.listCommits({
        owner,
        repo,
        path,
        per_page: 100,
      })
      return res.data.map(mapCommit)
    },
  }
}

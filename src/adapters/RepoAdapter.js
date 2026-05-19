/**
 * Shared shape for both local (isomorphic-git) and GitHub (Octokit) adapters.
 * View components depend on these shapes only, never on the concrete adapter.
 *
 * @typedef {Object} Commit
 * @property {string} oid           - 40-char SHA
 * @property {string[]} parents     - parent SHAs (0 = root, 1 = normal, 2+ = merge)
 * @property {string} message       - first line of commit message
 * @property {string} fullMessage   - full message including body
 * @property {string} author        - "Name <email>"
 * @property {number} timestamp     - unix seconds
 *
 * @typedef {Object} Ref
 * @property {string} name          - branch or tag name
 * @property {string} oid           - SHA the ref points to
 *
 * @typedef {"add"|"modify"|"remove"|"rename"} ChangeStatus
 *
 * @typedef {Object} FileChange
 * @property {string} path
 * @property {ChangeStatus} status
 * @property {string} [patch]       - unified diff text; absent for binary or huge files
 *
 * @typedef {Object} CommitDetail
 * @property {Commit} commit
 * @property {FileChange[]} files
 *
 * @typedef {Object} RepoAdapter
 * @property {() => Promise<Ref[]>} listBranches
 * @property {() => Promise<Ref[]>} listTags
 * @property {(opts: { ref?: string, depth?: number }) => Promise<Commit[]>} listCommits
 * @property {(oid: string) => Promise<CommitDetail>} getCommitDetail
 * @property {(path: string) => Promise<Commit[]>} getFileHistory
 * @property {() => string} kind    - "local" or "github"
 *
 * Write methods (local adapter only · github adapter throws or returns null)
 * @property {(name: string, fromOid: string) => Promise<void>} [createBranch]
 * @property {(branchName: string) => Promise<void>} [checkout]
 * @property {() => Promise<string | null>} [currentBranch]
 * @property {() => Promise<string | null>} [headOid]
 * @property {(filepath: string, oid: string) => Promise<string>} [readFileAt]
 * @property {(filepath: string, content: string) => Promise<void>} [writeFile]
 * @property {(filepath: string, message: string, author?: { name: string, email: string }) => Promise<string>} [addAndCommit]
 */

export const ADAPTER_KIND = Object.freeze({ LOCAL: 'local', GITHUB: 'github' })

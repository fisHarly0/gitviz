/**
 * Shared shape for local Tauri/Git and GitHub (Octokit) adapters.
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
 * @property {(action: Object, expected: {head: string, branch: string}) => Promise<Object>} [performAction]
 * @property {(name: string, oid: string, expected: Object) => Promise<Object>} [forkEdit]
 * @property {(branchName: string, expected: Object) => Promise<Object>} [checkout]
 * @property {() => Promise<string | null>} [currentBranch]
 * @property {() => Promise<string | null>} [headOid]
 * @property {(filepath: string, oid: string) => Promise<string>} [readFileAt]
 * @property {(path: string, content: string, message: string, expected: Object) => Promise<Object>} [saveEdit]
 */

export const ADAPTER_KIND = Object.freeze({ LOCAL: 'local', GITHUB: 'github' })

export function githubErrorMessage(error) {
  if (error?.code === 'INVALID_REPO' || error?.code === 'EMPTY_REPO') return error.message
  const status = Number(error?.status)
  const headers = error?.response?.headers || {}
  if (status === 429 || (status === 403 && (headers['x-ratelimit-remaining'] === '0' || headers['retry-after']))) {
    return 'GitHub 请求额度已用完或请求过于频繁。请稍后重试；公开仓库可填写有读取权限的令牌。'
  }
  const messages = {
    401: 'GitHub 未接受这个令牌。请更换仓库并更新令牌；公开仓库也可清空令牌后重试。',
    403: 'GitHub 拒绝访问。请检查令牌的仓库读取权限；也可能是请求过于频繁，请稍后重试。',
    404: '仓库或提交不存在，或没有访问权限。请核对仓库名称和令牌权限后重试。',
    409: '仓库可能为空，或当前引用无法读取。请确认已有提交后重新读取。',
    422: 'GitHub 无法读取这个引用。它可能已被删除或更新，请重新读取历史。',
  }
  if (messages[status]) return messages[status]
  if (status >= 500) return 'GitHub 服务暂时无法完成请求，请稍后重试。'
  return '无法连接 GitHub，或读取已超时。请检查网络后重试。'
}

// Keep a bounded remote overview. Every displayed parent comes from GitHub,
// including parents outside this window; the map draws those as missing edges.
export async function loadGithubHistory(adapter, signal) {
  signal?.throwIfAborted()
  const branches = await adapter.listBranches({ signal })
  signal?.throwIfAborted()
  if (!branches.length) return { branches, tags: [], commits: [], warnings: [] }
  const warnings = []
  let tags = []
  try { tags = await adapter.listTags({ signal }) }
  catch (error) {
    signal?.throwIfAborted()
    warnings.push(`标签未读取：${githubErrorMessage(error)}`)
    if ([401, 403, 429].includes(Number(error.status))) throw error
  }
  const results = new Array(branches.length)
  let next = 0, stop = false
  await Promise.all(Array.from({ length: Math.min(3, branches.length) }, async () => {
    while (next < branches.length && !stop) {
      signal?.throwIfAborted()
      const index = next++
      const branch = branches[index]
      try {
        // Pin the request to the advertised SHA, not a moving branch name.
        results[index] = { commits: await adapter.listCommits({ ref: branch.oid, depth: 100, signal }) }
      } catch (error) {
        signal?.throwIfAborted()
        results[index] = { warning: `${branch.name} 未读取：${githubErrorMessage(error)}` }
        if ([401, 403, 429].includes(Number(error.status))) stop = true
      }
    }
  }))
  signal?.throwIfAborted()
  const commits = new Map()
  for (const result of results) {
    if (result?.warning) warnings.push(result.warning)
    for (const commit of result?.commits || []) commits.set(commit.oid, commit)
  }
  if (next < branches.length) warnings.push(`已停止后续请求，另有 ${branches.length - next} 个分支尚未读取。`)
  return { branches, tags, commits: [...commits.values()].sort((a, b) => b.timestamp - a.timestamp), warnings }
}

// A Git history is a DAG, not a strict tree: every merge parent stays visible.
export function layoutHistory(commits, preferredOid) {
  const byId = new Map(commits.map(commit => [commit.oid, commit]))
  const order = new Map(commits.map((commit, index) => [commit.oid, index]))
  const spine = new Set()
  for (let oid = preferredOid; oid && byId.has(oid) && !spine.has(oid); oid = byId.get(oid).parents[0]) spine.add(oid)
  const childCounts = new Map(commits.map(commit => [commit.oid, 0]))
  for (const commit of commits) for (const parent of new Set(commit.parents)) {
    if (byId.has(parent)) childCounts.set(parent, childCounts.get(parent) + 1)
  }
  const queue = []
  const before = (a, b) => Number(spine.has(b.oid)) - Number(spine.has(a.oid)) || order.get(a.oid) - order.get(b.oid)
  const push = commit => {
    let i = queue.push(commit) - 1
    while (i > 0) { const parent = (i - 1) >> 1; if (before(queue[parent], commit) <= 0) break; queue[i] = queue[parent]; i = parent }
    queue[i] = commit
  }
  const pop = () => {
    const first = queue[0], last = queue.pop()
    if (queue.length) {
      let i = 0
      while (i * 2 + 1 < queue.length) {
        let next = i * 2 + 1
        if (next + 1 < queue.length && before(queue[next + 1], queue[next]) < 0) next++
        if (before(last, queue[next]) <= 0) break
        queue[i] = queue[next]; i = next
      }
      queue[i] = last
    }
    return first
  }
  for (const commit of commits) if (childCounts.get(commit.oid) === 0) push(commit)
  const sorted = []
  while (queue.length) {
    const commit = pop()
    sorted.push(commit)
    for (const parent of new Set(commit.parents)) if (byId.has(parent)) {
      childCounts.set(parent, childCounts.get(parent) - 1)
      if (childCounts.get(parent) === 0) push(byId.get(parent))
    }
  }
  if (sorted.length !== commits.length) throw new Error('历史包含重复节点或循环关系，无法绘制。')
  const lanes = [], levels = new Map(), laneLevels = [], nodes = [], edges = []
  const vacant = () => { const slot = lanes.indexOf(null); return slot < 0 ? lanes.length : slot }
  for (const commit of sorted) {
    let lane = lanes.indexOf(commit.oid)
    if (lane < 0) { lane = vacant(); lanes[lane] = commit.oid }
    const level = Math.max(levels.get(commit.oid) || 0, (laneLevels[lane] ?? -1) + 1)
    // Leave a full boundary row before reusing a lane with omitted ancestry.
    // Otherwise its dashed stub could visually touch an unrelated pinned HEAD.
    laneLevels[lane] = level + (commit.parents.some(parent => !byId.has(parent)) ? 1 : 0)
    nodes.push({ ...commit, lane, level, x: 48 + lane * 236, y: 48 + level * 116 })
    lanes[lane] = null
    commit.parents.forEach((parent, index) => {
      levels.set(parent, Math.max(levels.get(parent) || 0, level + 1))
      if (!byId.has(parent)) { edges.push({ from: commit.oid, to: parent, missing: true }); return }
      if (!lanes.includes(parent)) lanes[index === 0 && lanes[lane] === null ? lane : vacant()] = parent
      edges.push({ from: commit.oid, to: parent, merge: index > 0 })
    })
  }
  return {
    nodes, edges,
    width: nodes.reduce((max, node) => Math.max(max, node.x + 240), 520),
    height: nodes.reduce((max, node) => Math.max(max, node.y + 166), 300),
  }
}

export function ancestorsOf(oid, commits) {
  const byId = new Map(commits.map(commit => [commit.oid, commit]))
  const found = new Set(), pending = [oid]
  while (pending.length) {
    const next = pending.pop()
    if (!next || found.has(next)) continue
    found.add(next)
    for (const parent of byId.get(next)?.parents || []) pending.push(parent)
  }
  return found
}

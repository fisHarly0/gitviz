// Display-only graph projection. Aggregate IDs never leave the map as Git OIDs.
export function nearbyHistory(commits, center, radius) {
  if (!center) return commits
  const byId = new Map(commits.map(node => [node.oid, node])), children = new Map()
  for (const node of commits) for (const parent of node.parents) {
    if (!children.has(parent)) children.set(parent, [])
    children.get(parent).push(node.oid)
  }
  const found = new Set(byId.has(center) ? [center] : []), queue = [...found].map(oid => [oid, 0])
  for (let i = 0; i < queue.length; i++) {
    const [oid, depth] = queue[i]
    if (depth >= radius) continue
    for (const next of [...(byId.get(oid)?.parents || []), ...(children.get(oid) || [])]) {
      if (byId.has(next) && !found.has(next)) { found.add(next); queue.push([next, depth + 1]) }
    }
  }
  return commits.filter(node => found.has(node.oid))
}

export function projectHistory(commits, { anchors = [], reveal = [], expanded = new Set(), compact = true } = {}) {
  const byId = new Map(commits.map(node => [node.oid, node])), children = new Map(commits.map(node => [node.oid, []]))
  for (const node of commits) for (const parent of new Set(node.parents)) children.get(parent)?.push(node.oid)
  const fixed = new Set(anchors), shown = new Set(reveal)
  const eligible = node => node && !fixed.has(node.oid) && !node.outsideWindow && node.parents.length === 1 && byId.has(node.parents[0]) && children.get(node.oid).length === 1
  const visited = new Set(), aggregates = [], representative = new Map(), replacement = new Map()
  const fold = (members, group) => {
    if (members.length < 3) return
    const newest = members[0], oldest = members.at(-1), oid = `fold:${newest.oid}:${oldest.oid}`
    const aggregate = { ...newest, oid, parents: oldest.parents, folded: true, group, members: members.map(node => node.oid), message: `${members.length} 个连续存档` }
    aggregates.push(aggregate); replacement.set(newest.oid, aggregate)
    for (const node of members) representative.set(node.oid, oid)
  }
  if (compact) for (const node of commits) {
    if (!eligible(node) || visited.has(node.oid)) continue
    // Start from the newest eligible member even when input dates/order are skewed.
    let first = node
    const climbing = new Set()
    while (eligible(byId.get(children.get(first.oid)[0])) && !climbing.has(first.oid)) {
      climbing.add(first.oid); first = byId.get(children.get(first.oid)[0])
    }
    const chain = []
    for (let current = first; eligible(current) && !visited.has(current.oid); current = byId.get(current.parents[0])) {
      visited.add(current.oid); chain.push(current)
    }
    if (chain.length < 3) continue
    const group = `${chain[0].oid}:${chain.at(-1).oid}`
    if (expanded.has(group)) continue
    let segment = []
    for (const current of chain) {
      if (shown.has(current.oid)) { fold(segment, group); segment = [] }
      else segment.push(current)
    }
    fold(segment, group)
  }
  const nodes = []
  for (const node of commits) {
    if (representative.has(node.oid) && !replacement.has(node.oid)) continue
    const displayed = replacement.get(node.oid) || node
    nodes.push({ ...displayed, parents: displayed.parents.map(oid => representative.get(oid) || oid) })
  }
  return { nodes, aggregates, representative }
}

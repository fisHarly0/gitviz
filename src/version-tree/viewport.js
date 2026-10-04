export function orientLayout(layout, horizontal) {
  if (!horizontal) return layout
  const nodes = layout.nodes.map(node => ({ ...node, x: 48 + node.level * 236, y: 48 + node.lane * 116 }))
  return { ...layout, nodes, width: nodes.reduce((max, node) => Math.max(max, node.x + 240), 520), height: nodes.reduce((max, node) => Math.max(max, node.y + 166), 300) }
}

export function visibleHistory(layout, byId, box, scale, horizontal = false) {
  const center = Math.max(0, (box.width - layout.width * scale) / 2)
  const left = (box.left - center) / scale - 240, right = (box.left + box.width - center) / scale + 240
  const top = box.top / scale - 180, bottom = (box.top + box.height) / scale + 180
  const intersects = (x1, y1, x2, y2) => Math.max(x1, x2) >= left && Math.min(x1, x2) <= right && Math.max(y1, y2) >= top && Math.min(y1, y2) <= bottom
  return {
    nodes: layout.nodes.filter(node => intersects(node.x, node.y, node.x + 188, node.y + 76)),
    edges: layout.edges.filter(edge => {
      const from = byId.get(edge.from), to = byId.get(edge.to)
      if (!from) return false
      return horizontal ? intersects(from.x + 188, from.y + 38, to?.x ?? from.x + 212, (to?.y ?? from.y) + 38)
        : intersects(from.x + 94, from.y + 76, (to?.x ?? from.x) + 94, to?.y ?? from.y + 100)
    }),
  }
}

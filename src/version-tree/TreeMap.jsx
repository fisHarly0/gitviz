import { useEffect, useMemo, useRef, useState } from 'react'
import { ancestorsOf, layoutHistory } from './layout.js'
import { orientLayout, visibleHistory } from './viewport.js'
import Icon from './Icons.jsx'

const COLORS = ['var(--tree-green)', 'var(--tree-amber)', 'var(--tree-blue)', 'var(--tree-purple)', 'var(--tree-pink)']
const short = oid => oid?.slice(0, 7)

export default function TreeMap({ snapshot, selected, onSelect, comparing, compareOids = [], focusOid, query = '', locateOid, orientation = 'vertical' }) {
  const horizontal = orientation === 'horizontal'
  const layout = useMemo(() => orientLayout(layoutHistory(snapshot.commits, snapshot.headPinned ? null : snapshot.head), horizontal), [snapshot.commits, snapshot.head, snapshot.headPinned, horizontal])
  const byId = useMemo(() => new Map(layout.nodes.map(node => [node.oid, node])), [layout])
  const lineage = useMemo(() => ancestorsOf(focusOid || selected, snapshot.commits), [focusOid, selected, snapshot.commits])
  const viewport = useRef(null), drag = useRef(null)
  const [scale, setScale] = useState(1)
  const [box, setBox] = useState({ left: 0, top: 0, width: 800, height: 600 })
  const pendingFocus = useRef(null)
  useEffect(() => {
    const element = viewport.current
    let frame
    const update = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(() => setBox({ left: element.scrollLeft, top: element.scrollTop, width: element.clientWidth, height: element.clientHeight })) }
    const observer = new ResizeObserver(update)
    observer.observe(element); element.addEventListener('scroll', update, { passive: true }); update()
    return () => { observer.disconnect(); element.removeEventListener('scroll', update); cancelAnimationFrame(frame) }
  }, [])
  const visible = useMemo(() => visibleHistory(layout, byId, box, scale, horizontal), [layout, byId, box, scale, horizontal])
  useEffect(() => {
    if (!pendingFocus.current) return
    const element = viewport.current?.querySelector(`[data-oid="${pendingFocus.current}"]`)
    if (element) { element.focus({ preventScroll: true }); pendingFocus.current = null }
  }, [visible])
  useEffect(() => {
    const oid = locateOid?.oid, node = byId.get(oid), element = viewport.current
    if (!node || !element) return
    pendingFocus.current = oid
    element.scrollTo({ left: Math.max(0, (node.x + 94) * scale - element.clientWidth / 2), top: Math.max(0, node.y * scale - 90), behavior: 'instant' })
    requestAnimationFrame(() => element.querySelector(`[data-oid="${oid}"]`)?.focus({ preventScroll: true }))
  }, [locateOid, byId, scale])
  const refs = useMemo(() => {
    const map = new Map()
    for (const ref of [...snapshot.branches, ...snapshot.tags.map(tag => ({ ...tag, tag: true }))]) {
      map.set(ref.oid, [...(map.get(ref.oid) || []), ref])
    }
    return map
  }, [snapshot.branches, snapshot.tags])
  const matches = node => !query || `${node.message} ${node.author} ${node.oid} ${(refs.get(node.oid) || []).map(ref => ref.name).join(' ')}`.toLowerCase().includes(query.toLowerCase())
  const zoom = amount => setScale(value => Math.max(0.35, Math.min(1.6, Math.round((value + amount) * 100) / 100)))
  const locate = oid => {
    const node = byId.get(oid)
    if (!node || !viewport.current) return
    pendingFocus.current = oid
    viewport.current.scrollTo({ left: (node.x + 94) * scale - viewport.current.clientWidth / 2, top: node.y * scale - 90, behavior: 'instant' })
    viewport.current.querySelector(`[data-oid="${oid}"]`)?.focus({ preventScroll: true })
  }
  const pick = (oid, shift) => { onSelect(oid, shift); locate(oid) }
  const fit = () => {
    const box = viewport.current
    setScale(Math.max(0.35, Math.min(1, (box.clientWidth - 32) / layout.width, (box.clientHeight - 32) / layout.height)))
    box.scrollTo({ top: 0, left: 0 })
  }
  const resultCount = layout.nodes.filter(matches).length
  return <section className="tree-map" aria-label="交互式版本树">
    <div className="map-heading">
      <div><h2>版本地图</h2><span>{query ? `已加载中 ${resultCount} 个匹配` : `${snapshot.commits.length} 个存档点`}<span className="map-heading-note"> · {horizontal ? '新版本在左，祖先在右' : '新版本在上，共同起点在下'}</span></span></div>
      <button className="quiet" onClick={() => { onSelect(snapshot.head); locate(snapshot.head) }} disabled={!snapshot.head || !byId.has(snapshot.head)}><Icon name="target"/>当前位置</button>
    </div>
    <div className="map-viewport" ref={viewport} tabIndex={0} aria-label="版本地图画布"
      onPointerDown={event => {
        if (event.button !== 0 || event.target.closest('button')) return
        drag.current = { x: event.clientX, y: event.clientY, left: event.currentTarget.scrollLeft, top: event.currentTarget.scrollTop }
        event.currentTarget.setPointerCapture(event.pointerId)
      }}
      onPointerMove={event => {
        if (!drag.current) return
        event.currentTarget.scrollLeft = drag.current.left - (event.clientX - drag.current.x)
        event.currentTarget.scrollTop = drag.current.top - (event.clientY - drag.current.y)
      }}
      onPointerUp={() => { drag.current = null }} onPointerCancel={() => { drag.current = null }}
      onKeyDown={event => {
        if (!['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
        const index = layout.nodes.findIndex(node => node.oid === selected)
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? layout.nodes.length - 1 : Math.max(0, Math.min(layout.nodes.length - 1, index + (['ArrowDown', 'ArrowRight'].includes(event.key) ? 1 : -1)))
        event.preventDefault(); pick(layout.nodes[next]?.oid)
      }}>
      <div className="map-space" style={{ width: layout.width * scale, height: layout.height * scale }}>
        <div className="map-world" style={{ width: layout.width, height: layout.height, left: `max(0px, calc((100% - ${layout.width * scale}px) / 2))`, transform: `scale(${scale})` }}>
          <svg className="map-lines" width={layout.width} height={layout.height} aria-hidden="true">
            {visible.edges.map(edge => {
              const from = byId.get(edge.from), to = byId.get(edge.to)
              const x1 = from.x + 94, y1 = from.y + 76, x2 = to ? to.x + 94 : x1, y2 = to ? to.y : y1 + 24
              const hx1 = from.x + 188, hy1 = from.y + 38, hx2 = to?.x ?? hx1 + 24, hy2 = (to?.y ?? from.y) + 38
              const path = horizontal ? `M${hx1},${hy1} C${(hx1 + hx2) / 2},${hy1} ${(hx1 + hx2) / 2},${hy2} ${hx2},${hy2}` : `M${x1},${y1} C${x1},${y1 + (y2 - y1) / 2} ${x2},${y1 + (y2 - y1) / 2} ${x2},${y2}`
              return <path key={`${edge.from}-${edge.to}`} d={path} stroke={COLORS[(to?.lane ?? from.lane) % COLORS.length]} className={`${lineage.has(edge.from) && lineage.has(edge.to) ? 'path-active' : ''} ${edge.missing ? 'path-missing' : ''}`} data-merge={edge.merge || undefined}/>
            })}
          </svg>
          {visible.nodes.map(node => {
            const active = selected === node.oid, head = snapshot.head === node.oid
            const compareIndex = compareOids.indexOf(node.oid)
            const nodeRefs = refs.get(node.oid) || []
            const match = matches(node), muted = !match || (focusOid && !lineage.has(node.oid))
            return <button key={node.oid} data-oid={node.oid} className={`save-node ${active ? 'selected' : ''} ${head ? 'at-head' : ''} ${muted ? 'muted' : ''} ${compareIndex >= 0 ? 'compared' : ''}`}
              style={{ left: node.x, top: node.y, '--lane': COLORS[node.lane % COLORS.length] }}
              aria-label={`${head ? '当前位置，' : ''}${node.message}，${short(node.oid)}`} aria-pressed={active} tabIndex={active || (!selected && head) ? 0 : -1}
              title={`${node.message}\n${node.author}\n${nodeRefs.map(ref => ref.name).join(' · ')}\n${comparing ? '选择比较节点' : '点击预览；Shift + 点击加入比较'}`}
              onClick={event => pick(node.oid, event.shiftKey)}>
              <span className="node-top"><span className="node-marker"/><code>{short(node.oid)}</code>{head && <span className="head-label">你在这里</span>}{compareIndex >= 0 && <span className="compare-label">{compareIndex === 0 ? 'A' : 'B'}</span>}{node.parents.length > 1 && <Icon name="fork" size={14}/>}</span>
              <span className="node-message">{node.message}</span>
              <span className="node-foot">{node.outsideWindow ? '较旧的当前位置 · 单独保留' : nodeRefs.length ? nodeRefs.map(ref => ref.name).join(' · ') : node.parents.length === 0 ? '故事的起点' : node.author}</span>
            </button>
          })}
          {layout.edges.some(edge => edge.missing) && <div className="history-boundary" style={{ top: layout.height - 30 }}>虚线表示未载入的历史</div>}
        </div>
      </div>
      {query && resultCount === 0 && <div className="map-no-results">没有找到“{query}”，试试提交说明、作者或编号。</div>}
    </div>
    <div className="map-footer"><span><i className="legend-dot"/>当前位置 <i className="legend-ring"/>正在预览<span className="map-heading-note"> · 拖动空白平移，↑ ↓ 选择节点</span></span><div className="zoom-controls"><button onClick={() => zoom(-0.15)} aria-label="缩小" disabled={scale <= 0.35}><Icon name="minus" size={16}/></button><output aria-label="缩放比例">{Math.round(scale * 100)}%</output><button onClick={() => zoom(0.15)} aria-label="放大" disabled={scale >= 1.6}><Icon name="plus" size={16}/></button><button onClick={fit} title="适应窗口" aria-label="适应窗口"><Icon name="fit" size={16}/></button></div></div>
  </section>
}

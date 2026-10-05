import { useEffect, useMemo, useRef, useState } from 'react'
import { ancestorsOf, layoutHistory } from './layout.js'
import { orientLayout, visibleHistory } from './viewport.js'
import { nearbyHistory, projectHistory } from './projection.js'
import Icon from './Icons.jsx'

const COLORS = ['var(--tree-green)', 'var(--tree-amber)', 'var(--tree-blue)', 'var(--tree-purple)', 'var(--tree-pink)']
const short = oid => oid?.slice(0, 7)
const EMPTY = []

export default function TreeMap({ snapshot, selected, onSelect, comparing, compareOids = EMPTY, focusOid, query = '', locateOid, onLocate, loading, orientation = 'vertical', readOnly = false }) {
  const horizontal = orientation === 'horizontal'
  const [compact, setCompact] = useState(true), [expanded, setExpanded] = useState(new Set())
  const [exploration, setExploration] = useState(null), [radius, setRadius] = useState(2)
  const [overview, setOverview] = useState(false), [refQuery, setRefQuery] = useState(''), [refLimit, setRefLimit] = useState(30)
  const [navigation, setNavigation] = useState(null)
  const overviewToggle = useRef(null), overviewInput = useRef(null)
  useEffect(() => { if (overview) overviewInput.current?.focus() }, [overview])
  const closeOverview = () => { setOverview(false); requestAnimationFrame(() => overviewToggle.current?.focus()) }
  const fullLayout = useMemo(() => layoutHistory(snapshot.commits, snapshot.headPinned ? null : snapshot.head), [snapshot.commits, snapshot.head, snapshot.headPinned])
  const fullById = useMemo(() => new Map(snapshot.commits.map(node => [node.oid, node])), [snapshot.commits])
  const references = useMemo(() => [...snapshot.branches, ...snapshot.tags.map(tag => ({ ...tag, tag: true }))], [snapshot.branches, snapshot.tags])
  const refs = useMemo(() => {
    const map = new Map()
    for (const ref of references) map.set(ref.oid, [...(map.get(ref.oid) || []), ref])
    return map
  }, [references])
  const matching = useMemo(() => new Set(snapshot.commits.filter(node => !query || `${node.message} ${node.author} ${node.oid} ${(refs.get(node.oid) || []).map(ref => ref.name).join(' ')}`.toLowerCase().includes(query.toLowerCase())).map(node => node.oid)), [snapshot.commits, query, refs])
  const center = exploration?.external === locateOid && !query && !comparing && !compareOids.length ? exploration?.oid : null
  const scoped = useMemo(() => nearbyHistory(fullLayout.nodes, center, radius), [fullLayout, center, radius])
  const projection = useMemo(() => {
    const children = new Map()
    for (const node of snapshot.commits) for (const parent of node.parents) children.set(parent, (children.get(parent) || 0) + 1)
    const junctions = snapshot.commits.filter(node => node.parents.length !== 1 || children.get(node.oid) !== 1).map(node => node.oid)
    return projectHistory(scoped, { compact, expanded, anchors: [snapshot.head, focusOid, ...refs.keys(), ...junctions], reveal: [selected, ...compareOids, ...(query ? matching : [])] })
  }, [scoped, compact, expanded, snapshot.commits, snapshot.head, focusOid, refs, selected, compareOids, query, matching])
  const layout = useMemo(() => orientLayout(layoutHistory(projection.nodes, snapshot.headPinned ? null : snapshot.head), horizontal), [projection, snapshot.head, snapshot.headPinned, horizontal])
  const byId = useMemo(() => new Map(layout.nodes.map(node => [node.oid, node])), [layout])
  const lineage = useMemo(() => ancestorsOf(focusOid || selected, snapshot.commits), [focusOid, selected, snapshot.commits])
  const viewport = useRef(null), drag = useRef(null)
  const [scale, setScale] = useState(1)
  const [box, setBox] = useState({ left: 0, top: 0, width: 800, height: 600 })
  const pendingFocus = useRef(null)
  const lastLocation = useRef(null)
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
    const oid = navigation?.selected === selected && navigation?.external === locateOid ? navigation.oid : selected
    const node = byId.get(oid), element = viewport.current
    if (!node || !element) return
    const previous = lastLocation.current
    if (previous?.oid === oid && previous.navigation === navigation && previous.external === locateOid && previous.scale === scale && previous.horizontal === horizontal && previous.width === box.width && previous.height === box.height) return
    lastLocation.current = { oid, navigation, external: locateOid, scale, horizontal, width: box.width, height: box.height }
    pendingFocus.current = oid
    element.scrollTo({ left: Math.max(0, (node.x + 94) * scale - element.clientWidth / 2), top: Math.max(0, node.y * scale - 90), behavior: 'instant' })
    requestAnimationFrame(() => element.querySelector(`[data-oid="${oid}"]`)?.focus({ preventScroll: true }))
  }, [selected, navigation, locateOid, byId, scale, horizontal, box.width, box.height])
  const matches = node => node.folded ? node.members.some(oid => matching.has(oid)) : matching.has(node.oid)
  const zoom = amount => setScale(value => Math.max(0.35, Math.min(1.6, Math.round((value + amount) * 100) / 100)))
  const locate = oid => {
    setNavigation({ oid, selected: oid, external: locateOid })
  }
  const pick = (oid, shift) => { onSelect(oid, shift); locate(oid) }
  const jump = oid => {
    setOverview(false)
    setExploration(null)
    if (fullById.has(oid)) pick(oid)
    else onLocate?.(oid)
  }
  const fit = () => {
    const box = viewport.current
    setScale(Math.max(0.35, Math.min(1, (box.clientWidth - 32) / layout.width, (box.clientHeight - 32) / layout.height)))
    box.scrollTo({ top: 0, left: 0 })
  }
  const resultCount = matching.size
  const filteredRefs = references.filter(ref => `${ref.name} ${ref.oid}`.toLowerCase().includes(refQuery.toLowerCase()))
  return <section className="tree-map" aria-label="交互式版本树">
    <div className="map-heading">
      <div><h2>版本地图</h2><span>{query ? `已加载中 ${resultCount} 个匹配` : `${snapshot.commits.length} 个存档点`}<span className="map-heading-note"> · {horizontal ? '新版本在左，祖先在右' : '新版本在上，共同起点在下'}</span></span></div>
      <button className="quiet" onClick={() => jump(snapshot.head)} disabled={!snapshot.head || !fullById.has(snapshot.head)}><Icon name="target"/>{readOnly ? '浏览基准' : '当前位置'}</button>
    </div>
    <div className="map-navigation">
      <div className="map-navigation-actions">
        <button aria-pressed={compact} onClick={() => { setCompact(value => !value); setExpanded(new Set()); locate(selected) }}>{compact ? '显示每个存档' : '折叠连续存档'}</button>
        {expanded.size > 0 && compact && <button onClick={() => { setExpanded(new Set()); locate(selected) }}>重新折叠</button>}
        <button ref={overviewToggle} aria-expanded={overview} onClick={() => setOverview(value => !value)}>分支与标签</button>
        <button aria-pressed={Boolean(center)} disabled={!selected || !fullById.has(selected) || Boolean(query) || comparing || compareOids.length > 0} onClick={() => { setExploration(center ? null : { oid: selected, external: locateOid }); locate(selected) }}>{center ? '退出附近视图' : '只看节点附近'}</button>
      </div>
      {center ? <div className="map-scope"><span>围绕 <code>{short(center)}</code> · 已加载中 {scoped.length} / {snapshot.commits.length} 个存档</span><label>范围 <select aria-label="探索范围" value={radius} onChange={event => { setRadius(Number(event.target.value)); locate(selected) }}><option value={1}>前后 1 步</option><option value={2}>前后 2 步</option><option value={4}>前后 4 步</option><option value={8}>前后 8 步</option></select></label>{selected !== center && <button onClick={() => { setExploration({ oid: selected, external: locateOid }); locate(selected) }}>以当前选择为中心</button>}</div> : <p className="map-projection-note">{compact ? `${projection.aggregates.length} 段连续历史已折叠 · 点击展开，关键存档始终可见` : '逐个显示已加载存档'}{snapshot.truncated ? ' · 可继续加载更早历史' : ''}</p>}
    </div>
    <div className="map-content">
    {overview && <div className="map-overview" role="region" aria-label="分支与标签导航" onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeOverview() } }}>
      <div className="map-overview-heading"><h3>分支与标签</h3><button onClick={closeOverview}>返回地图</button></div>
      <label>查找引用<input ref={overviewInput} aria-label="查找分支或标签" value={refQuery} onChange={event => { setRefQuery(event.target.value); setRefLimit(30) }} placeholder="名称或提交编号"/></label>
      <p>点击只定位预览，不切换工作文件。</p>
      <div className="map-ref-list">
        {filteredRefs.slice(0, refLimit).map(ref => <button key={`${ref.tag ? 'tag' : ref.remote ? 'remote' : 'branch'}-${ref.name}`} disabled={loading || (!fullById.has(ref.oid) && !onLocate)} onClick={() => jump(ref.oid)} title={ref.name}><span>{ref.tag ? '标签' : ref.remote ? '远程分支' : '分支'}</span><strong>{ref.name}</strong><code>{short(ref.oid)}</code><small>{fullById.has(ref.oid) ? '定位' : '加载并定位'}</small></button>)}
        {!filteredRefs.length && <p>没有匹配的分支或标签。</p>}
        {filteredRefs.length > refLimit && <button onClick={() => setRefLimit(value => value + 30)}>显示更多引用（剩余 {filteredRefs.length - refLimit}）</button>}
      </div>
    </div>}
    <div className="map-viewport" ref={viewport} tabIndex={0} aria-label="版本地图画布" aria-hidden={overview || undefined} inert={overview}
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
        const focused = event.target.closest('[data-oid]')?.dataset.oid || selected
        const index = scoped.findIndex(node => node.oid === focused)
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? scoped.length - 1 : Math.max(0, Math.min(scoped.length - 1, index + (['ArrowDown', 'ArrowRight'].includes(event.key) ? 1 : -1)))
        event.preventDefault(); pick(scoped[next]?.oid)
      }}>
      <div className="map-space" style={{ width: layout.width * scale, height: layout.height * scale }}>
        <div className="map-world" style={{ width: layout.width, height: layout.height, left: `max(0px, calc((100% - ${layout.width * scale}px) / 2))`, transform: `scale(${scale})` }}>
          <svg className="map-lines" width={layout.width} height={layout.height} aria-hidden="true">
            {visible.edges.map(edge => {
              const from = byId.get(edge.from), to = byId.get(edge.to)
              const x1 = from.x + 94, y1 = from.y + 76, x2 = to ? to.x + 94 : x1, y2 = to ? to.y : y1 + 24
              const hx1 = from.x + 188, hy1 = from.y + 38, hx2 = to?.x ?? hx1 + 24, hy2 = (to?.y ?? from.y) + 38
              const path = horizontal ? `M${hx1},${hy1} C${(hx1 + hx2) / 2},${hy1} ${(hx1 + hx2) / 2},${hy2} ${hx2},${hy2}` : `M${x1},${y1} C${x1},${y1 + (y2 - y1) / 2} ${x2},${y1 + (y2 - y1) / 2} ${x2},${y2}`
              const follows = node => node?.folded ? node.members.every(oid => lineage.has(oid)) : lineage.has(node?.oid)
              return <path key={`${edge.from}-${edge.to}`} d={path} stroke={COLORS[(to?.lane ?? from.lane) % COLORS.length]} className={`${follows(from) && follows(to) ? 'path-active' : ''} ${edge.missing ? 'path-missing' : ''}`} data-merge={edge.merge || undefined}/>
            })}
          </svg>
          {visible.nodes.map(node => {
            const match = matches(node), inLineage = node.folded ? node.members.some(oid => lineage.has(oid)) : lineage.has(node.oid)
            const muted = !match || (focusOid && !inLineage)
            if (node.folded) return <button key={node.oid} className={`save-node folded-node ${muted ? 'muted' : ''}`} data-fold={node.group} style={{ left: node.x, top: node.y, '--lane': COLORS[node.lane % COLORS.length] }} aria-label={`展开 ${node.members.length} 个连续存档，${short(node.members[0])} 到 ${short(node.members.at(-1))}`} onClick={() => { setExpanded(previous => new Set([...previous, node.group])); setNavigation({ oid: node.members[0], selected, external: locateOid }) }}><span className="node-top"><Icon name="tree" size={14}/><strong>{node.members.length} 个连续存档</strong></span><span className="node-message">展开这段历史</span><span className="node-foot">{short(node.members[0])} — {short(node.members.at(-1))}</span></button>
            const active = selected === node.oid, head = snapshot.head === node.oid
            const compareIndex = compareOids.indexOf(node.oid)
            const nodeRefs = refs.get(node.oid) || []
            return <button key={node.oid} data-oid={node.oid} className={`save-node ${active ? 'selected' : ''} ${head ? 'at-head' : ''} ${muted ? 'muted' : ''} ${compareIndex >= 0 ? 'compared' : ''}`}
              style={{ left: node.x, top: node.y, '--lane': COLORS[node.lane % COLORS.length] }}
              aria-label={`${head ? (readOnly ? '浏览基准，' : '当前位置，') : ''}${node.message}，${short(node.oid)}`} aria-pressed={active} tabIndex={active || (!selected && head) ? 0 : -1}
              title={`${node.message}\n${node.author}\n${nodeRefs.map(ref => ref.name).join(' · ')}\n${readOnly ? '点击只读预览' : comparing ? '选择比较节点' : '点击预览；Shift + 点击加入比较'}`}
              onClick={event => pick(node.oid, event.shiftKey)}>
              <span className="node-top"><span className="node-marker"/><code>{short(node.oid)}</code>{head && <span className="head-label">{readOnly ? '浏览基准' : '你在这里'}</span>}{compareIndex >= 0 && <span className="compare-label">{compareIndex === 0 ? 'A' : 'B'}</span>}{node.parents.length > 1 && <Icon name="fork" size={14}/>}</span>
              <span className="node-message">{node.message}</span>
              <span className="node-foot">{node.outsideWindow ? '较旧的当前位置 · 单独保留' : nodeRefs.length ? nodeRefs.map(ref => ref.name).join(' · ') : node.parents.length === 0 ? '故事的起点' : node.author}</span>
            </button>
          })}
          {layout.edges.some(edge => edge.missing) && <div className="history-boundary" style={{ top: layout.height - 30 }}>{center ? '虚线表示范围外或未载入的父存档' : '虚线表示未载入的历史'}</div>}
        </div>
      </div>
      {query && resultCount === 0 && <div className="map-no-results">没有找到“{query}”，试试提交说明、作者或编号。</div>}
    </div>
    </div>
    <div className="map-footer"><span><i className="legend-dot"/>{readOnly ? '浏览基准' : '当前位置'} <i className="legend-ring"/>正在预览<span className="map-heading-note"> · 拖动空白平移，↑ ↓ 选择节点</span></span><div className="zoom-controls"><button onClick={() => zoom(-0.15)} aria-label="缩小" disabled={overview || scale <= 0.35}><Icon name="minus" size={16}/></button><output aria-label="缩放比例">{Math.round(scale * 100)}%</output><button onClick={() => zoom(0.15)} aria-label="放大" disabled={overview || scale >= 1.6}><Icon name="plus" size={16}/></button><button onClick={fit} title="适应窗口" aria-label="适应窗口" disabled={overview}><Icon name="fit" size={16}/></button></div></div>
  </section>
}

import { useEffect, useMemo, useState } from 'react'
import { Gitgraph, Orientation, TemplateName, templateExtend } from '@gitgraph/react'
import { isIfBranch } from '../state/useSession.js'

const template = templateExtend(TemplateName.Metro, {
  commit: {
    spacing: 36,
    dot: { size: 8 },
    message: {
      displayAuthor: false,
      displayHash: true,
      font: '12px ui-monospace, SFMono-Regular, Menlo, monospace',
    },
  },
  branch: {
    lineWidth: 2,
    spacing: 28,
  },
})

// 主线 = emerald 绿 · if 线 = amber 系（不同 if 线轮换色阶以区分多条）
const MAIN_COLOR = '#10b981'
const IF_COLORS = ['#f59e0b', '#fbbf24', '#fb923c', '#facc15', '#eab308']
const SELECTED_DOT = '#fde047' // 当前选中 commit 高亮 yellow-300

function colorForBranch(name, ifIndex) {
  if (isIfBranch(name)) return IF_COLORS[ifIndex % IF_COLORS.length]
  return MAIN_COLOR
}

function assignBranches(commits, branches) {
  const oidToBranch = new Map()
  const byOid = new Map(commits.map((c) => [c.oid, c]))

  for (const b of branches) {
    let cur = b.oid
    while (cur && byOid.has(cur)) {
      if (oidToBranch.has(cur)) break
      oidToBranch.set(cur, b.name)
      const c = byOid.get(cur)
      cur = c.parents[0]
    }
  }

  return oidToBranch
}

function shortHash(oid) {
  return oid.slice(0, 7)
}

export default function CommitGraph({ adapter, onSelect, selectedOid, refreshKey = 0 }) {
  const [commits, setCommits] = useState([])
  const [branches, setBranches] = useState([])
  const [tags, setTags] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      // 重置 loading/error · deps 变化时合理 reset（lint 误报）
      setLoading(true)
      setError('')
      try {
        const [b, t] = await Promise.all([
          adapter.listBranches().catch(() => []),
          adapter.listTags().catch(() => []),
        ])
        if (cancelled) return
        // 跨所有分支拉 commits 并 dedupe（让 if-* 分支的 commits 也出现在图里）
        const all = new Map()
        const refsToFetch = b.length > 0 ? b.map((x) => x.name) : [undefined]
        const errors = []
        await Promise.all(
          refsToFetch.map(async (ref) => {
            try {
              const cs = await adapter.listCommits(ref ? { ref, depth: 200 } : { depth: 200 })
              for (const c of cs) if (!all.has(c.oid)) all.set(c.oid, c)
            } catch (e) {
              errors.push(`ref ${ref || 'HEAD'}: ${e?.message || String(e)}`)
              console.error('[gitviz] listCommits failed for', ref, e)
            }
          }),
        )
        if (cancelled) return
        const merged = Array.from(all.values()).sort((x, y) => y.timestamp - x.timestamp)
        if (merged.length === 0 && errors.length > 0) {
          // 自动跑诊断 + 显示 LightningFS 实际 .git 内容
          let diag = ''
          const sha = (errors[0].match(/[0-9a-f]{40}/i) || [])[0]
          if (typeof adapter.diagnose === 'function') {
            try {
              const d = await adapter.diagnose(sha)
              diag =
                `\n\n--- DIAGNOSE (LightningFS 内实际内容) ---\n` +
                `.git/HEAD: ${d.headRefContent}\n` +
                `.git/refs/heads/master: ${d.masterRefContent}\n` +
                `.git/ 顶层: ${d.gitRoot.length} 项 [${d.gitRoot.slice(0, 20).join(', ')}]\n` +
                `.git/objects/ 子目录: ${d.objectsDir.length} 项 [${d.objectsDir.slice(0, 20).join(', ')}]\n` +
                (sha
                  ? `.git/objects/${sha.slice(0, 2)}/ 内文件: ${d.prefixDir.length} 项 [${d.prefixDir.slice(0, 10).join(', ')}]\n` +
                    `文件名匹配 ${sha.slice(2)}: ${d.hasFile ? 'YES' : 'NO'}\n` +
                    `readFile 试读: ${
                      d.readError
                        ? '失败 (' + d.readError + ')'
                        : `成功 · ${d.fileSize} bytes · 首 8 字节 hex = ${d.fileFirstBytes}`
                    }\n` +
                    `resolveRef('master'): ${d.resolveRefMaster}\n` +
                    `resolveRef('HEAD'): ${d.resolveRefHead}\n` +
                    `git.readObject(dir): ${d.readObjectOk || ('FAIL → ' + d.readObjectErr)}\n` +
                    `git.readObject(gitdir explicit): ${d.readObjectGitdir}\n` +
                    `git.readCommit(dir): ${d.readCommit}\n` +
                    `fs.readFile(期望路径): ${d.fsTestPath}\n` +
                    `wrapped readObject: ${d.wrappedReadObject}\n` +
                    `--- isomorphic-git 内部 fs 调用日志 ---\n  · ${d.fsCallLog}`
                  : '')
            } catch (de) {
              diag = '\n\n--- DIAGNOSE error: ' + (de?.message || de) + ' ---'
            }
          }
          setError(
            `Cannot list commits (${errors.length} ref failure(s)). First error: ${errors[0]}` + diag,
          )
        }
        setCommits(merged)
        setBranches(b)
        setTags(t)
        setLoading(false)
      } catch (err) {
        if (cancelled) return
        setError(err.message || String(err))
        setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [adapter, refreshKey])

  const oidToBranch = useMemo(
    () => assignBranches(commits, branches),
    [commits, branches],
  )

  const refsByOid = useMemo(() => {
    const map = new Map()
    for (const b of branches) {
      if (!map.has(b.oid)) map.set(b.oid, [])
      map.get(b.oid).push({ kind: 'branch', name: b.name })
    }
    for (const t of tags) {
      if (!map.has(t.oid)) map.set(t.oid, [])
      map.get(t.oid).push({ kind: 'tag', name: t.name })
    }
    return map
  }, [branches, tags])

  if (loading) return <div className="loading">Reading commits...</div>
  if (error) return <div className="error">{error}</div>
  if (commits.length === 0) return <div className="empty">No commits.</div>

  return (
    <div className="commit-graph">
      <Gitgraph
        options={{
          template,
          orientation: Orientation.VerticalReverse,
        }}
      >
        {(gitgraph) => {
          const ordered = [...commits].reverse()
          const branchRefs = new Map()
          // 给每条 if 分支分配独立色阶 index（按出现顺序）
          const ifIndexByName = new Map()
          let ifNextIndex = 0
          for (const c of ordered) {
            const name = oidToBranch.get(c.oid) || 'main'
            let branchRef = branchRefs.get(name)
            if (!branchRef) {
              if (isIfBranch(name) && !ifIndexByName.has(name)) {
                ifIndexByName.set(name, ifNextIndex++)
              }
              const ifIdx = ifIndexByName.get(name) ?? 0
              const color = colorForBranch(name, ifIdx)
              const parentOid = c.parents[0]
              const parentBranchName = parentOid
                ? oidToBranch.get(parentOid) || name
                : null
              const from =
                parentBranchName && branchRefs.get(parentBranchName)
                  ? branchRefs.get(parentBranchName)
                  : undefined
              const branchOpts = {
                name,
                style: { color, label: { color, strokeColor: color } },
              }
              if (from) branchOpts.from = from
              branchRef = gitgraph.branch(branchOpts)
              branchRefs.set(name, branchRef)
            }

            const tagRefs = refsByOid.get(c.oid) || []
            const refLabel = tagRefs.length
              ? ' ' +
                tagRefs
                  .map((r) => (r.kind === 'tag' ? `[tag: ${r.name}]` : `[${r.name}]`))
                  .join(' ')
              : ''

            const isSelected = selectedOid === c.oid
            const handleCommitClick = (_, evt) => {
              // 点击前给目标 circle 临时加 pulsing class，让动画有一帧时间起跳再触发 re-render
              try {
                const tgt = evt && (evt.target || evt.currentTarget)
                const circle =
                  tgt && tgt.tagName && tgt.tagName.toLowerCase() === 'circle'
                    ? tgt
                    : tgt && tgt.closest
                      ? tgt.closest('g')?.querySelector?.('circle')
                      : null
                if (circle) {
                  circle.classList.add('pulsing')
                  setTimeout(() => circle.classList.remove('pulsing'), 360)
                }
              } catch {
                // 防御性：DOM 不可访问时静默
              }
              onSelect(c.oid)
            }
            branchRef.commit({
              hash: c.oid,
              subject: shortHash(c.oid) + ' ' + c.message + refLabel,
              onMessageClick: (_, evt) => handleCommitClick(_, evt),
              onClick: (_, evt) => handleCommitClick(_, evt),
              style: isSelected
                ? { dot: { color: SELECTED_DOT, size: 11, strokeColor: SELECTED_DOT, strokeWidth: 2 } }
                : undefined,
            })
          }
        }}
      </Gitgraph>
    </div>
  )
}

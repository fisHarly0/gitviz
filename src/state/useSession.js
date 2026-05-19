// gitviz · 游戏存档式 session 状态机
//
// 三态：
//   browse  → 默认看主时间线 (currentBranch=main)
//   preview → 选了旧 commit，readonly 浏览（不真 checkout，仅 UI 显示该 commit 文件树）
//   edit    → preview 状态下点击 "Edit 文件" → 自动起 if-{shortSha}-{N} 分支 + 切到编辑器
//
// "不改动 = 时间线不变" 兑现方式：preview 模式不调任何 git 写入 API，纯 UI 状态。
// 只有 startEdit 被触发才真起分支 + 真 checkout 进 edit 模式。

import { useCallback, useState } from 'react'

const DEFAULT_MAIN_CANDIDATES = ['main', 'master']

export function pickMainBranch(branchNames) {
  for (const cand of DEFAULT_MAIN_CANDIDATES) {
    if (branchNames.includes(cand)) return cand
  }
  return branchNames[0] || 'main'
}

export function isIfBranch(name) {
  return typeof name === 'string' && name.startsWith('if-')
}

export function makeIfBranchName(parentShortSha, counter) {
  return `if-${parentShortSha}-${counter}`
}

export function useSession() {
  const [mode, setMode] = useState('browse') // 'browse' | 'preview' | 'edit'
  const [mainBranch, setMainBranch] = useState('main')
  const [currentBranch, setCurrentBranch] = useState('main')
  const [viewingOid, setViewingOid] = useState(null)
  const [currentIfBranch, setCurrentIfBranch] = useState(null)
  const [editingFile, setEditingFile] = useState(null)
  const [ifLineCounter, setIfLineCounter] = useState(0)
  const [changedFilesInIf, setChangedFilesInIf] = useState(0)
  const [headOid, setHeadOid] = useState(null) // 当前 currentBranch HEAD oid (UI 显示用)

  const setupRepo = useCallback((branchNames, headOidValue) => {
    const main = pickMainBranch(branchNames)
    setMainBranch(main)
    setCurrentBranch(main)
    setHeadOid(headOidValue || null)
    setMode('browse')
    setViewingOid(null)
    setCurrentIfBranch(null)
    setEditingFile(null)
    setIfLineCounter(0)
    setChangedFilesInIf(0)
  }, [])

  // 进 preview 模式：点了旧 commit
  const enterPreview = useCallback((oid) => {
    setMode('preview')
    setViewingOid(oid)
    setEditingFile(null)
    // currentBranch 不动（仍是 main 或当前 if 线）
    // currentIfBranch 不动
    setChangedFilesInIf(0)
  }, [])

  // 切回 main / 切回某 commit 当前线 HEAD
  const leaveToBrowse = useCallback(() => {
    setMode('browse')
    setViewingOid(null)
    setEditingFile(null)
    setChangedFilesInIf(0)
  }, [])

  // 切换分支（main 或 某 if 线）→ browse 模式
  const switchToBranch = useCallback((branchName, headOidValue) => {
    setCurrentBranch(branchName)
    if (isIfBranch(branchName)) setCurrentIfBranch(branchName)
    else setCurrentIfBranch(null)
    setMode('browse')
    setViewingOid(null)
    setEditingFile(null)
    setChangedFilesInIf(0)
    if (headOidValue) setHeadOid(headOidValue)
  }, [])

  // 进 edit 模式：preview 状态下点了某文件 Edit
  // 调用方 (CommitDetail) 负责调 adapter.createBranch + checkout，本 hook 仅记 UI 状态
  const startEdit = useCallback((filepath, ifBranchName) => {
    setMode('edit')
    setEditingFile(filepath)
    setCurrentBranch(ifBranchName)
    setCurrentIfBranch(ifBranchName)
  }, [])

  // 用户 Save & Commit 后调用 · 记录已改文件数 · 保持 edit 模式 (用户可继续改别的文件)
  const onCommitInIf = useCallback((newHeadOid) => {
    setChangedFilesInIf((n) => n + 1)
    setEditingFile(null)
    if (newHeadOid) setHeadOid(newHeadOid)
  }, [])

  // 取下一个 if-line counter（不持久化 · session-scoped）
  const allocateIfCounter = useCallback(() => {
    const next = ifLineCounter + 1
    setIfLineCounter(next)
    return next
  }, [ifLineCounter])

  return {
    // 状态
    mode,
    mainBranch,
    currentBranch,
    viewingOid,
    currentIfBranch,
    editingFile,
    ifLineCounter,
    changedFilesInIf,
    headOid,

    // 动作
    setupRepo,
    enterPreview,
    leaveToBrowse,
    switchToBranch,
    startEdit,
    onCommitInIf,
    allocateIfCounter,
  }
}

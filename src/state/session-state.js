export const initialSession = {
  mode: 'browse', mainBranch: 'main', currentBranch: 'main', viewingOid: null,
  currentIfBranch: null, editingFile: null, ifLineCounter: 0, changedFilesInIf: 0, headOid: null,
}

export const isIfBranch = name => typeof name === 'string' && name.startsWith('if-')
export const pickMainBranch = names => ['main', 'master'].find(name => names.includes(name)) || names[0] || 'main'

// Keep the save baseline fixed while an editor is open. A refreshed map may
// reveal external changes, but only an explicit new edit can accept that HEAD.
export function sessionReducer(state, action) {
  switch (action.type) {
    case 'setup': {
      const main = pickMainBranch(action.names)
      const branch = action.branch ?? main
      return { ...initialSession, mainBranch: main, currentBranch: branch, headOid: action.head || null, currentIfBranch: isIfBranch(branch) ? branch : null }
    }
    case 'snapshot': {
      if (state.editingFile) return state
      const { head, branch, branches } = action.snapshot
      const mainBranch = pickMainBranch(branches.filter(ref => !ref.remote).map(ref => ref.name))
      const changed = head !== state.headOid || branch !== state.currentBranch
      if (!changed && mainBranch === state.mainBranch) return state
      const viewingOid = !state.viewingOid || state.viewingOid === state.headOid ? head : state.viewingOid
      return { ...state, mainBranch, headOid: head, currentBranch: branch,
        currentIfBranch: isIfBranch(branch) ? branch : null, viewingOid,
        mode: changed ? (viewingOid && viewingOid !== head ? 'preview' : 'browse') : state.mode,
        changedFilesInIf: changed ? 0 : state.changedFilesInIf }
    }
    case 'preview': return { ...state, mode: 'preview', viewingOid: action.oid, editingFile: null, changedFilesInIf: 0 }
    case 'browse': return { ...state, mode: 'browse', viewingOid: action.oid ?? state.headOid, editingFile: null, changedFilesInIf: 0 }
    case 'switch': return { ...state, mode: 'browse', currentBranch: action.branch, headOid: action.head, viewingOid: action.head, currentIfBranch: isIfBranch(action.branch) ? action.branch : null, editingFile: null, changedFilesInIf: 0 }
    case 'edit': return { ...state, mode: 'edit', editingFile: action.file, currentBranch: action.branch, currentIfBranch: action.branch, headOid: action.head || state.headOid }
    case 'commit': return { ...state, editingFile: null, headOid: action.head, viewingOid: action.head, changedFilesInIf: state.changedFilesInIf + 1 }
    case 'counter': return { ...state, ifLineCounter: state.ifLineCounter + 1 }
    default: return state
  }
}

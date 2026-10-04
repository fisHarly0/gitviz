import { useCallback, useReducer } from 'react'
import { initialSession, sessionReducer } from './session-state.js'

export { isIfBranch, pickMainBranch } from './session-state.js'
export const makeIfBranchName = (parentShortSha, counter) => `if-${parentShortSha}-${counter}`

export function useSession() {
  const [state, dispatch] = useReducer(sessionReducer, initialSession)
  const setupRepo = useCallback((names, head, branch) => dispatch({ type: 'setup', names, head, branch }), [])
  const syncSnapshot = useCallback(snapshot => dispatch({ type: 'snapshot', snapshot }), [])
  const enterPreview = useCallback(oid => dispatch({ type: 'preview', oid }), [])
  const leaveToBrowse = useCallback(oid => dispatch({ type: 'browse', oid }), [])
  const switchToBranch = useCallback((branch, head) => dispatch({ type: 'switch', branch, head }), [])
  const startEdit = useCallback((file, branch, head) => dispatch({ type: 'edit', file, branch, head }), [])
  const onCommitInIf = useCallback(head => dispatch({ type: 'commit', head }), [])
  const allocateIfCounter = useCallback(() => {
    dispatch({ type: 'counter' })
    return state.ifLineCounter + 1
  }, [state.ifLineCounter])
  return { ...state, setupRepo, syncSnapshot, enterPreview, leaveToBrowse, switchToBranch, startEdit, onCommitInIf, allocateIfCounter }
}

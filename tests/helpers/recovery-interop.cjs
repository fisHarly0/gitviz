// Called by Rust tests against their isolated fixture. No production repository.
const { GitService } = require('../../extensions/vscode/git-service.cjs')
const [mode, root, value] = process.argv.slice(2)
;(async () => {
  const git = await GitService.open(root), expected = { head: await git.head(), branch: await git.branch() }
  if (mode === 'fail') {
    try { await git.restore(value, expected); throw new Error('Expected a failing hook') }
    catch (error) { if (!/fixture-hook-rejected/.test(error.message)) throw error }
    console.log((await git.operations()).records[0].id)
  } else if (mode === 'resume') {
    const record = await git.pendingCommit(value, expected)
    const result = await git.resumeCommit(value, expected, record.checkpoint)
    console.log(JSON.stringify(result))
  } else if (mode === 'list') console.log(JSON.stringify(await git.operations()))
  else throw new Error('Unsupported fixture mode')
})().catch(error => { console.error(error); process.exit(1) })

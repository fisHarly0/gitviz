import { createHandler } from './host.mjs'
import { GitService } from './dist/git-service.cjs'
import { OperationHost } from './dist/operation-host.cjs'

export const inject = ['webServer']

export function apply(ctx, config = {}) {
  const handler = createHandler({ GitService, OperationHost, config, port: () => ctx.webServer.port })
  ctx.effect(() => {
    const dispose = ctx.webServer.register({ kind: 'exact', path: '/_gitviz/api', handler })
    return () => { dispose(); handler.dispose() }
  }, 'gitviz: local Git API')
}

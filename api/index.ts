import type { IncomingMessage, ServerResponse } from 'node:http'

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url || '/', 'http://localhost')
  const apiPath = url.searchParams.get('__api_path')
  if (!apiPath) {
    res.statusCode = 400
    res.end('Missing API route')
    return
  }
  url.searchParams.delete('__api_path')
  req.url = `/api/${apiPath}${url.search}`
  const { default: app } = await import('../server/src/app.js')
  return app(req, res)
}

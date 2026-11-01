#!/usr/bin/env node
// Minimal static file server for the built documentation preview.
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname, join, resolve, sep } from 'node:path'

const root = resolve(process.env.DEPLOY_DIR || 'dist')
const port = Number(process.env.PORT || 3000)
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.wasm': 'application/wasm',
}

function safePath(urlPath) {
  let decoded
  try {
    decoded = decodeURIComponent(urlPath)
  } catch {
    return undefined
  }
  const file = resolve(root, '.' + decoded)
  return file === root || file.startsWith(root + sep) ? file : undefined
}

const server = createServer(async (request, response) => {
  const started = performance.now()
  try {
    const url = new URL(request.url || '/', 'http://localhost')
    const requested = url.pathname === '/' ? '/index.html' : url.pathname
    const file = safePath(requested)
    if (!file) {
      response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
      response.end('Not found')
      return
    }
    const info = await stat(file)
    if (!info.isFile()) {
      response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
      response.end('Not found')
      return
    }
    response.writeHead(200, {
      'content-type': mime[extname(file).toLowerCase()] || 'application/octet-stream',
      'cache-control': 'no-cache',
      'content-length': info.size,
    })
    createReadStream(file).pipe(response)
  } catch {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
    response.end('Not found')
  } finally {
    response.on('finish', () => {
      console.log(`[timing] ${request.method} ${request.url}: ${(performance.now() - started).toFixed(0)} ms`)
    })
  }
})

server.listen(port, '0.0.0.0', () => {
  console.log(`Serving ${root} on http://0.0.0.0:${port}`)
})

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => server.close(() => process.exit(0)))
}

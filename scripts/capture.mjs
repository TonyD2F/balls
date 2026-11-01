#!/usr/bin/env node
// Capture desktop and mobile screenshots of the running preview.
// Exit codes: 75 = temporary browser/navigation infrastructure failure,
//             1  = script or rendering defect.

import { mkdir, readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { dirname, join, resolve, sep } from 'node:path'

const url = process.env.CAPTURE_URL
const output = process.env.CAPTURE_DIR
if (!url || !output) {
  console.error('Set CAPTURE_URL and CAPTURE_DIR.')
  process.exit(1)
}

const project = resolve(process.env.PROJECT_DIR || process.cwd())
const captureDir = resolve(output)
if (captureDir === project || captureDir.startsWith(project + sep)) {
  console.error(`CAPTURE_DIR must be outside the project source: ${captureDir}`)
  process.exit(1)
}

const runtime = join(homedir(), '.local', 'share', 'omgithub-playwright')
const require = createRequire(join(runtime, 'package.json'))
const { chromium } = require('playwright')

async function timed(name, fn) {
  const started = performance.now()
  try {
    return await fn()
  } finally {
    console.log(`[timing] ${name}: ${(performance.now() - started).toFixed(0)} ms`)
  }
}

function transient(error) {
  return Object.assign(error instanceof Error ? error : new Error(String(error)), { exitCode: 75 })
}

function classify(error, phase) {
  const message = String(error?.message || error)
  if (phase === 'launch' || phase === 'new-page' || phase === 'close') return 75
  if (/net::ERR_|ERR_NAME_NOT_RESOLVED|ERR_CONNECTION|ERR_TIMED_OUT|timeout|timed out|Target closed|browser has disconnected|Navigation failed|Protocol error/i.test(message)) return 75
  return 1
}

function statusExit(status) {
  if (status === 408 || status === 429 || status >= 500) return 75
  return 1
}

await mkdir(captureDir, { recursive: true })

const platformConfig = process.platform === 'darwin' ? 'metal.json' : 'linux.json'
const config = JSON.parse(await readFile(join(runtime, platformConfig), 'utf8'))
if (process.platform === 'linux' && !process.env.DISPLAY) {
  const display = (await readFile(join(runtime, 'display'), 'utf8')).trim()
  process.env.DISPLAY = `:${display}`
}

let browser
let exitCode = 0
try {
  browser = await timed('launch browser', () =>
    chromium.launch({ ...config.browser.launchOptions, timeout: 30000 }).catch((error) => {
      throw transient(error)
    }),
  )

  for (const [name, width, height] of [
    ['desktop', 1440, 900],
    ['mobile', 390, 844],
  ]) {
    const pageErrors = []
    const badResponses = []
    let page

    try {
      page = await timed(`new ${name} page`, () =>
        browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 }).catch((error) => {
          throw transient(error)
        }),
      )
      page.setDefaultTimeout(30000)
      page.on('pageerror', (error) => pageErrors.push(error.message))
      page.on('response', (response) => {
        try {
          if (response.status() >= 400 && new URL(response.url()).origin === new URL(url).origin) {
            badResponses.push({ status: response.status(), url: response.url() })
          }
        } catch {
          // Ignore malformed response URLs.
        }
      })

      const response = await timed(`${name} navigation`, () =>
        page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch((error) => {
          throw Object.assign(error, { exitCode: classify(error, 'navigation') })
        }),
      )
      if (!response) throw transient(new Error(`No HTTP response for ${url}`))
      if (!response.ok()) {
        const error = new Error(`HTTP ${response.status()} loading ${url}`)
        error.exitCode = statusExit(response.status())
        throw error
      }

      await timed(`${name} rendered content`, async () => {
        await page.locator('body').waitFor({ state: 'visible', timeout: 15000 })
        await page.waitForFunction(() => document.fonts?.status === 'loaded', null, { timeout: 15000 }).catch(() => {})
        await page.waitForFunction(() => document.body?.dataset.appReady === 'true', null, { timeout: 15000 }).catch(() => {})
        await page.waitForTimeout(400)
      })

      const text = (await page.locator('body').innerText()).trim()
      if (text.length < 20) {
        const error = new Error('Rendered page is empty')
        error.exitCode = 1
        throw error
      }

      await timed(`${name} screenshot`, () =>
        page.screenshot({ path: join(captureDir, `final-${name}.png`), fullPage: false, timeout: 30000 }).catch((error) => {
          throw Object.assign(error, { exitCode: classify(error, 'screenshot') })
        }),
      )

      if (pageErrors.length) {
        const error = new Error(`Page errors: ${pageErrors.join('; ')}`)
        error.exitCode = 1
        throw error
      }
      const severe = badResponses.find((item) => statusExit(item.status) === 75)
      if (severe) {
        const error = new Error(`Temporary HTTP ${severe.status}: ${severe.url}`)
        error.exitCode = 75
        throw error
      }
      if (badResponses.length) {
        const error = new Error(`Failed resources: ${badResponses.map((item) => `HTTP ${item.status} ${item.url}`).join('; ')}`)
        error.exitCode = 1
        throw error
      }
    } catch (error) {
      console.error(error)
      exitCode = error.exitCode || classify(error, 'render')
      break
    } finally {
      if (page) await page.close().catch(() => {})
    }
  }
} catch (error) {
  console.error(error)
  exitCode = error.exitCode || 75
} finally {
  if (browser) {
    await timed('close browser', () => browser.close()).catch((error) => {
      console.error(error)
      if (!exitCode) exitCode = 75
    })
  }
}

if (exitCode) {
  console.error(`Capture failed with exit ${exitCode}`)
  process.exit(exitCode)
}
console.log(`Captured ${join(captureDir, 'final-desktop.png')} and ${join(captureDir, 'final-mobile.png')}`)

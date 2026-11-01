#!/usr/bin/env node
// Build the static documentation preview from the project's Markdown report.
// No third-party dependencies: the small renderer below covers the constructs
// used by CONFIGURATION_REPORT.md (headings, tables, lists, code, quotes, links).

import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const project = resolve(here, '..')
const source = join(project, 'CONFIGURATION_REPORT.md')
const output = join(project, 'dist')
const indexPath = join(output, 'index.html')

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function inline(value) {
  const code = []
  let text = String(value).replace(/`([^`]+)`/g, (_, body) => {
    code.push(body)
    return `\u0000${code.length - 1}\u0000`
  })
  text = escapeHtml(text)
  text = text.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, href) => {
    const safe = /^(?:https?:|mailto:|#|\/)/.test(href) ? href : '#'
    const external = /^https?:/.test(safe) ? ' target="_blank" rel="noreferrer"' : ''
    return `<a href="${escapeHtml(safe)}"${external}>${label}</a>`
  })
  text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  text = text.replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>')
  return text.replace(/\u0000(\d+)\u0000/g, (_, index) => `<code>${escapeHtml(code[Number(index)])}</code>`)
}

function plain(value) {
  return inline(value).replace(/<[^>]+>/g, '')
}

function isBlockStart(line) {
  return (
    /^```/.test(line) ||
    /^\s*\|/.test(line) ||
    /^(#{1,6})\s+/.test(line) ||
    /^\s*[-*+]\s+/.test(line) ||
    /^\s*\d+\.\s+/.test(line) ||
    /^>\s?/.test(line) ||
    /^\s*---+\s*$/.test(line)
  )
}

function renderTable(lines) {
  const rows = lines.map((line) =>
    line
      .trim()
      .replace(/^\|/, '')
      .replace(/\|$/, '')
      .split('|')
      .map((cell) => cell.trim()),
  )
  const header = rows[0] ?? []
  const body = rows.slice(2)
  const head = header.map((cell) => `<th>${inline(cell)}</th>`).join('')
  const cells = body
    .map((row) => `<tr>${row.map((cell) => `<td>${inline(cell)}</td>`).join('')}</tr>`)
    .join('')
  return `<div class="table-wrap"><table><thead><tr>${head}</tr></thead><tbody>${cells}</tbody></table></div>`
}

function renderMarkdown(markdown) {
  const lines = markdown.replaceAll('\r\n', '\n').split('\n')
  const html = []
  const toc = []
  let index = 0
  let section = 0

  while (index < lines.length) {
    const line = lines[index]

    if (/^```/.test(line)) {
      const language = line.slice(3).trim()
      const block = []
      index++
      while (index < lines.length && !/^```/.test(lines[index])) {
        block.push(lines[index])
        index++
      }
      if (index < lines.length) index++
      const className = language ? ` class="language-${escapeHtml(language)}"` : ''
      html.push(`<pre><code${className}>${escapeHtml(block.join('\n'))}</code></pre>`)
      continue
    }

    if (/^\s*\|/.test(line)) {
      const table = []
      while (index < lines.length && /^\s*\|/.test(lines[index])) {
        table.push(lines[index])
        index++
      }
      html.push(renderTable(table))
      continue
    }

    const heading = line.match(/^(#{1,6})\s+(.*)$/)
    if (heading) {
      const level = heading[1].length
      const text = heading[2]
      if (level === 2) {
        section++
        const id = `section-${section}`
        toc.push({ id, text: plain(text) })
        html.push(`<h2 id="${id}">${inline(text)}</h2>`)
      } else {
        html.push(`<h${level}>${inline(text)}</h${level}>`)
      }
      index++
      continue
    }

    if (/^\s*[-*+]\s+/.test(line)) {
      const items = []
      while (index < lines.length && /^\s*[-*+]\s+/.test(lines[index])) {
        items.push(lines[index].replace(/^\s*[-*+]\s+/, ''))
        index++
      }
      html.push(`<ul>${items.map((item) => `<li>${inline(item)}</li>`).join('')}</ul>`)
      continue
    }

    if (/^\s*\d+\.\s+/.test(line)) {
      const items = []
      while (index < lines.length && /^\s*\d+\.\s+/.test(lines[index])) {
        items.push(lines[index].replace(/^\s*\d+\.\s+/, ''))
        index++
      }
      html.push(`<ol>${items.map((item) => `<li>${inline(item)}</li>`).join('')}</ol>`)
      continue
    }

    if (/^>\s?/.test(line)) {
      const quote = []
      while (index < lines.length && /^>\s?/.test(lines[index])) {
        quote.push(lines[index].replace(/^>\s?/, ''))
        index++
      }
      html.push(`<blockquote>${inline(quote.join(' '))}</blockquote>`)
      continue
    }

    if (/^\s*---+\s*$/.test(line)) {
      html.push('<hr>')
      index++
      continue
    }

    if (line.trim() === '') {
      index++
      continue
    }

    const parts = []
    while (index < lines.length && lines[index].trim() !== '' && !isBlockStart(lines[index])) {
      const raw = lines[index]
      parts.push(inline(raw.trim()))
      if (/\s{2,}$/.test(raw)) parts.push('<br>')
      index++
    }
    html.push(`<p>${parts.join(' ')}</p>`)
  }

  return { html: html.join('\n'), toc }
}

const markdown = await readFile(source, 'utf8')
const { html, toc } = renderMarkdown(markdown)
const links = toc
  .map((item) => `<a href="#${item.id}">${escapeHtml(item.text)}</a>`)
  .join('')

const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="icon" href="data:,">
<title>balls — OpenCode Configuration Report</title>
<meta name="description" content="A detailed audit of the OpenCode configuration loaded by this project.">
<style>
:root{--bg:#070a11;--panel:rgba(15,21,34,.78);--text:#e7eefb;--muted:#9aa8c0;--accent:#5eead4;--accent2:#818cf8;--border:#1e2a3e}
*{box-sizing:border-box}
html{scroll-behavior:smooth}
body{margin:0;color:var(--text);line-height:1.65;font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;background:radial-gradient(1100px 560px at 8% -10%,rgba(94,234,212,.14),transparent 60%),radial-gradient(900px 520px at 92% 0%,rgba(129,140,248,.16),transparent 58%),var(--bg)}
.orb{position:fixed;border-radius:50%;filter:blur(70px);opacity:.3;pointer-events:none;z-index:0;animation:float 18s ease-in-out infinite}
.hero{position:relative;z-index:1;max-width:1200px;margin:0 auto;padding:76px 24px 42px}
.eyebrow{color:var(--accent);text-transform:uppercase;letter-spacing:.2em;font-size:12px;font-weight:700}
h1{font-size:clamp(34px,5.4vw,60px);line-height:1.05;letter-spacing:-.035em;margin:12px 0 18px;max-width:900px}
.lede{color:var(--muted);font-size:18px;max-width:760px;margin:0}
.chips{display:flex;flex-wrap:wrap;gap:8px;margin-top:26px}
.chip{border:1px solid var(--border);background:rgba(255,255,255,.03);color:var(--muted);padding:6px 11px;border-radius:999px;font-size:12px;white-space:nowrap}
.layout{position:relative;z-index:1;max-width:1200px;margin:0 auto;padding:0 24px 80px;display:grid;grid-template-columns:260px minmax(0,1fr);gap:42px;align-items:start}
.toc{position:sticky;top:24px;border:1px solid var(--border);background:var(--panel);backdrop-filter:blur(14px);border-radius:16px;padding:18px;max-height:calc(100vh - 48px);overflow:auto}
.toc h2{font-size:11px;text-transform:uppercase;letter-spacing:.16em;color:var(--muted);margin:0 0 12px}
.toc a{display:block;color:var(--muted);text-decoration:none;font-size:13px;padding:5px 0 5px 10px;border-left:2px solid transparent}
.toc a:hover{color:var(--text);border-left-color:var(--accent)}
main{min-width:0}
main h1{display:none}
main h2{font-size:27px;line-height:1.2;letter-spacing:-.02em;margin:48px 0 16px;padding-top:18px;border-top:1px solid var(--border);scroll-margin-top:24px}
main h3{font-size:19px;margin:28px 0 10px;scroll-margin-top:24px}
main p{color:#c8d3e6}
main a{color:var(--accent)}
main code{background:rgba(94,234,212,.09);color:#b8fff4;padding:2px 5px;border-radius:5px;font-size:.9em}
main pre{background:#05080e;border:1px solid var(--border);border-radius:12px;padding:16px;overflow:auto;line-height:1.5}
main pre code{background:none;padding:0;color:#c9d6ea}
.table-wrap{overflow:auto;border:1px solid var(--border);border-radius:12px;margin:18px 0}
table{border-collapse:collapse;width:100%;font-size:14px}
th,td{padding:10px 12px;border-bottom:1px solid var(--border);text-align:left;vertical-align:top}
th{background:rgba(255,255,255,.04);color:#dce7f8;font-weight:600}
tr:last-child td{border-bottom:none}
blockquote{margin:18px 0;padding:12px 16px;border-left:3px solid var(--accent2);background:rgba(129,140,248,.08);border-radius:0 10px 10px 0;color:#c8d3e6}
hr{border:none;border-top:1px solid var(--border);margin:36px 0}
footer{position:relative;z-index:1;max-width:1200px;margin:0 auto;padding:24px;color:var(--muted);font-size:13px;border-top:1px solid var(--border)}
footer a{color:var(--accent)}
@keyframes float{0%,100%{transform:translate3d(0,0,0) scale(1)}50%{transform:translate3d(22px,-32px,0) scale(1.08)}}
@media(max-width:900px){.layout{grid-template-columns:1fr;gap:24px}.toc{display:none}.hero{padding:36px 20px 24px}h1{font-size:38px}.lede{font-size:16px}.chips{margin-top:18px}.layout{padding:0 20px 60px}main h2{margin-top:32px}}
</style>
</head>
<body data-app-ready="false">
<div class="orb" style="width:440px;height:440px;background:#14b8a6;top:-140px;left:-110px"></div>
<div class="orb" style="width:360px;height:360px;background:#6366f1;top:120px;right:-90px;animation-delay:-6s"></div>
<div class="orb" style="width:320px;height:320px;background:#0ea5e9;bottom:-120px;left:42%;animation-delay:-12s"></div>
<header class="hero">
  <div class="eyebrow">TonyD2F / balls</div>
  <h1>OpenCode Configuration Report</h1>
  <p class="lede">A detailed audit of the OpenCode v2.2.5 agent configuration loaded by this session: permissions, agents, models, skills, runtime scripts, and CI behavior.</p>
  <div class="chips">
    <span class="chip">OpenCode v2.2.5</span>
    <span class="chip">deepseek-v4.1-flash-free</span>
    <span class="chip">7 agents</span>
    <span class="chip">5 project skills</span>
    <span class="chip">2026-11-01</span>
  </div>
</header>
<div class="layout">
  <aside class="toc"><h2>Contents</h2>${links}</aside>
  <main id="report">${html}</main>
</div>
<footer>Generated from <a href="/CONFIGURATION_REPORT.md">CONFIGURATION_REPORT.md</a> · static build · <span id="build-note">OpenCode configuration audit</span></footer>
<script>
  const markReady = () => requestAnimationFrame(() => {
    document.body.dataset.appReady = 'true';
    window.__APP_READY__ = true;
  });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(markReady, markReady);
  else markReady();
  window.addEventListener('load', markReady, { once: true });
</script>
</body>
</html>
`

await mkdir(output, { recursive: true })
await writeFile(indexPath, page)
await copyFile(source, join(output, 'CONFIGURATION_REPORT.md'))
console.log(`Built ${indexPath}`)
console.log(`Sections: ${toc.length}`)

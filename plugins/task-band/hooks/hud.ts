// The HUD half of the band: model, git, context, rate limits, tools, agents, todos, and Clawd.
import type { AgentRun, Band, Limit, Todo, ToolRun } from '../types'

const short = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)
const base = (p: string) => p.replace(/\/+$/, '').split('/').pop() ?? p

// mcp__server__tool → tool
export const toolName = (tool: string) => (tool.startsWith('mcp__') ? tool.split('__').slice(2).join('__') || tool : tool)

// The one thing a tool call is about: a file, a command, a pattern, a host.
export function toolTarget(input: Record<string, unknown>): string {
  const s = (k: string) => (typeof input[k] === 'string' ? (input[k] as string) : '')
  if (s('file_path')) return base(s('file_path'))
  if (s('notebook_path')) return base(s('notebook_path'))
  if (s('command')) return short(s('command').split('\n')[0] ?? '', 28)
  if (s('pattern')) return short(s('pattern'), 24)
  if (s('url')) return s('url').replace(/^https?:\/\/([^/]+).*$/, '$1')
  if (s('query')) return short(s('query'), 24)
  if (s('description')) return short(s('description'), 28)
  return ''
}

// Tools of this turn: the running ones first, then the finished ones counted by name, newest first.
export function toolsLine(tools: ToolRun[], max = 5): string[] {
  const running = tools.filter(t => t.running).map(t => `◐ ${t.name}${t.target ? `: ${t.target}` : ''}`)
  const counts = new Map<string, number>()
  for (const t of [...tools].reverse()) if (!t.running) counts.set(t.name, (counts.get(t.name) ?? 0) + 1)
  const done = [...counts].map(([n, c]) => `✓ ${n}${c > 1 ? ` ×${c}` : ''}`)
  return [...running, ...done].slice(0, max)
}

export const dur = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000))
  return s < 60 ? `${s}s` : s < 3600 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`
}

export function agentsLine(agents: AgentRun[], now: number): string[] {
  return agents.slice(-3).map(a => `${a.running ? '◐' : '✓'} ${a.type}${a.model ? ` [${a.model}]` : ''}: ${short(a.desc, 40)} (${dur((a.running ? now : a.endedAt ?? now) - a.startedAt)})`)
}

export function todoLine(todos: Todo[]): string | undefined {
  if (todos.length === 0) return undefined
  const done = todos.filter(t => t.status === 'completed').length
  const current = todos.find(t => t.status === 'in_progress') ?? todos.find(t => t.status === 'pending')
  return current ? `▸ ${short(current.text, 60)} (${done}/${todos.length})` : `✓ All done (${done}/${todos.length})`
}

// The desktop app's plan tool: a whole list, or advance / done / start on it.
export function applyPlan(todos: Todo[], input: Record<string, unknown>): Todo[] {
  let list = todos
  if (Array.isArray(input.items)) {
    list = (input.items as { content?: unknown; status?: unknown }[]).map((it, i) => ({
      id: `p${i + 1}`,
      text: String(it.content ?? ''),
      status: it.status === 'completed' || it.status === 'in_progress' ? it.status : 'pending',
    }))
  }
  const set = (i: number, status: Todo['status']) => {
    list = list.map((t, j) => (j === i ? { ...t, status } : t))
  }
  if (input.advance === true) {
    const cur = list.findIndex(t => t.status === 'in_progress')
    if (cur >= 0) set(cur, 'completed')
    const nxt = list.findIndex(t => t.status === 'pending')
    if (nxt >= 0) set(nxt, 'in_progress')
  }
  if (Array.isArray(input.done)) for (const n of input.done) if (typeof n === 'number') set(n - 1, 'completed')
  if (typeof input.start === 'number') set(input.start - 1, 'in_progress')
  return list
}

const LIMIT_LABEL: Record<string, string> = { five_hour: '5h', seven_day: '7d', spend_limit: 'spend' }
export const limitLabel = (l: Limit) => LIMIT_LABEL[l.kind] ?? l.kind
export const resetsIn = (l: Limit, now: number) => {
  const at = l.resetsAt ? Date.parse(l.resetsAt) : NaN
  if (Number.isNaN(at) || at <= now) return ''
  const m = Math.max(1, Math.round((at - now) / 60000))
  const d = Math.floor(m / 1440)
  const h = Math.floor((m % 1440) / 60)
  return `resets in ${d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m % 60}m` : `${m}m`}`
}

// green, then yellow, then red as it fills
export const tone = (pct: number) => (pct >= 85 ? 'error' : pct >= 60 ? 'warning' : 'success')

export const bar = (pct: number, cells = 10) => {
  const n = Math.max(0, Math.min(cells, Math.round((pct / 100) * cells)))
  return '█'.repeat(n) + '░'.repeat(cells - n)
}

export const headline = (b: Band) =>
  [b.liveModel || b.model, b.project && `${b.project}${b.branch ? ` git:(${b.branch}${b.dirty ? '*' : ''})` : ''}`].filter(Boolean).join(' │ ')

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const FONT = `ui-monospace,SFMono-Regular,Menlo,monospace`
const STYLE = `.l{fill:#87867f;font:12px ${FONT}}.t{fill:#1f1e1d;font:12px ${FONT}}.k{fill:#1f1e1d;fill-opacity:.1}.success{fill:#2e7d32}.warning{fill:#c98a00}.error{fill:#c62828}.d{stroke:#1f1e1d;stroke-opacity:.12}@media (prefers-color-scheme:dark){.t{fill:#ecebe6}.k{fill:#fff;fill-opacity:.12}.success{fill:#6abf69}.warning{fill:#e3a03d}.error{fill:#ef6a5a}.d{stroke:#fff;stroke-opacity:.14}}`

export type Gauge = { label: string; pct: number; note: string }

// Context and rate-limit bars, then up to three activity lines, as one SVG.
export function hudSvg(gauges: Gauge[], lines: string[], width = 720): string {
  const gw = width / Math.max(1, gauges.length)
  let body = ''
  gauges.forEach((g, i) => {
    const x = i * gw + (i === 0 ? 0 : 12)
    const bw = Math.max(40, gw - 24 - 190)
    if (i > 0) body += `<line class="d" x1="${i * gw}" y1="4" x2="${i * gw}" y2="36"/>`
    body += `<text class="l" x="${x}" y="14">${esc(g.label)}</text>`
    body += `<text class="t" x="${x + bw + 8}" y="31">${g.pct}%</text>`
    body += `<rect class="k" x="${x}" y="22" width="${bw}" height="10" rx="3"/>`
    body += `<rect class="${tone(g.pct)}" x="${x}" y="22" width="${Math.max(2, (bw * Math.min(100, g.pct)) / 100)}" height="10" rx="3"/>`
    if (g.note) body += `<text class="l" x="${x + bw + 46}" y="31">${esc(short(g.note, 20))}</text>`
  })
  const top = gauges.length > 0 ? 54 : 14
  lines.forEach((l, i) => {
    body += `<text class="t" x="0" y="${top + i * 18}">${esc(short(l, Math.floor(width / 7.4)))}</text>`
  })
  const height = (gauges.length > 0 ? 40 : 0) + (lines.length > 0 ? lines.length * 18 + 4 : 0)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><style>${STYLE}</style>${body}</svg>`
}

export type Mood = 'idle' | 'busy' | 'happy' | 'sad'

// Pixel Clawd from the Claude Code welcome logo (18 x 5 grid), animated with SMIL:
// walks on the spot, blinks, hops now and then; busy = faster steps, happy = arms up, sad = droops.
export function clawdSvg(mood: Mood): string {
  const px = 3
  const py = 5
  const color = mood === 'sad' ? '#b0705c' : '#D97757'
  const step = mood === 'busy' ? 0.3 : 0.6
  const cell = (c: number, r: number, cls = '') => `<rect${cls ? ` class="${cls}"` : ''} x="${c * px}" y="${r * py}" width="${px + 0.2}" height="${py + 0.2}"/>`
  let head = ''
  for (let c = 3; c <= 14; c++) head += cell(c, 0)
  for (let c = 3; c <= 14; c++) if (c !== 5 && c !== 12) head += cell(c, 1)
  for (let c = 2; c <= 15; c++) head += cell(c, 2)
  for (let c = 3; c <= 14; c++) head += cell(c, 3)
  // eyelids: drawn over the eyes for a blink
  const lids = `<g opacity="0">${cell(5, 1)}${cell(12, 1)}<animate attributeName="opacity" values="0;0;1;0" keyTimes="0;0.92;0.96;1" dur="3.7s" repeatCount="indefinite"/></g>`
  const arms =
    mood === 'happy'
      ? `<g>${cell(1, 1)}${cell(16, 1)}<animateTransform attributeName="transform" type="translate" values="0 0;0 -3;0 0" dur="0.5s" repeatCount="indefinite"/></g>`
      : `${cell(1, 2)}${cell(16, 2)}`
  const legsA = `<g>${cell(4, 4)}${cell(11, 4)}<animateTransform attributeName="transform" type="translate" values="0 0;0 -2;0 0;0 0" dur="${step * 2}s" repeatCount="indefinite"/></g>`
  const legsB = `<g>${cell(6, 4)}${cell(13, 4)}<animateTransform attributeName="transform" type="translate" values="0 0;0 0;0 -2;0 0" dur="${step * 2}s" repeatCount="indefinite"/></g>`
  const bob = `<animateTransform attributeName="transform" type="translate" values="0 0;0 1;0 0" dur="${step}s" repeatCount="indefinite"/>`
  const hop =
    mood === 'sad'
      ? ''
      : `<animateTransform attributeName="transform" type="translate" values="0 0;0 0;0 -7;0 0;0 0" keyTimes="0;0.8;0.86;0.92;1" dur="${mood === 'happy' ? 1.6 : 5}s" repeatCount="indefinite"/>`
  const w = 18 * px
  const h = 5 * py + 9
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 -8 ${w} ${h}"><ellipse cx="${w / 2}" cy="${5 * py + 0.5}" rx="${w / 2.6}" ry="1.2" fill="#000" fill-opacity=".15"/><g fill="${color}"><g>${hop}<g>${bob}${head}${arms}${lids}</g>${legsA}${legsB}</g></g></svg>`
}

// The terminal's Clawd: the block logo, arms up when the tests pass.
export const clawdText = (mood: Mood) => (mood === 'happy' ? '▝▜███▛▘' : '▐▛███▜▌')

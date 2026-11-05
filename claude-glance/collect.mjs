#!/usr/bin/env node
// Sums Claude Code transcripts (~/.claude/projects/**/*.jsonl) into ~/.claude-glance/stats.json
// for the Claude Glance screensaver. Cost = API-list-price equivalent (an estimate, not your bill).
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import readline from 'node:readline';

const HOME = os.homedir();
const ROOT = path.join(process.env.CLAUDE_CONFIG_DIR || path.join(HOME, '.claude'), 'projects');
const OUT_DIR = path.join(HOME, '.claude-glance');

// $ per million tokens: [input, output, cacheRead]. Cache writes: 5m = 1.25x input, 1h = 2x input.
const PRICES = [
  [/fable|mythos/, [10, 50, 0.25]],
  [/opus-5-5/, [4, 20, 0.2]],
  [/opus/, [5, 25, 0.5]],
  [/sonnet-4/, [3, 15, 0.3]],
  [/sonnet/, [2, 10, 0.2]],
  [/haiku-5/, [0.1, 0.5, 0.01]],
  [/haiku/, [1, 5, 0.1]],
];
const priceFor = (m) => (PRICES.find(([re]) => re.test(m)) || [null, [4, 20, 0.2]])[1];

function cost(model, u) {
  const [i, o, r] = priceFor(model);
  const c = u.cache_creation || {};
  const w1h = c.ephemeral_1h_input_tokens ?? 0;
  const w5m = c.ephemeral_5m_input_tokens ?? Math.max(0, (u.cache_creation_input_tokens || 0) - w1h);
  return ((u.input_tokens || 0) * i + (u.output_tokens || 0) * o + (u.cache_read_input_tokens || 0) * r
    + w5m * i * 1.25 + w1h * i * 2) / 1e6;
}

function* walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (e.name.endsWith('.jsonl')) yield p;
  }
}

const dayKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const prettyProject = (dir) => dir.replace(/^-Users-[^-]+-/, '').replace(/^(Desktop|Documents|projects)-/g, '').replace(/^(projects)-/, '');

const msgs = new Map(); // dedupe streamed duplicates by message id + request id
for (const file of walk(ROOT)) {
  const project = prettyProject(path.relative(ROOT, file).split(path.sep)[0]);
  const rl = readline.createInterface({ input: fs.createReadStream(file), crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.includes('"usage"')) continue;
    let d; try { d = JSON.parse(line); } catch { continue; }
    const m = d.message;
    if (!m?.usage || !d.timestamp || !m.model || m.model === '<synthetic>') continue;
    msgs.set(`${m.id}:${d.requestId}`, { t: new Date(d.timestamp), model: m.model, u: m.usage, session: d.sessionId, project });
  }
}

const now = new Date();
const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
const weekStart = new Date(today); weekStart.setDate(today.getDate() - ((today.getDay() + 6) % 7)); // Monday
const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
const blank = () => ({ cost: 0, tokens: 0, output: 0, sessions: new Set(), stamps: [] });
const P = { today: blank(), week: blank(), month: blank() };
const daily = new Map(), models = new Map(), projects = new Map(), hours = new Array(24).fill(0);

for (const { t, model, u, session, project } of msgs.values()) {
  const c = cost(model, u);
  const tok = (u.input_tokens || 0) + (u.output_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0);
  const k = dayKey(t);
  daily.set(k, (daily.get(k) || 0) + c);
  for (const [name, start] of [['today', today], ['week', weekStart], ['month', monthStart]]) {
    if (t < start) continue;
    const p = P[name];
    p.cost += c; p.tokens += tok; p.output += u.output_tokens || 0; p.sessions.add(session); p.stamps.push(+t);
  }
  if (t >= monthStart) {
    const fam = model.replace(/^claude-/, '').replace(/-\d{8}$/, '');
    models.set(fam, (models.get(fam) || 0) + c);
    projects.set(project, (projects.get(project) || 0) + c);
    hours[t.getHours()] += c;
  }
}

// Active time: sum gaps between consecutive API calls, ignoring gaps over 5 minutes.
const activeMinutes = (stamps) => {
  stamps.sort((a, b) => a - b);
  let ms = 0;
  for (let i = 1; i < stamps.length; i++) { const g = stamps[i] - stamps[i - 1]; if (g < 300000) ms += g; }
  return Math.round(ms / 60000);
};

const last30 = [];
for (let i = 29; i >= 0; i--) { const d = new Date(today); d.setDate(today.getDate() - i); last30.push(+(daily.get(dayKey(d)) || 0).toFixed(2)); }
let streak = 0;
for (let i = 0; ; i++) {
  const d = new Date(today); d.setDate(today.getDate() - i);
  if (daily.get(dayKey(d))) streak++; else if (i > 0) break; // today may still be empty
  if (i > 3650) break;
}
const top = (m) => { const [name, v] = [...m].sort((a, b) => b[1] - a[1])[0] || ['—', 0]; const total = [...m.values()].reduce((a, b) => a + b, 0); return { name, share: total ? Math.round((v / total) * 100) : 0 }; };
const peak = hours.indexOf(Math.max(...hours));

const period = (p) => ({ cost: +p.cost.toFixed(2), tokens: p.tokens, output: p.output, sessions: p.sessions.size, activeMinutes: activeMinutes(p.stamps) });
const stats = {
  updated: now.toISOString(),
  today: period(P.today), week: period(P.week), month: period(P.month),
  last30, streak, topModel: top(models), topProject: top(projects),
  peakHour: hours[peak] ? peak : null,
};

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(path.join(OUT_DIR, 'stats.json.tmp'), JSON.stringify(stats, null, 1));
fs.renameSync(path.join(OUT_DIR, 'stats.json.tmp'), path.join(OUT_DIR, 'stats.json'));
if (process.argv.includes('--print')) console.log(JSON.stringify(stats, null, 1));

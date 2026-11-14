export type Tests = {
  state: 'none' | 'pass' | 'fail' | 'stale'
  passed?: number
  failed?: number
}

export type Tokens = { input: number; output: number; cacheRead: number; cacheWrite: number }

export type ToolRun = { id: string; name: string; target: string; running: boolean }
export type AgentRun = { id: string; type: string; model: string; desc: string; startedAt: number; endedAt?: number; running: boolean }
export type Todo = { id: string; text: string; status: 'pending' | 'in_progress' | 'completed' }
export type Limit = { kind: string; pct: number; resetsAt?: string }
export type Context = { pct?: number; tokens?: number; window: number }

export type Band = {
  liveModel: string
  branch: string
  dirty: boolean
  context: Context
  limits: Limit[]
  tools: ToolRun[]
  agents: AgentRun[]
  todos: Todo[]
  level: string
  model: string
  cost: number
  spent: number
  turns: number
  turnCosts: number[]
  tokens: Tokens
  busyMs: number
  name: string
  project: string
  session: string
  transcript: string
  reused: string[]
  created: string[]
  removed: string[]
  openCallers: string[]
  tests: Tests
  details: boolean
}

declare module 'claude-code' {
  interface PluginState {
    'task-band': { band: Band }
  }
}

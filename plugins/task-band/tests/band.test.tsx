import { expect, test } from 'claude-code/testing'

import { applyPlan, resetsIn, todoLine, toolsLine } from '../hooks/hud'

const SEED = {
  liveModel: 'Opus 5.5',
  project: 'my-project',
  branch: 'main',
  dirty: true,
  spent: 1.38,
  turns: 2,
  turnCosts: [0.04],
  busyMs: 6000,
  name: 'Band plugin',
  context: { pct: 45, tokens: 90000, window: 200000 },
  limits: [{ kind: 'five_hour', pct: 25 }],
  tools: [
    { id: '1', name: 'Edit', target: 'auth.ts', running: true },
    { id: '2', name: 'Read', target: 'a.ts', running: false },
    { id: '3', name: 'Read', target: 'b.ts', running: false },
  ],
  agents: [{ id: 'a', type: 'Explore', model: 'haiku', desc: 'Finding auth code', startedAt: 0, running: true }],
  todos: [
    { id: 'p1', text: 'Look around', status: 'completed' },
    { id: 'p2', text: 'Fix authentication bug', status: 'in_progress' },
  ],
  tests: { state: 'pass', passed: 12 },
}

// The engine's answers the band asks for while drawing and tracking.
const engine = (on: any, details = false) => {
  on('store.get', (_: unknown, e: { key: string }) => ({ value: e.key === 'details' ? details : undefined }))
  on('store.set', () => ({ value: undefined }))
  on('clock.now', () => ({ value: 1000 }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 0 }, rateLimits: [] } }))
  on('ui.render', ($: any, e: any) => {
    const { Box } = $.ui.resolve(e)
    return <Box />
  })
}

const ABOVE = (surface: 'terminal' | 'desktop') =>
  ({
    plugin: 'task-band',
    component: 'AbovePrompt',
    surface,
    props: { hasSurvey: false, isWorking: false, maxRows: 12, bodyColumns: 100 },
  }) as any

for (const details of [false, true]) {
  test(`the band draws the HUD (details ${details})`, async ($, on) => {
    on('state.get', () => ({ value: { value: { ...SEED, details }, version: 1 } }))
    engine(on, details)
    // The terminal draws nothing of the band: it is for the desktop app only.
    const term = await $.ui.mount(ABOVE('terminal'))
    expect(await term.find({ type: 'Text', text: /\$1\.38/ })).toBeUndefined()
    await term.unmount()
    const ui = await $.ui.mount(ABOVE('desktop'))
    if (!details) expect((await ui.find({ type: 'Text', text: /\$1\.38/ }))?.text).toContain('$1.38')
    await ui.unmount()
  })
}

test('the plan tool fills the todo line', () => {
  let todos = applyPlan([], {
    items: [
      { content: 'One', status: 'in_progress' },
      { content: 'Two', status: 'pending' },
    ],
  })
  todos = applyPlan(todos, { advance: true })
  expect(todoLine(todos)).toBe('▸ Two (1/2)')
  expect(todoLine(applyPlan(todos, { advance: true }))).toBe('✓ All done (2/2)')
  expect(toolsLine([{ id: '1', name: 'Read', target: 'a', running: false }, { id: '2', name: 'Read', target: 'b', running: false }, { id: '3', name: 'Edit', target: 'x.ts', running: true }])).toEqual(['◐ Edit: x.ts', '✓ Read ×2'])
})

test('the reset countdown shows days past a day', () => {
  const now = Date.parse('2026-11-05T00:00:00Z')
  const at = (ms: number) => ({ kind: 'seven_day', pct: 36, resetsAt: new Date(now + ms).toISOString() })
  expect(resetsIn(at((83 * 60 + 41) * 60000), now)).toBe('resets in 3d 11h')
  expect(resetsIn(at((2 * 60 + 31) * 60000), now)).toBe('resets in 2h 31m')
  expect(resetsIn(at(5 * 60000), now)).toBe('resets in 5m')
})

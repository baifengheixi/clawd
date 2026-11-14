# task-band

The band above the prompt from [ponytail](https://github.com/DietrichGebert/ponytail) 5.3, on its own, without the rest of ponytail (no levels, rules, review or audit commands).

Plus a HUD in the style of [claude-hud](https://github.com/jarrodwatts/claude-hud): model, project and git branch (`*` when dirty), context fill and the 5-hour / 7-day usage limits as green-yellow-red bars, the tools of this turn (`◐ Edit: auth.ts | ✓ Read ×3`), running subagents with their time, and the current todo (`▸ Fix bug (2/5)`). An animated pixel Clawd sits at the front: it walks, blinks and hops, hurries while tools run, cheers when tests pass and droops when they fail.

It also shows what the current task costs (total and last turn), tokens, agent time, how often new code reused existing definitions, callers left open by removed functions, and whether tests passed after the last change. Buttons: **Details/Compact** to fold the band, **Copy** to copy the task as Markdown; `/band board` opens a local page of every task across projects.

Commands:

- `/band` switches the band on or off; `/band on`, `/band off`
- `/band board` opens the board

Data stays on your machine in `~/.config/task-band/` (one CSV per project plus `board.html`). An optional webhook in the plugin's settings sends each task's row as JSON.

Needs Claude Code 2.1.290 or later. The band draws in the Claude desktop app only; the terminal CLI shows nothing. Based on ponytail by Dietrich Gebert, MIT licensed (see LICENSE).

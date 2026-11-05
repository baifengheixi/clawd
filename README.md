# Clawd

Clawd images, plus a macOS screen saver and a Claude Code plugin I built around Claude Code.

| Folder / file | What it is |
| --- | --- |
| [`images/`](images) | Clawd images |
| [`claude-glance/`](claude-glance) | **Claude Glance**: a macOS screen saver that shows your Claude Code usage |
| [`task-band.plugin`](task-band.plugin) | **task-band**: a Claude Code plugin that adds a band above the prompt (desktop app only) with a HUD and an animated pixel Clawd |

## Claude Glance (screen saver)

![Claude Glance preview](claude-glance/preview.gif)

Shows your Claude Code activity as a screen saver: estimated cost, tokens, sessions and active time for today, this week and this month, a 30-day chart, your streak, top model, top project and peak hour.

How it works:

- `collect.mjs` reads the Claude Code transcripts in `~/.claude/projects/**/*.jsonl` (or under `$CLAUDE_CONFIG_DIR`) and writes `~/.claude-glance/stats.json`. A launchd job reruns it every 5 minutes.
- `ClaudeGlanceView.swift` is the screen saver. It draws whatever is in `stats.json`.
- The cost is what the tokens would cost at API list price. It is an estimate, not your bill.

Everything stays on your Mac. Nothing is sent anywhere.

### Install

Requires macOS 13 or later, Xcode Command Line Tools (`swiftc`), and Node.js.

```bash
./claude-glance/install.sh
```

The script builds a universal `ClaudeGlance.saver` (arm64 + x86_64), copies it to `~/Library/Screen Savers/`, and registers the `local.claude-glance` launchd job. When it finishes, open **System Settings → Screen Saver** and choose **ClaudeGlance**.

`claude-glance/build/` already holds a prebuilt `ClaudeGlance.saver`. If you install only that, also run `collect.mjs`, or the screen saver has no data to show.

### Uninstall

```bash
launchctl bootout gui/$(id -u) ~/Library/LaunchAgents/local.claude-glance.plist
```

```bash
rm -rf ~/Library/LaunchAgents/local.claude-glance.plist ~/Library/Screen\ Savers/ClaudeGlance.saver ~/.claude-glance
```

## task-band (Claude Code plugin)

Version 0.2.3. Adds a band above the Claude Code prompt in the **Claude desktop app only**. Since 0.2.3 the terminal CLI shows no band (task data is still recorded there).

What the band shows:

- **HUD:** model, project and git branch (`*` when there are uncommitted changes), how full the context is, and the 5-hour and 7-day usage limits as green-yellow-red bars with the time until each resets. It also shows this turn's tools (`◐ Edit: auth.ts | ✓ Read ×3`), running subagents and how long they have run, and the current todo (`▸ Fix bug (2/5)`).
- **Animated Clawd:** walks, blinks and hops, hurries while tools run, cheers when tests pass, and droops when they fail.
- **Task metrics:** cost (total and last turn), tokens, agent time, how often new code reused existing definitions, callers left without a target by removed functions, and whether tests passed after the last change.
- **Buttons:** **Details/Compact** expands or shrinks the band. **Copy** copies the task as Markdown.

### Commands

- `/band`, `/band on`, `/band off`: turn the band on or off
- `/band board`: open a local page that lists every task across projects

### Data and settings

Task data stays on your machine in `~/.config/task-band/`: one CSV per project, plus `board.html`. In the plugin settings you can:

- Turn the task board on or off.
- Set an optional webhook URL that receives each task's row as JSON. The webhook token is kept in the system keychain.
- Choose whether task names go to the webhook.

With no webhook URL set, nothing leaves your machine.

Requires Claude Code 2.1.290 or later, in the Claude desktop app. Based on [ponytail](https://github.com/DietrichGebert/ponytail) by Dietrich Gebert (MIT). The HUD's style follows [claude-hud](https://github.com/jarrodwatts/claude-hud).

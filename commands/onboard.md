---
description: Onboard to any codebase - generates a structured overview then guides you interactively through the project
codex-description: 'Use when the user is new to a repo and wants to know what it does, how it is laid out, where execution starts and how to build and test it. Collects project data, then gives a short tour and answers follow-ups.'
argument-hint: "[path] [--depth=quick|normal|deep]"
allowed-tools: Bash(git:*), Bash(node:*), Read, Glob, Grep, Task, AskUserQuestion
---

# /onboard

Get a developer oriented in an unfamiliar codebase: what it does, where execution starts, how it is laid out, how to build and test it, and where to go next.

## Arguments

`$ARGUMENTS`, all optional: a path (default: current directory) and `--depth`:

| Depth | Adds |
|-------|------|
| `quick` | manifest, README, directory tree, git info, CI |
| `normal` (default) | CLAUDE.md or AGENTS.md, repo-intel (built when missing) |
| `deep` | repo-map symbols and key exports |

## Collect

Collection is deterministic code, so run it instead of reproducing it:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/collect.js" $ARGUMENTS
```

`${CLAUDE_PLUGIN_ROOT}` is this plugin's root. In a harness that does not substitute it, find `scripts/collect.js` in the plugin directory with Glob. Exit 2 means a bad argument: show the message and stop. On success the script prints one line per source and a final `data: <path>` line pointing at the JSON it wrote. A missing analyzer is reported as unavailable, not as a failure.

## Tour

Spawn `onboard:onboard-agent` with the data file path and the target path. The agent asks the developer what they want next, so it needs AskUserQuestion. If the Task tool is missing, or the harness does not let subagents ask the user, do the same work in this session by following the plugin's `agents/onboard-agent.md`.

## Done

The developer has the orientation summary, grounded in at least one source file, and has been asked what they want to explore next.

---
name: onboard
description: Use when someone is new to a codebase and wants to know what it does, how it is laid out, where execution starts, or how to build and test it.
argument-hint: "[path] [--depth=quick|normal|deep]"
---

# onboard

Orient a developer in an unfamiliar codebase with a short, code-grounded tour, then answer their follow-up questions.

The work runs in two parts. `scripts/collect.js` in this plugin gathers project data with no model involved: manifest, directory tree, README, CLAUDE.md or AGENTS.md, CI, git info, repo-intel (orientation, hotspots, conventions, project info, entry points, slop) and, at `deep` depth, repo-map symbols. It writes one JSON file and prints its path. The `onboard-agent` reads that file, reads the key source files, writes the summary and asks the developer where to go next.

Run `node <plugin root>/scripts/collect.js $ARGUMENTS` (an optional path and `--depth=quick|normal|deep`, default `normal`), then hand the printed data file to the agent. When subagents are not available, follow `agents/onboard-agent.md` in this session.

## Data sources

`agent-analyzer` supplies repo-intel. It downloads to `~/.agent-sh/bin/` on first use (about 10 MB) and `lib/agentsys.js` finds the agentsys install that manages it. At `normal` and `deep` depth the collector builds `repo-intel.json` in the state directory when it is missing. Without the analyzer the tour still works from the manifest, tree, README and code, with no entry-point, hotspot or slop data.

## Done

The developer has a summary covering what the project does, stack, entry points, layout, activity, health and getting-started commands (as far as the data allows), grounded in at least one source file, and has been asked what to explore next.

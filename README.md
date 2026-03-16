# onboard

Codebase onboarding for AI agents - automated data collection and interactive project orientation.

Part of the [agentsys](https://github.com/agent-sh/agentsys) ecosystem.

Drop into any unfamiliar codebase and get oriented in under 3 minutes. The collector gathers project metadata automatically (no LLM calls), then an Opus agent synthesizes it into a guided tour and answers follow-up questions interactively.

## Why this plugin

- Use this when joining a new project and need to understand tech stack, structure, and active development areas
- Use this when context-switching between repos and need a quick refresher
- Use this when reviewing a PR in an unfamiliar part of the codebase
- Use this before planning implementation to understand existing patterns and entry points

## Installation

```bash
agentsys install onboard
```

## Quick start

```
/onboard
```

Three phases run in sequence:

1. **Collect** (automatic, no LLM) - scans manifest, directory structure, README, CI config, git info, repo-intel data
2. **Synthesize** (Opus agent) - produces a 2-3 minute summary covering tech stack, key files, architecture, active areas
3. **Guide** (interactive) - answers follow-up questions, reads specific files, explains patterns

## Data collection

Pure JavaScript collector gathers everything an agent needs to orient:

| Data Source | What it captures |
|-------------|------------------|
| Manifest | package.json, Cargo.toml, go.mod, pyproject.toml, deno.json, CMakeLists.txt, meson.build, setup.py, pom.xml, build.gradle |
| Structure | 3-level directory tree (excluding build artifacts) |
| README | First 5KB of README content |
| CLAUDE.md / AGENTS.md | Project rules and conventions |
| CI/CD | GitHub Actions workflows, Dockerfile presence |
| Git | Branch, commit count, remote URL |
| Repo-intel | Hotspots, ownership, areas, health (if [agent-analyzer](https://github.com/agent-sh/agent-analyzer) available) |
| Repo-map | AST symbols and imports (if available) |

No LLM tokens are spent on collection. The agent receives pre-structured data and focuses on synthesis and guidance.

## Depth levels

| Level | Time | What's included |
|-------|------|-----------------|
| `quick` | ~2s | Manifest + README + structure + git |
| `normal` | ~5s | + CLAUDE.md/AGENTS.md + CI + repo-intel (default) |
| `deep` | ~15s | + repo-map AST symbols |

```
/onboard --depth=deep
/onboard /path/to/repo
```

## What the agent produces

The Opus agent synthesizes collected data into:

- **Tech stack** - languages, frameworks, dependencies with versions
- **Project structure** - what each directory does, where the main code lives
- **Entry points** - where to start reading, main modules, CLI entry
- **Active areas** - from hotspot data, where development is concentrated
- **Testing patterns** - test framework, test file conventions, coverage signals
- **Conventions** - commit style, naming patterns, project-specific rules

After the summary, the agent stays in conversation to answer follow-up questions, read specific files, and guide you to the right place for what you want to do.

## Validated on 100 repos

Tested across 100 open-source repositories spanning 8 ecosystems:

| Language | Repos | Token savings vs manual |
|----------|-------|------------------------|
| C/C++ | 6 | 86% |
| Go | 18 | 79% |
| Python | 17 | 74% |
| Rust | 16 | 73% |
| TypeScript | 31 | 71% |
| JavaScript | 11 | 55% |
| Java | 1 | - |
| Deno | 1 | - |

**74% average token savings** - the collector pre-structures project data in 68ms (median), so the agent spends tokens on synthesis and guidance instead of file discovery. Repos tested include nanoid, zod, express, hono, ripgrep, rich, django, flask, fastapi, gin, cobra, axum, serde, react, next.js, and 85 others.

## Supported manifests

package.json, Cargo.toml, go.mod, pyproject.toml, setup.py, deno.json, CMakeLists.txt, meson.build, configure.ac, Makefile, pom.xml, build.gradle. Detects monorepos (npm workspaces, pnpm, lerna, Cargo workspaces, Python libs/, Deno workspaces).

## Requirements

- Git repository (recommended but not required)
- [agent-analyzer](https://github.com/agent-sh/agent-analyzer) for repo-intel data (optional - prompts to generate if missing)

## Related plugins

- [can-i-help](https://github.com/agent-sh/can-i-help) - find where to contribute (built on top of onboard data)
- [git-map](https://github.com/agent-sh/git-map) - git history analysis (data source for hotspots and ownership)
- [repo-map](https://github.com/agent-sh/repo-map) - AST symbol map (deeper code understanding)

## License

MIT

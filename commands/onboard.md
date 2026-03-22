---
description: Onboard to any codebase - generates a structured overview then guides you interactively through the project
codex-description: 'Use when user asks to "onboard to project", "what does this project do", "summarize codebase", "get oriented", "new to this repo", "quick overview". Generates structured project summary then guides interactively.'
argument-hint: "[path] [--depth=quick|normal|deep]"
allowed-tools: Bash(git:*), Read, Glob, Grep, Task, AskUserQuestion
---

# /onboard - Codebase Onboarding

Onboard to any codebase. Collects project data automatically (no LLM), then an agent synthesizes it and guides you interactively.

## Arguments

Parse from `$ARGUMENTS`:

- **Path**: Directory to analyze (default: current directory)
- `--depth`: Analysis depth
  - `quick`: Manifest + README + directory tree only (~2s)
  - `normal` (default): + CLAUDE.md, CI, repo-intel (~5s)
  - `deep`: + repo-map AST symbols (~15s)

## Phase 1: Automated Data Collection (Pure JS)

```javascript
const { getPluginRoot } = require('@agentsys/lib/cross-platform');
const pluginRoot = getPluginRoot('onboard');
const collector = require(`${pluginRoot}/lib/collector`);

const args = '$ARGUMENTS'.split(' ').filter(Boolean);
const depth = args.find(a => a.startsWith('--depth='))?.split('=')[1] || 'normal';
const targetPath = args.find(a => !a.startsWith('--')) || process.cwd();

console.log(`[INFO] Collecting project data (depth: ${depth})...`);
const data = collector.collect(targetPath, { depth });

console.log(`[OK] Data collected:`);
console.log(`  Manifest: ${data.manifest?.type || 'none'} (${data.manifest?.language || '?'})`);
console.log(`  Structure: ${data.structure?.length || 0} directories`);
console.log(`  README: ${data.readme ? 'found' : 'missing'}`);
console.log(`  Repo-intel: ${data.repoIntel ? 'available' : 'unavailable'}`);
console.log(`  Repo-map: ${data.repoMap ? data.repoMap.totalFiles + ' files, ' + data.repoMap.totalSymbols + ' symbols' : 'unavailable'}`);
```

## Phase 2: Agent Synthesis + Interactive Guidance

```javascript
await Task({
  subagent_type: "onboard:onboard-agent",
  prompt: `Onboard the user to this codebase.

## Collected Data (already gathered, do NOT re-scan files)

${JSON.stringify(data, null, 2)}

## Your Job

1. **Synthesize** the collected data into a clear, concise summary (2-3 min read)
2. **Read key files** that the data points to - entry points, main modules, interesting patterns
3. **Present the summary** to the user
4. **Ask what they want to do** - fix a bug? add a feature? understand a specific area?
5. **Guide them** to the right files using coupling, ownership, and symbol data

Use the repo-intel onboard data to enrich the summary:
- Health and bus factor
- Key areas with purpose annotations
- Pain points (high bug-fix rate areas)
- Hotspots (where active development is)
- Getting started commands

Use conventions data (if available) to describe coding style:
- Function naming convention (snake_case, camelCase, PascalCase)
- Test framework and test location pattern
- Commit message convention (conventional, freeform)

Use project metadata (if available) for quick facts:
- Primary language and language breakdown
- CI provider and workflow count
- License type
- Package manager

Use repo-map data (if available) to trace code:
- "This function is exported from X and imported by Y and Z"
- "The main entry point calls these modules in this order"

Do NOT just dump the JSON. Synthesize it into human-readable insights.
After the summary, ask the user what they want to explore.`
});
```

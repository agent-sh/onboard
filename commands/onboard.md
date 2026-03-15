---
description: Generate a quick codebase summary for onboarding - project purpose, tech stack, architecture, entry points, build/test steps
codex-description: 'Use when user asks to "onboard to project", "what does this project do", "summarize codebase", "get oriented", "new to this repo", "quick overview". Generates a structured project summary for developers new to a codebase.'
argument-hint: "[path] [--depth=quick|normal|deep] [--output=display|file]"
allowed-tools: Bash(git:*), Read, Glob, Grep, Task, Write
---

# /onboard - Quick Codebase Summary

Generate a structured overview of any codebase to help developers get oriented quickly.

## Arguments

Parse from `$ARGUMENTS`:

- **Path**: Directory to analyze (default: current directory)
- `--depth`: Analysis depth
  - `quick`: Package.json/Cargo.toml + README + directory structure only
  - `normal` (default): + key source files, entry points, patterns
  - `deep`: + dependency analysis, architecture diagram, convention detection
- `--output`: Where to put the summary
  - `display` (default): Output to conversation
  - `file`: Write to `.onboard.md` in the repo root

## Execution

### Step 1: Pre-fetch Repo-Intel (Optional)

```javascript
const fs = require('fs');
const path = require('path');
const cwd = process.cwd();
const stateDir = ['.claude', '.opencode', '.codex']
  .find(d => fs.existsSync(path.join(cwd, d))) || '.claude';
const mapFile = path.join(cwd, stateDir, 'repo-intel.json');

let repoIntelContext = '';
if (fs.existsSync(mapFile)) {
  try {
    const { binary } = require('@agentsys/lib');
    const health = JSON.parse(binary.runAnalyzer(['repo-intel', 'query', 'health', '--map-file', mapFile, cwd]));
    const hotspots = JSON.parse(binary.runAnalyzer(['repo-intel', 'query', 'hotspots', '--top', '10', '--map-file', mapFile, cwd]));
    const contributors = JSON.parse(binary.runAnalyzer(['repo-intel', 'query', 'contributors', '--top', '5', '--map-file', mapFile, cwd]));
    const norms = JSON.parse(binary.runAnalyzer(['repo-intel', 'query', 'norms', '--map-file', mapFile, cwd]));
    const areas = JSON.parse(binary.runAnalyzer(['repo-intel', 'query', 'areas', '--map-file', mapFile, cwd]));

    repoIntelContext = '\n\nRepo-intel data (use to enrich the summary):';
    repoIntelContext += '\nHealth: ' + JSON.stringify(health);
    repoIntelContext += '\nTop hotspots: ' + hotspots.map(h => h.path).join(', ');
    repoIntelContext += '\nContributors: ' + contributors.map(c => `${c.name} (${c.commits} commits)`).join(', ');
    repoIntelContext += '\nConventions: ' + JSON.stringify(norms.commits);
    repoIntelContext += '\nAreas: ' + areas.filter(a => a.health !== 'healthy').map(a => `${a.area} (${a.health})`).join(', ');
  } catch (e) { /* unavailable */ }
}
```

### Step 2: Spawn Onboard Agent

```javascript
await Task({
  subagent_type: "onboard:onboard-agent",
  prompt: `Generate a codebase onboarding summary.
Path: ${targetPath}
Depth: ${depth}
${repoIntelContext}

Analyze the project and produce a structured summary.`
});
```

### Step 3: Output

If `--output=file`, write the summary to `.onboard.md` in the repo root.
Otherwise, display directly in the conversation.

## Output Format

```markdown
# Project: {name}

## What This Project Does
{1-2 sentence purpose statement}

## Tech Stack
- **Language**: {language} {version}
- **Framework**: {framework}
- **Build**: {build tool}
- **Tests**: {test framework}

## Project Structure
{directory tree with annotations}

## Key Entry Points
- **Main**: {entry file} - {what it does}
- **Config**: {config files}
- **Tests**: {test location and how to run}

## Getting Started
```bash
{install command}
{build command}
{test command}
{run command}
```

## Architecture Overview
{2-3 paragraphs on how the code is organized}

## Active Development Areas
{hotspots and recent activity from repo-intel if available}

## Conventions
- {commit style}
- {code patterns observed}
```

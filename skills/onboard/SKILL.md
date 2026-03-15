---
name: onboard
description: "Use when user asks to \"onboard to project\", \"what does this project do\", \"summarize codebase\", \"get oriented\", \"new to this repo\", \"quick overview\", \"project summary\", \"codebase tour\". Generates a structured onboarding summary."
argument-hint: "[path] [--depth=quick|normal|deep]"
---

# Onboard Skill

Generate a structured codebase onboarding summary.

## Parse Arguments

```javascript
const args = '$ARGUMENTS'.split(' ').filter(Boolean);
const depth = args.find(a => a.startsWith('--depth='))?.split('=')[1] || 'normal';
const targetPath = args.find(a => !a.startsWith('--')) || '.';
```

## Depth Levels

| Level | What's analyzed | Time |
|-------|----------------|------|
| `quick` | Manifest + README + directory tree | ~5s |
| `normal` | + entry points, key source files, conventions | ~15s |
| `deep` | + dependency graph, architecture analysis, repo-intel | ~30s |

## Pre-check: Ensure Repo-Intel

For `normal` and `deep` depth, check if repo-intel data is available:

```javascript
const fs = require('fs');
const path = require('path');

const cwd = process.cwd();
const stateDir = ['.claude', '.opencode', '.codex']
  .find(d => fs.existsSync(path.join(cwd, d))) || '.claude';
const mapFile = path.join(cwd, stateDir, 'repo-intel.json');

if (!fs.existsSync(mapFile) && depth !== 'quick') {
  const response = await AskUserQuestion({
    questions: [{
      question: 'Generate repo-intel?',
      description: 'No repo-intel map found. Generating one enriches the onboarding summary with activity data, contributors, and code health. Takes ~5 seconds.',
      options: [
        { label: 'Yes, generate it', value: 'yes' },
        { label: 'Skip', value: 'no' }
      ]
    }]
  });

  if (response === 'yes' || response?.['Generate repo-intel?'] === 'yes') {
    try {
      const { binary } = require('@agentsys/lib');
      const output = binary.runAnalyzer(['repo-intel', 'init', cwd]);
      const stateDirPath = path.join(cwd, stateDir);
      if (!fs.existsSync(stateDirPath)) fs.mkdirSync(stateDirPath, { recursive: true });
      fs.writeFileSync(mapFile, output);
    } catch (e) {
      // Binary not available
    }
  }
}
```

## Analysis Steps

### 1. Project Identity

Detect from manifest files:
- Name, version, description
- Language and framework
- Build tool and test framework
- Entry points

### 2. Directory Structure

Generate annotated directory tree (depth 3, exclude noise directories).

### 3. Key Files

Read and summarize:
- README.md (purpose, setup)
- Main entry point (architecture)
- Config files (build, CI, deploy)
- Test setup (framework, patterns)

### 4. Repo-Intel Enrichment

If repo-intel data is available, add:
- **Hotspots**: Most actively changed files (where development focus is)
- **Contributors**: Who maintains what
- **Health**: Bus factor, AI contribution ratio
- **Conventions**: Commit style, scope usage
- **Areas**: Directory health overview

### 5. Getting Started

Extract or infer:
- Install command
- Build command
- Test command
- Run command

## Output Format

Structured markdown summary readable in 2-3 minutes. See command file for full format spec.

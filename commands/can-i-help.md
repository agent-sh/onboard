---
description: Find where to contribute to a project - matches your skills to areas that need help, good-first tasks, test gaps, and stale docs
codex-description: 'Use when user asks to "contribute", "where can I help", "good first issue", "what needs work", "how to contribute", "where to start contributing". Analyzes project needs and suggests contribution areas.'
argument-hint: "[path] [--depth=normal|deep]"
allowed-tools: Bash(git:*), Bash(gh:*), Read, Glob, Grep, Task, AskUserQuestion
---

# /can-i-help - Contributor Guidance

Find where you can contribute to a project. Builds on onboard data, adds contributor-specific analysis: good-first areas, areas needing help, test gaps, stale docs, and open issues.

## Arguments

Parse from `$ARGUMENTS`:

- **Path**: Directory to analyze (default: current directory)
- `--depth`: `normal` (default) or `deep` (includes repo-map symbols)

## Phase 1: Collect Onboard Data + Contributor Signals

```javascript
const { getPluginRoot } = require('@agentsys/lib/cross-platform');
const pluginRoot = getPluginRoot('onboard');
const collector = require(`${pluginRoot}/lib/collector`);

const args = '$ARGUMENTS'.split(' ').filter(Boolean);
const depth = args.find(a => a.startsWith('--depth='))?.split('=')[1] || 'normal';
const targetPath = args.find(a => !a.startsWith('--')) || process.cwd();

// Collect base onboard data
const data = collector.collect(targetPath, { depth });

// Add contributor-specific queries
let contributorData = null;
try {
  const { binary } = require('@agentsys/lib');
  const fs = require('fs');
  const path = require('path');
  const stateDir = ['.claude', '.opencode', '.codex']
    .find(d => fs.existsSync(path.join(targetPath, d))) || '.claude';
  const mapFile = path.join(targetPath, stateDir, 'repo-intel.json');

  if (fs.existsSync(mapFile)) {
    const canHelp = JSON.parse(binary.runAnalyzer(['repo-intel', 'query', 'can-i-help', '--map-file', mapFile, targetPath]));
    const testGaps = JSON.parse(binary.runAnalyzer(['repo-intel', 'query', 'test-gaps', '--top', '15', '--map-file', mapFile, targetPath]));
    const docDrift = JSON.parse(binary.runAnalyzer(['repo-intel', 'query', 'doc-drift', '--top', '10', '--map-file', mapFile, targetPath]));
    const bugspots = JSON.parse(binary.runAnalyzer(['repo-intel', 'query', 'bugspots', '--top', '10', '--map-file', mapFile, targetPath]));

    contributorData = { canHelp, testGaps, docDrift, bugspots };
  }
} catch (e) { /* unavailable */ }

// Try to get open issues from GitHub
let openIssues = null;
try {
  const cp = require('child_process');
  const issuesJson = cp.execFileSync('gh', [
    'issue', 'list', '-R', data.gitInfo?.remoteUrl?.replace(/\.git$/, '') || '.',
    '--state', 'open', '--limit', '15', '--json', 'number,title,labels,createdAt'
  ], { encoding: 'utf8', timeout: 10000, stdio: ['pipe', 'pipe', 'pipe'] });
  openIssues = JSON.parse(issuesJson);
} catch (e) { /* gh not available or not a GitHub repo */ }

console.log(`[OK] Data collected for contributor analysis`);
```

## Phase 2: Agent Analysis

```javascript
await Task({
  subagent_type: "onboard:can-i-help-agent",
  prompt: `Help this developer find where to contribute.

## Project Context (from /onboard collector)

${JSON.stringify(data, null, 2)}

## Contributor-Specific Data

${contributorData ? JSON.stringify(contributorData, null, 2) : 'Repo-intel unavailable - use file-based analysis only.'}

## Open Issues

${openIssues ? JSON.stringify(openIssues, null, 2) : 'GitHub issues unavailable.'}

## Your Job

1. Ask the developer about their experience and what they're interested in
2. Cross-reference their answer with the project data
3. Recommend specific contribution areas with rationale
4. For each recommendation, point to exact files and explain what needs doing`
});
```

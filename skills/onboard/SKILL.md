---
name: onboard
description: "Use when user asks to \"onboard to project\", \"what does this project do\", \"summarize codebase\", \"get oriented\", \"new to this repo\", \"quick overview\", \"project summary\", \"codebase tour\", \"help me understand this code\". Collects project data automatically then guides interactively."
argument-hint: "[path] [--depth=quick|normal|deep]"
---

# Onboard Skill

Automated data collection + LLM synthesis + interactive guidance.

## Architecture

```
/onboard
  │
  ├─ Phase 1: collector.js (pure JS, zero LLM)
  │   ├─ scanManifest()    → package.json/Cargo.toml/go.mod
  │   ├─ scanStructure()   → directory tree with file counts
  │   ├─ readFileIfExists()→ README.md, CLAUDE.md
  │   ├─ scanCI()          → .github/workflows, Dockerfile
  │   ├─ getGitInfo()      → branch, commit count, remote
  │   ├─ getRepoIntel()    → onboard query, hotspots
  │   └─ getRepoMap()      → symbols, imports, exports (if available)
  │
  ├─ Phase 2: onboard-agent (Sonnet)
  │   ├─ Synthesize collected data into readable summary
  │   ├─ Read key source files for architecture understanding
  │   └─ Present summary to user
  │
  └─ Phase 3: Interactive (conversational)
      ├─ "What do you want to do?"
      ├─ Guide to files using coupling + ownership + symbols
      └─ Answer follow-up questions with full context
```

## Depth Levels

| Level | What's collected | Time |
|-------|-----------------|------|
| `quick` | Manifest + README + structure + git info | ~2s |
| `normal` | + CLAUDE.md + CI + repo-intel (auto-generates if missing) | ~5s |
| `deep` | + repo-map AST symbols | ~15s |

## Data Flow

The collector produces a single JSON object:

```json
{
  "manifest": { "type": "npm", "name": "...", "language": "typescript", "scripts": [...], "dependencies": {...} },
  "readme": "# Project\n...",
  "claudeMd": "# Rules\n...",
  "structure": [{ "path": "src/", "depth": 1, "files": 23, "dirs": 5 }, ...],
  "ci": { "github": true, "workflows": ["ci.yml", "release.yml"], "dockerfile": false },
  "gitInfo": { "branch": "main", "commitCount": 232, "lastCommit": "2026-03-15", "remoteUrl": "..." },
  "repoIntel": {
    "onboard": { "language": "typescript", "structure": "single package", "health": "active", ... },
    "hotspots": [...]
  },
  "repoMap": { "totalFiles": 45, "totalSymbols": 312, "keyExports": { "src/index.ts": ["Queue", "Worker", ...] } }
}
```

This is passed as the agent's prompt context. The agent reads key files to fill gaps, then presents a synthesized summary. No data collection happens in the LLM - only synthesis and guidance.

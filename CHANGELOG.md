# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.1] - 2026-04-26

### Changed

- lib/collector.js execGit takes explicit argv arrays instead of args.split(' ') on hard-coded strings. Safer footgun elimination.
- Switch onboard-agent from Opus to Sonnet - 73% cost reduction with equivalent output quality

### Added

- Collector now returns conventions and projectInfo from Phase 2-4 repo-intel data
- Agent prompt enriched with coding conventions (naming, test framework, commit style) and project metadata (language breakdown, CI provider, license)
- `getRepoMap()` falls back to repo-intel.json symbols when repo-map.json is unavailable
- Cap keyExports to top 20 files (15 exports each) and README sections to 10 to prevent prompt bloat

### Fixed

- State dir detection now uses `getStateDirPath()` from agent-core instead of inline detection

## [0.1.0] - 2026-03-16

### Added

- `onboard-agent` (Opus) - synthesizes collected data into a guided codebase tour
- `onboard` skill with three depth levels: `quick` (~2s), `normal` (~5s), `deep` (~15s)
- `/onboard` command with `[path]` and `--depth` arguments
- Pure-JS collector (`lib/collector.js`) with zero LLM calls:
  - `scanManifest()` - detects package.json, Cargo.toml, go.mod, pyproject.toml, deno.json, CMakeLists.txt, meson.build, setup.py, pom.xml, build.gradle
  - `scanStructure()` - 3-level directory tree excluding build artifacts
  - `readFileIfExists()` - captures README.md and CLAUDE.md/AGENTS.md
  - `scanCI()` - detects GitHub Actions workflows and Dockerfile
  - `getGitInfo()` - branch, commit count, remote URL
  - `getRepoIntel()` - hotspots and ownership (when agent-analyzer available)
  - `getRepoMap()` - AST symbols and imports (when repo-map available)
- Monorepo detection for npm workspaces, pnpm, lerna, Cargo workspaces, Python libs/, Deno workspaces
- Manifest detection for C/C++ (CMake, Meson, Autotools), Python (setup.py, pyproject.toml), Java (Maven, Gradle)
- Dynamic Python version extraction and Cargo workspace dependency resolution
- 100-repo validation across 8 ecosystems (C/C++, Go, Python, Rust, TypeScript, JavaScript, Java, Deno)
- 74% average token savings vs manual file discovery; collector runs in 68ms median
- Interactive Phase 3 guidance: explore areas, trace features, locate change points, find contribution opportunities
- AGENTS.md support alongside CLAUDE.md for project conventions

### Refactored

- Removed `/can-i-help` command - moved to standalone [can-i-help](https://github.com/agent-sh/can-i-help) plugin

### Fixed

- Collector tuning from 8-repo validation round
- Flat exports, Cargo workspace-only roots, Poetry dependency parsing
- Dynamic Python version detection and Cargo workspace deps
- Address agnix linter warnings (redundant instruction, missing script)
- Stale can-i-help references removed from SKILL.md; JSON validated before write

'use strict';

/**
 * Onboard data collector
 *
 * Gathers all project context via pure JS (no LLM calls).
 * Produces a single data object that the onboard agent synthesizes.
 *
 * @module lib/collector
 */

const fs = require('fs');
const path = require('path');
const cp = require('child_process');

/**
 * Collect all onboarding data for a repository.
 *
 * @param {string} cwd - Repository root path
 * @param {Object} [options]
 * @param {string} [options.depth='normal'] - quick|normal|deep
 * @returns {Object} Collected data
 */
function collect(cwd, options = {}) {
  const depth = options.depth || 'normal';

  const data = {
    timestamp: new Date().toISOString(),
    cwd,
    depth,
    manifest: null,
    readme: null,
    claudeMd: null,
    structure: null,
    ci: null,
    repoIntel: null,
    repoMap: null,
    gitInfo: null
  };

  // Always run these (even in quick mode)
  data.manifest = scanManifest(cwd);
  data.readme = readFileIfExists(cwd, 'README.md');
  data.structure = scanStructure(cwd);
  data.gitInfo = getGitInfo(cwd);

  if (depth === 'quick') return data;

  // Normal: add CLAUDE.md, CI, repo-intel
  data.claudeMd = readFileIfExists(cwd, 'CLAUDE.md') || readFileIfExists(cwd, 'AGENTS.md');
  data.ci = scanCI(cwd);
  data.repoIntel = getRepoIntel(cwd);

  if (depth === 'normal') return data;

  // Deep: add repo-map
  data.repoMap = getRepoMap(cwd);

  return data;
}

// ─── Manifest scanning ──────────────────────────────────────────────────────

function scanManifest(cwd) {
  // Try each manifest type
  const result = {
    type: null,
    name: null,
    version: null,
    description: null,
    language: null,
    scripts: null,
    dependencies: null,
    entryPoint: null
  };

  // package.json
  const pkgPath = path.join(cwd, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      result.type = 'npm';
      result.name = pkg.name;
      result.version = pkg.version;
      result.description = pkg.description;
      result.language = pkg.devDependencies?.typescript ? 'typescript' : 'javascript';
      result.scripts = pkg.scripts ? Object.keys(pkg.scripts) : [];
      result.entryPoint = pkg.main || pkg.bin;
      result.dependencies = {
        prod: Object.keys(pkg.dependencies || {}),
        dev: Object.keys(pkg.devDependencies || {})
      };
      return result;
    } catch { /* parse error */ }
  }

  // Cargo.toml
  const cargoPath = path.join(cwd, 'Cargo.toml');
  if (fs.existsSync(cargoPath)) {
    try {
      const cargo = fs.readFileSync(cargoPath, 'utf8');
      result.type = 'cargo';
      result.language = 'rust';
      const nameMatch = cargo.match(/^name\s*=\s*"(.+?)"/m);
      if (nameMatch) result.name = nameMatch[1];
      const versionMatch = cargo.match(/^version\s*=\s*"(.+?)"/m);
      if (versionMatch) result.version = versionMatch[1];
      const descMatch = cargo.match(/^description\s*=\s*"(.+?)"/m);
      if (descMatch) result.description = descMatch[1];
      // Check for workspace
      if (cargo.includes('[workspace]')) {
        result.type = 'cargo-workspace';
      }
      return result;
    } catch { /* parse error */ }
  }

  // go.mod
  const goModPath = path.join(cwd, 'go.mod');
  if (fs.existsSync(goModPath)) {
    try {
      const goMod = fs.readFileSync(goModPath, 'utf8');
      result.type = 'go';
      result.language = 'go';
      const modMatch = goMod.match(/^module\s+(.+)/m);
      if (modMatch) result.name = modMatch[1].trim();
      return result;
    } catch { /* parse error */ }
  }

  // pyproject.toml
  const pyprojectPath = path.join(cwd, 'pyproject.toml');
  if (fs.existsSync(pyprojectPath)) {
    try {
      const pyproject = fs.readFileSync(pyprojectPath, 'utf8');
      result.type = 'python';
      result.language = 'python';
      const nameMatch = pyproject.match(/^name\s*=\s*"(.+?)"/m);
      if (nameMatch) result.name = nameMatch[1];
      return result;
    } catch { /* parse error */ }
  }

  // pom.xml
  if (fs.existsSync(path.join(cwd, 'pom.xml'))) {
    result.type = 'maven';
    result.language = 'java';
    return result;
  }

  // build.gradle
  if (fs.existsSync(path.join(cwd, 'build.gradle')) || fs.existsSync(path.join(cwd, 'build.gradle.kts'))) {
    result.type = 'gradle';
    result.language = 'java';
    return result;
  }

  return result;
}

// ─── Directory structure ────────────────────────────────────────────────────

const EXCLUDE_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'target', 'out',
  '.next', '.nuxt', '__pycache__', '.pytest_cache', 'coverage',
  '.cache', 'vendor', '.idea', '.vscode'
]);

function scanStructure(cwd, maxDepth = 3) {
  const tree = [];
  walkDir(cwd, '', 0, maxDepth, tree);
  return tree;
}

function walkDir(basePath, relPath, depth, maxDepth, result) {
  if (depth > maxDepth) return;

  const fullPath = relPath ? path.join(basePath, relPath) : basePath;
  let entries;
  try {
    entries = fs.readdirSync(fullPath, { withFileTypes: true });
  } catch {
    return;
  }

  const dirs = [];
  let fileCount = 0;

  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (!EXCLUDE_DIRS.has(entry.name) && !entry.name.startsWith('.')) {
        dirs.push(entry.name);
      }
    } else {
      fileCount++;
    }
  }

  if (relPath) {
    result.push({
      path: relPath + '/',
      depth,
      files: fileCount,
      dirs: dirs.length
    });
  }

  for (const dir of dirs.sort()) {
    walkDir(basePath, relPath ? relPath + '/' + dir : dir, depth + 1, maxDepth, result);
  }
}

// ─── CI/CD detection ────────────────────────────────────────────────────────

function scanCI(cwd) {
  const ci = {
    github: false,
    dockerfile: false,
    workflows: []
  };

  const workflowDir = path.join(cwd, '.github', 'workflows');
  if (fs.existsSync(workflowDir)) {
    ci.github = true;
    try {
      ci.workflows = fs.readdirSync(workflowDir)
        .filter(f => f.endsWith('.yml') || f.endsWith('.yaml'));
    } catch { /* permission error */ }
  }

  ci.dockerfile = fs.existsSync(path.join(cwd, 'Dockerfile'));

  return ci;
}

// ─── Git info ───────────────────────────────────────────────────────────────

function getGitInfo(cwd) {
  try {
    const branch = execGit(cwd, 'rev-parse --abbrev-ref HEAD');
    const commitCount = execGit(cwd, 'rev-list --count HEAD');
    const lastCommit = execGit(cwd, 'log -1 --format=%ci');
    const remoteUrl = execGit(cwd, 'remote get-url origin');

    return {
      branch: branch.trim(),
      commitCount: parseInt(commitCount.trim(), 10) || 0,
      lastCommit: lastCommit.trim(),
      remoteUrl: remoteUrl.trim()
    };
  } catch {
    return null;
  }
}

function execGit(cwd, args) {
  return cp.execFileSync('git', args.split(' '), {
    cwd,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
    timeout: 5000
  });
}

// ─── Repo-intel integration ─────────────────────────────────────────────────

function getRepoIntel(cwd) {
  try {
    let binary;
    try { binary = require('@agentsys/lib').binary; } catch { return null; }

    const stateDir = ['.claude', '.opencode', '.codex']
      .find(d => fs.existsSync(path.join(cwd, d))) || '.claude';
    const mapFile = path.join(cwd, stateDir, 'repo-intel.json');

    // Generate if missing
    if (!fs.existsSync(mapFile)) {
      const stateDirPath = path.join(cwd, stateDir);
      if (!fs.existsSync(stateDirPath)) fs.mkdirSync(stateDirPath, { recursive: true });
      const output = binary.runAnalyzer(['repo-intel', 'init', cwd]);
      fs.writeFileSync(mapFile, output);
    }

    // Run queries
    const onboard = JSON.parse(binary.runAnalyzer(['repo-intel', 'query', 'onboard', '--map-file', mapFile, cwd]));
    const hotspots = JSON.parse(binary.runAnalyzer(['repo-intel', 'query', 'hotspots', '--top', '10', '--map-file', mapFile, cwd]));

    return { onboard, hotspots };
  } catch {
    return null;
  }
}

// ─── Repo-map integration ───────────────────────────────────────────────────

function getRepoMap(cwd) {
  try {
    const repoMapCachePath = path.join(cwd,
      ['.claude', '.opencode', '.codex'].find(d => fs.existsSync(path.join(cwd, d))) || '.claude',
      'repo-map.json'
    );

    if (!fs.existsSync(repoMapCachePath)) return null;

    const map = JSON.parse(fs.readFileSync(repoMapCachePath, 'utf8'));
    if (!map || !map.files) return null;

    // Extract summary: top-level exports, import graph, symbol counts
    const files = Object.keys(map.files);
    const totalSymbols = Object.values(map.files).reduce((sum, f) => {
      return sum + (f.symbols ? f.symbols.length : 0);
    }, 0);

    // Find key exports (entry point files with most exports)
    const exportSummary = {};
    for (const [filePath, fileData] of Object.entries(map.files)) {
      if (fileData.symbols && fileData.symbols.length > 0) {
        const exports = fileData.symbols.filter(s => s.exported);
        if (exports.length > 3) {
          exportSummary[filePath] = exports.map(s => s.name);
        }
      }
    }

    return {
      totalFiles: files.length,
      totalSymbols,
      keyExports: exportSummary
    };
  } catch {
    return null;
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function readFileIfExists(cwd, filename) {
  const filePath = path.join(cwd, filename);
  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf8');
      // Truncate large files to save tokens
      return content.length > 5000 ? content.substring(0, 5000) + '\n\n[... truncated]' : content;
    }
  } catch { /* permission error */ }
  return null;
}

module.exports = {
  collect,
  scanManifest,
  scanStructure,
  scanCI,
  getGitInfo,
  getRepoIntel,
  getRepoMap
};

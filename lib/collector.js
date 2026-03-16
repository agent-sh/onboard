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
  data.ci = scanCI(cwd);

  if (depth === 'quick') return data;

  // Normal: add CLAUDE.md, repo-intel
  data.claudeMd = readFileIfExists(cwd, 'CLAUDE.md') || readFileIfExists(cwd, 'AGENTS.md');
  data.repoIntel = getRepoIntel(cwd);

  if (depth === 'normal') return data;

  // Deep: add repo-map
  data.repoMap = getRepoMap(cwd);

  return data;
}

// ─── Manifest scanning ──────────────────────────────────────────────────────

function scanManifest(cwd) {
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
      result.dependencies = {
        prod: Object.keys(pkg.dependencies || {}),
        dev: Object.keys(pkg.devDependencies || {})
      };

      // Entry point: exports > main > index.js > bin
      if (pkg.exports) {
        const dotExport = pkg.exports['.'];
        if (typeof dotExport === 'string') {
          result.entryPoint = dotExport;
        } else if (dotExport && typeof dotExport === 'object') {
          result.entryPoint = dotExport.import || dotExport.require || dotExport.default || pkg.main;
        } else if (!dotExport && (pkg.exports.import || pkg.exports.require || pkg.exports.default)) {
          // Flat condition map: exports = { default: "./dist/index.js" } without "." wrapper
          result.entryPoint = pkg.exports.import || pkg.exports.require || pkg.exports.default;
        }
      } else if (pkg.main) {
        result.entryPoint = pkg.main;
      } else if (fs.existsSync(path.join(cwd, 'index.js')) || fs.existsSync(path.join(cwd, 'index.ts'))) {
        result.entryPoint = fs.existsSync(path.join(cwd, 'index.ts')) ? 'index.ts' : 'index.js';
      } else if (typeof pkg.bin === 'string') {
        result.entryPoint = pkg.bin;
      }

      // Detect monorepo
      if (pkg.workspaces) {
        result.type = 'npm-monorepo';
      }
      if (fs.existsSync(path.join(cwd, 'pnpm-workspace.yaml'))) {
        result.type = 'pnpm-monorepo';
      }
      if (fs.existsSync(path.join(cwd, 'lerna.json'))) {
        result.type = 'lerna-monorepo';
      }

      // For monorepos with private root, try to find the primary package
      if (pkg.private && !result.name && result.type?.includes('monorepo')) {
        const primaryPkg = findPrimaryPackage(cwd);
        if (primaryPkg) {
          result.name = primaryPkg.name;
          result.version = primaryPkg.version;
          result.description = primaryPkg.description;
        }
      }

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

      // Handle both single-line and multi-line TOML strings
      const descSingle = cargo.match(/^description\s*=\s*"([^"]+)"/m);
      const descMulti = cargo.match(/^description\s*=\s*"""([\s\S]*?)"""/m);
      if (descMulti) {
        result.description = descMulti[1].trim();
      } else if (descSingle) {
        result.description = descSingle[1];
      }

      // Check for workspace
      if (cargo.includes('[workspace]')) {
        result.type = 'cargo-workspace';
        // Workspace-only root (no [package]) - find primary crate
        if (!result.name) {
          const primaryCrate = findPrimaryCrate(cwd, cargo);
          if (primaryCrate) {
            result.name = primaryCrate.name;
            result.version = primaryCrate.version;
            result.description = primaryCrate.description;
          }
        }
      }

      // Parse dependencies (root or primary crate)
      let deps = parseTomlSection(cargo, '[dependencies]');
      let devDeps = parseTomlSection(cargo, '[dev-dependencies]');

      // For workspace roots with no deps, try primary crate
      if (deps.length === 0 && result.type === 'cargo-workspace' && result.name) {
        for (const sub of [result.name, 'crates/' + result.name]) {
          const subCargo = path.join(cwd, sub, 'Cargo.toml');
          try {
            if (fs.existsSync(subCargo)) {
              const subContent = fs.readFileSync(subCargo, 'utf8');
              deps = parseTomlSection(subContent, '[dependencies]');
              devDeps = parseTomlSection(subContent, '[dev-dependencies]');
              break;
            }
          } catch { /* ignore */ }
        }
      }

      if (deps.length > 0 || devDeps.length > 0) {
        result.dependencies = { prod: deps, dev: devDeps };
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

      // Extract Go version
      const goVerMatch = goMod.match(/^go\s+(\S+)/m);
      if (goVerMatch) result.version = 'go' + goVerMatch[1];

      // Parse require block
      const reqMatch = goMod.match(/require\s*\(([\s\S]*?)\)/);
      if (reqMatch) {
        const deps = reqMatch[1].split('\n')
          .map(l => l.trim())
          .filter(l => l && !l.startsWith('//'))
          .map(l => l.split(/\s+/)[0]);
        result.dependencies = { prod: deps, dev: [] };
      }

      // Check for Makefile targets
      const makefilePath = path.join(cwd, 'Makefile');
      if (fs.existsSync(makefilePath)) {
        try {
          const makefile = fs.readFileSync(makefilePath, 'utf8');
          const targets = makefile.match(/^([a-zA-Z_][\w-]*):/gm);
          if (targets) {
            result.scripts = targets.map(t => t.replace(':', ''));
          }
        } catch { /* ignore */ }
      }

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
      const versionMatch = pyproject.match(/^version\s*=\s*"(.+?)"/m);
      if (versionMatch) result.version = versionMatch[1];
      const descMatch = pyproject.match(/^description\s*=\s*"(.+?)"/m);
      if (descMatch) result.description = descMatch[1];

      // Dynamic version: check __init__.py when version = dynamic
      if (!result.version && pyproject.includes('"version"') && pyproject.match(/dynamic\s*=.*"version"/)) {
        const pkgName = result.name || path.basename(cwd);
        for (const candidate of [pkgName, pkgName.replace(/-/g, '_'), 'src/' + pkgName]) {
          const initPath = path.join(cwd, candidate, '__init__.py');
          try {
            if (fs.existsSync(initPath)) {
              const init = fs.readFileSync(initPath, 'utf8');
              const verMatch = init.match(/__version__\s*=\s*["'](.+?)["']/);
              if (verMatch) { result.version = verMatch[1]; break; }
            }
          } catch { /* ignore */ }
        }
      }

      // Parse dependencies (PEP 621 or Poetry format)
      const depsMatch = pyproject.match(/^dependencies\s*=\s*\[([\s\S]*?)\]/m);
      if (depsMatch) {
        const deps = depsMatch[1].match(/"([^"]+)"/g);
        if (deps) {
          result.dependencies = { prod: deps.map(d => d.replace(/"/g, '').split(/[<>=!~]/)[0].trim()), dev: [] };
        }
      }
      // Poetry format: [tool.poetry.dependencies]
      if (!result.dependencies) {
        const poetryDeps = parseTomlSection(pyproject, '[tool.poetry.dependencies]');
        const filtered = poetryDeps.filter(d => d !== 'python');
        if (filtered.length > 0) {
          result.dependencies = { prod: filtered, dev: [] };
        }
      }

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

/**
 * Find the primary crate in a Cargo workspace.
 * Looks for a crate matching the repo directory name or the first non-internal crate.
 */
function findPrimaryCrate(cwd, rootCargo) {
  // Extract workspace members
  const membersMatch = rootCargo.match(/members\s*=\s*\[([\s\S]*?)\]/);
  if (!membersMatch) return null;

  const members = membersMatch[1].match(/"([^"]+)"/g);
  if (!members) return null;

  const repoName = path.basename(cwd).toLowerCase();
  const crates = [];

  for (const raw of members) {
    const member = raw.replace(/"/g, '');
    // Expand globs like "crates/*"
    if (member.includes('*')) {
      const base = member.replace('/*', '');
      const dirPath = path.join(cwd, base);
      try {
        const entries = fs.readdirSync(dirPath);
        for (const entry of entries) {
          const cargoPath = path.join(dirPath, entry, 'Cargo.toml');
          if (fs.existsSync(cargoPath)) {
            const parsed = parseCargoBasic(cargoPath);
            if (parsed) crates.push(parsed);
          }
        }
      } catch { /* ignore */ }
    } else {
      const cargoPath = path.join(cwd, member, 'Cargo.toml');
      if (fs.existsSync(cargoPath)) {
        const parsed = parseCargoBasic(cargoPath);
        if (parsed) crates.push(parsed);
      }
    }
  }

  // Prefer crate matching repo name
  return crates.find(c => c.name === repoName) || crates[0] || null;
}

function parseCargoBasic(cargoPath) {
  try {
    const content = fs.readFileSync(cargoPath, 'utf8');
    const nameMatch = content.match(/^name\s*=\s*"(.+?)"/m);
    if (!nameMatch) return null;
    const versionMatch = content.match(/^version\s*=\s*"(.+?)"/m);
    const descSingle = content.match(/^description\s*=\s*"([^"]+)"/m);
    const descMulti = content.match(/^description\s*=\s*"""([\s\S]*?)"""/m);
    return {
      name: nameMatch[1],
      version: versionMatch ? versionMatch[1] : null,
      description: descMulti ? descMulti[1].trim() : (descSingle ? descSingle[1] : null)
    };
  } catch { return null; }
}

/**
 * Find the primary publishable package in a monorepo.
 */
function findPrimaryPackage(cwd) {
  const candidates = ['packages', 'apps', 'libs'];
  for (const dir of candidates) {
    const dirPath = path.join(cwd, dir);
    if (!fs.existsSync(dirPath)) continue;
    try {
      const entries = fs.readdirSync(dirPath);
      for (const entry of entries) {
        const pkgPath = path.join(dirPath, entry, 'package.json');
        if (fs.existsSync(pkgPath)) {
          const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
          if (!pkg.private && pkg.name) return pkg;
        }
      }
    } catch { /* ignore */ }
  }
  return null;
}

/**
 * Parse a simple TOML section to extract dependency names.
 */
function parseTomlSection(content, sectionHeader) {
  const idx = content.indexOf(sectionHeader);
  if (idx === -1) return [];
  const after = content.substring(idx + sectionHeader.length);
  const nextSection = after.match(/^\[/m);
  const sectionContent = nextSection ? after.substring(0, nextSection.index) : after;
  const deps = [];
  for (const line of sectionContent.split('\n')) {
    const match = line.match(/^(\w[\w-]*)\s*=/);
    if (match) deps.push(match[1]);
  }
  return deps;
}

// ─── Directory structure ────────────────────────────────────────────────────

const EXCLUDE_DIRS = new Set([
  'node_modules', '.git', 'dist', 'target', 'out',
  '.next', '.nuxt', '__pycache__', '.pytest_cache', 'coverage',
  '.cache', 'vendor', '.idea', '.vscode'
]);

function scanStructure(cwd, maxDepth = 3) {
  const tree = [];

  // Add root-level file info
  try {
    const rootEntries = fs.readdirSync(cwd, { withFileTypes: true });
    const rootFiles = rootEntries
      .filter(e => !e.isDirectory())
      .map(e => e.name);
    const rootDirs = rootEntries
      .filter(e => e.isDirectory() && !EXCLUDE_DIRS.has(e.name) && !e.name.startsWith('.'))
      .map(e => e.name);
    tree.push({
      path: './',
      depth: 0,
      files: rootFiles.length,
      dirs: rootDirs.length,
      keyFiles: rootFiles.filter(f =>
        /\.(js|ts|go|rs|py|java|rb|c|cpp|h)$/.test(f) ||
        /^(index|main|mod|lib|app)\./i.test(f) ||
        /^(Makefile|Dockerfile|Cargo\.toml|go\.mod|pyproject\.toml)$/.test(f)
      ).slice(0, 15)
    });
  } catch { /* ignore */ }

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

    // Detect shallow clone
    let shallow = false;
    try {
      const shallowResult = execGit(cwd, 'rev-parse --is-shallow-repository');
      shallow = shallowResult.trim() === 'true';
    } catch { /* old git version */ }

    return {
      branch: branch.trim(),
      commitCount: parseInt(commitCount.trim(), 10) || 0,
      shallow,
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
      JSON.parse(output);
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

    const files = Object.keys(map.files);
    const totalSymbols = Object.values(map.files).reduce((sum, f) => {
      return sum + (f.symbols ? f.symbols.length : 0);
    }, 0);

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
      let content = fs.readFileSync(filePath, 'utf8');

      // Follow README redirects (e.g., zod's README is just "packages/zod/README.md")
      if (filename.toLowerCase().includes('readme') && content.trim().endsWith('.md') && content.trim().split('\n').length === 1) {
        const redirectPath = path.join(cwd, content.trim());
        if (fs.existsSync(redirectPath)) {
          content = fs.readFileSync(redirectPath, 'utf8');
        }
      }

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

#!/usr/bin/env node
// collect - gather project data for /onboard
'use strict';

/**
 * Usage: node scripts/collect.js [path] [--depth quick|normal|deep]
 *
 * Runs lib/collector (manifest, structure, README, CLAUDE.md, CI, git,
 * repo-intel, repo-map), writes the result to
 * <path>/<stateDir>/onboard-data.json and prints one status line per
 * source. Exit 2 on a bad argument, 1 if the path is not a directory.
 */

const fs = require('fs');
const path = require('path');
const collector = require('../lib/collector');

const DEPTHS = ['quick', 'normal', 'deep'];

function parseArgs(argv) {
  const out = { depth: 'normal', target: null };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--depth' || arg.startsWith('--depth=')) {
      const value = arg.includes('=') ? arg.slice(arg.indexOf('=') + 1) : argv[++i];
      if (!DEPTHS.includes(value)) {
        throw new Error(`--depth must be one of: ${DEPTHS.join(', ')} (got ${value === undefined ? 'nothing' : value})`);
      }
      out.depth = value;
    } else if (arg.startsWith('--')) {
      throw new Error(`unknown flag ${arg}. Usage: [path] [--depth quick|normal|deep]`);
    } else if (out.target === null) {
      out.target = arg;
    } else {
      throw new Error(`only one path is accepted (got ${out.target} and ${arg})`);
    }
  }
  out.target = path.resolve(out.target || process.cwd());
  return out;
}

// Same state dir the collector uses for repo-intel.json, so the data file
// sits next to the map.
function stateDirPath(target) {
  try {
    const { libRoot } = require('../lib/agentsys').get();
    return require(path.join(libRoot, 'platform', 'state-dir')).getStateDirPath(target);
  } catch {
    const dir = ['.claude', '.opencode', '.codex'].find(d => fs.existsSync(path.join(target, d))) || '.claude';
    return path.join(target, dir);
  }
}

function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (e) {
    console.error(`[ERROR] ${e.message}`);
    process.exit(2);
  }
  if (!fs.existsSync(opts.target) || !fs.statSync(opts.target).isDirectory()) {
    console.error(`[ERROR] not a directory: ${opts.target}`);
    process.exit(1);
  }

  const data = collector.collect(opts.target, { depth: opts.depth });
  const outDir = stateDirPath(opts.target);
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, 'onboard-data.json');
  const tmp = `${outFile}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, outFile);

  const ri = data.repoIntel;
  const lines = [
    `depth: ${opts.depth}`,
    `manifest: ${data.manifest ? `${data.manifest.type || 'unknown'} (${data.manifest.language || '?'})` : 'none'}`,
    `structure: ${Array.isArray(data.structure) ? data.structure.length : 0} directories`,
    `readme: ${data.readme ? 'found' : 'missing'}`
  ];
  if (opts.depth !== 'quick') {
    lines.push(`repo-intel: ${ri ? 'available' : 'unavailable'}`);
    if (ri) {
      lines.push(`  entry points: ${Array.isArray(ri.entryPoints) ? ri.entryPoints.length : 0}`);
      lines.push(`  slop: ${ri.slop ? Object.entries(ri.slop.counts).map(([k, v]) => `${k}=${v}`).join(' ') : 'unavailable'}`);
    }
  }
  if (opts.depth === 'deep') {
    lines.push(`repo-map: ${data.repoMap ? `${data.repoMap.totalFiles} files, ${data.repoMap.totalSymbols} symbols` : 'unavailable'}`);
  }
  for (const line of lines) console.log(line);
  console.log(`data: ${outFile}`);
}

if (require.main === module) main();

module.exports = { parseArgs };

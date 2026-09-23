'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const cp = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const script = path.resolve(__dirname, '..', 'scripts', 'collect.js');
const { parseArgs } = require(script);

test('parseArgs accepts a path and both --depth spellings', () => {
  assert.deepEqual(parseArgs(['/tmp', '--depth=quick']), { depth: 'quick', target: '/tmp' });
  assert.equal(parseArgs(['--depth', 'deep']).depth, 'deep');
  assert.equal(parseArgs([]).depth, 'normal');
  assert.equal(parseArgs([]).target, process.cwd());
});

test('parseArgs rejects bad depth, unknown flags and two paths', () => {
  assert.throws(() => parseArgs(['--depth=full']), /quick, normal, deep/);
  assert.throws(() => parseArgs(['--depth']), /got nothing/);
  assert.throws(() => parseArgs(['--verbose']), /unknown flag/);
  assert.throws(() => parseArgs(['a', 'b']), /only one path/);
});

test('bad flag exits 2 with the allowed values', () => {
  const r = cp.spawnSync(process.execPath, [script, '--depth=huge'], { encoding: 'utf8' });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /quick, normal, deep/);
});

test('quick depth writes the data file without repo-intel', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'onboard-'));
  try {
    cp.execFileSync('git', ['init', '-q'], { cwd: dir });
    fs.writeFileSync(path.join(dir, 'README.md'), '# demo\n');
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'demo', version: '1.0.0' }));
    const r = cp.spawnSync(process.execPath, [script, dir, '--depth=quick'], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    const dataLine = r.stdout.split('\n').find(l => l.startsWith('data: '));
    assert.ok(dataLine, r.stdout);
    const data = JSON.parse(fs.readFileSync(dataLine.slice(6), 'utf8'));
    assert.equal(data.depth, 'quick');
    assert.equal(data.manifest.name, 'demo');
    assert.equal(data.repoIntel, null);
    assert.doesNotMatch(r.stdout, /repo-intel:/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('repo-map summary reads the current object shape and the old array shape', () => {
  const { extractRepoMapSummary } = require('../lib/collector');
  const sym = (name, line) => ({ name, kind: 'function', line });
  const current = {
    'src/a.js': { symbols: { exports: [sym('a', 1), sym('b', 2), sym('c', 3), sym('d', 4)], functions: [sym('a', 1), sym('e', 9)] } },
    'src/b.js': { symbols: { exports: [sym('x', 1)] } }
  };
  const r = extractRepoMapSummary(current, 'files');
  assert.equal(r.totalFiles, 2);
  assert.equal(r.totalSymbols, 6);
  assert.deepEqual(r.keyExports, { 'src/a.js': ['a', 'b', 'c', 'd'] });

  const old = {
    'src/c.js': { symbols: ['p', 'q', 'r', 's', 't'].map(n => ({ name: n, exported: n !== 't' })) }
  };
  const o = extractRepoMapSummary(old, 'files');
  assert.equal(o.totalSymbols, 5);
  assert.deepEqual(o.keyExports, { 'src/c.js': ['p', 'q', 'r', 's'] });
});

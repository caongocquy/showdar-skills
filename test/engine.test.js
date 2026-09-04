import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parseCsv } from '../engine/csv.mjs';
import { rankRows } from '../engine/rank.mjs';
import { searchRows } from '../engine/search.mjs';
import { detectStacks } from '../engine/detect-stack.mjs';

test('parseCsv handles quoted commas and escaped quotes', () => {
  const rows = parseCsv('name,notes\nDashboard,"Dense, data-rich"\nCard,"Use ""quiet"" borders"\n');
  assert.deepEqual(rows, [
    { name: 'Dashboard', notes: 'Dense, data-rich' },
    { name: 'Card', notes: 'Use "quiet" borders' },
  ]);
});

test('parseCsv rejects malformed rows and duplicate headers', () => {
  assert.throws(() => parseCsv('id,summary\na,"unterminated\n'), /unterminated quoted field/);
  assert.throws(() => parseCsv('id,id\na,b\n'), /duplicate CSV header/);
  assert.throws(() => parseCsv('id,summary\na\n'), /column count/);
});

test('rankRows prioritizes token overlap across selected fields', () => {
  const rows = [
    { product: 'Wedding Invitation', tags: 'romantic editorial elegant' },
    { product: 'Developer Tool', tags: 'dense technical monospace' },
    { product: 'Fintech Dashboard', tags: 'finance data trust' },
  ];
  const ranked = rankRows(rows, 'elegant romantic wedding', ['product', 'tags']);
  assert.equal(ranked[0].row.product, 'Wedding Invitation');
  assert.ok(ranked[0].score > ranked[1].score);
});

test('searchRows supports exact filters before ranking', () => {
  const rows = [
    { stack: 'react-native', category: 'performance', guidance: 'Use virtualized lists for long collections' },
    { stack: 'flutter', category: 'performance', guidance: 'Limit rebuild scope' },
    { stack: 'react-native', category: 'navigation', guidance: 'Keep route params serializable' },
  ];
  const results = searchRows(rows, 'long list', { fields: ['guidance', 'category'], filters: { stack: 'react-native' }, limit: 2 });
  assert.equal(results.length, 2);
  assert.ok(results.every((entry) => entry.row.stack === 'react-native'));
  assert.equal(results[0].row.category, 'performance');
});

test('searchRows supports weighted fields, partial tokens, and multi-valued filters', () => {
  const rows = [
    { id: 'a', stack: 'react,react-native', category: 'performance', title: 'Virtualized list', guidance: 'Keep the JS thread free' },
    { id: 'b', stack: 'flutter', category: 'performance', title: 'Rebuild scope', guidance: 'Use lazy builders' },
  ];
  const results = searchRows(rows, 'virtual list', {
    fields: ['title', 'guidance'],
    weights: { title: 5, guidance: 1 },
    filters: { stack: 'react-native' },
    includeZero: false,
  });
  assert.equal(results.length, 1);
  assert.equal(results[0].row.id, 'a');
  assert.ok(results[0].matchedTokens.includes('virtual'));
});

test('detectStacks identifies common web and mobile project signals', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'showdar-stack-'));
  await writeFile(path.join(root, 'package.json'), JSON.stringify({ dependencies: { next: '16.0.0', react: '19.0.0', 'react-native': '0.82.0' } }));
  await writeFile(path.join(root, 'pubspec.yaml'), 'dependencies:\n  flutter:\n    sdk: flutter\n');
  await mkdir(path.join(root, 'ios'), { recursive: true });
  await mkdir(path.join(root, 'android'), { recursive: true });
  const stacks = await detectStacks(root);
  assert.ok(stacks.includes('nextjs'));
  assert.ok(stacks.includes('react'));
  assert.ok(stacks.includes('react-native'));
  assert.ok(stacks.includes('flutter'));
  assert.ok(stacks.includes('ios'));
  assert.ok(stacks.includes('android'));
});

test('detectStacks identifies desktop, CI, package-manager, and workspace signals', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'showdar-stack-extra-'));
  await writeFile(path.join(root, 'package.json'), JSON.stringify({
    packageManager: 'pnpm@10.0.0',
    workspaces: ['apps/*'],
    dependencies: { electron: '40.0.0', '@nestjs/core': '11.0.0', '@fastify/core': '5.0.0' },
  }));
  await writeFile(path.join(root, 'Cargo.toml'), '[package]\nname = "desktop"\n');
  await mkdir(path.join(root, '.github', 'workflows'), { recursive: true });
  await writeFile(path.join(root, '.github', 'workflows', 'ci.yml'), 'name: CI\n');
  const stacks = await detectStacks(root);
  assert.ok(stacks.includes('electron'));
  assert.ok(stacks.includes('nestjs'));
  assert.ok(stacks.includes('fastify'));
  assert.ok(stacks.includes('rust'));
  assert.ok(stacks.includes('package-manager'));
  assert.ok(stacks.includes('workspace'));
  assert.ok(stacks.includes('ci'));
});

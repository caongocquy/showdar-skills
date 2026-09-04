import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('routing metadata defines capability boundaries for adjacent skills', async () => {
  const conflicts = await readFile(path.join(root, 'router/conflicts.yaml'), 'utf8');
  for (const pair of [
    'showdar-understand vs showdar-requirements',
    'showdar-requirements vs showdar-plan',
    'showdar-plan vs showdar-build',
    'showdar-design vs showdar-build',
    'showdar-debug vs showdar-recover',
    'showdar-test vs showdar-quality',
    'showdar-review vs showdar-security',
    'showdar-review vs showdar-ship',
    'showdar-ship vs showdar-ops',
    'showdar-git vs showdar-ops',
    'showdar-git vs showdar-recover',
    'showdar-quality vs showdar-ship',
    'showdar-upgrade vs showdar-build',
  ]) assert.match(conflicts, new RegExp(`pair: ${pair.replaceAll('-', '\\-')}`));
});

test('Git-specific recovery outranks generic interrupted-work recovery', async () => {
  const triggers = await readFile(path.join(root, 'router/triggers.yaml'), 'utf8');
  assert.ok(triggers.indexOf('  - showdar-git') < triggers.indexOf('  - showdar-recover'));
  assert.match(triggers, /rebase.*cherry-pick.*conflict.*showdar-git/i);
  assert.match(triggers, /interrupted implementation.*showdar-recover/i);
});

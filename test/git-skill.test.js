import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function read(relative) {
  return readFile(path.join(root, relative), 'utf8');
}

test('showdar-git documents safe local Git workflow boundaries', async () => {
  const text = await read('skills/showdar-git/SKILL.md');
  assert.match(text, /git status/);
  assert.match(text, /git diff --cached/);
  assert.match(text, /git add.*explicit|explicit.*git add/i);
  assert.match(text, /git add \./);
  assert.match(text, /git add -A/);
  assert.match(text, /force-push/);
  assert.match(text, /GitHub Actions/);
  assert.match(text, /FEATURE\/TASK/);
  assert.match(text, /EXCLUDED/);
  assert.match(text, /Do not push unless explicitly requested|push.*explicitly requested/i);
});

test('showdar-git routing is separate from review, ship, recover, and debug', async () => {
  const map = await read('router/skill-map.yaml');
  const triggers = await read('router/triggers.yaml');
  const conflicts = await read('router/conflicts.yaml');
  assert.match(map, /git:/);
  assert.match(map, /skill: showdar-git/);
  assert.match(map, /commit.*stage.*merge.*rebase.*cherry-pick.*push/i);
  assert.match(triggers, /showdar-git/);
  assert.match(conflicts, /showdar-git/);
  assert.match(conflicts, /showdar-review/);
  assert.match(conflicts, /showdar-ship/);
  assert.match(conflicts, /showdar-recover/);
  assert.match(conflicts, /showdar-debug/);
});

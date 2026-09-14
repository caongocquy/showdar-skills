import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { hashSemanticSource, canonicalSemanticFileList, SEMANTIC_SOURCE_FIXED_PREFIX } from '../scripts/semantic-source-hash.mjs';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

// Phase 6F T17 frozen semantic-source hash (roll-forward from the T09/Phase 6E
// freeze: src/route-plan.js gained the additive buildThinRoutePlan path).
// Guards the freeze: any semantic production change must go through a new
// freeze cycle, never a silent edit.
const FROZEN_SEMANTIC_SOURCE_SHA256 = 'dcf250fad392655b2a62de60249ac7e51a920727fa4ffe8c19d1b1ea27fa760a';

test('canonical file list uses the frozen fixed prefix plus codepoint-sorted resolver files', () => {
  const files = canonicalSemanticFileList(repoRoot);
  assert.deepEqual(files.slice(0, 4), [...SEMANTIC_SOURCE_FIXED_PREFIX]);
  const suffix = files.slice(4);
  assert.ok(suffix.length >= 12);
  assert.ok(suffix.every((f) => f.startsWith('src/intent-resolver/') && f.endsWith('.js')));
  assert.deepEqual([...suffix].sort(), suffix);
});

test('semantic-source hash is deterministic and matches the Phase 6E freeze', () => {
  const first = hashSemanticSource(repoRoot);
  const second = hashSemanticSource(repoRoot);
  assert.equal(first.files.length, 16);
  assert.deepEqual(first, second);
  for (const entry of first.files) assert.match(entry.sha256, /^[0-9a-f]{64}$/);
  assert.equal(first.combined, FROZEN_SEMANTIC_SOURCE_SHA256);
});

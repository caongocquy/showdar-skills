import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { hashSemanticSource, canonicalSemanticFileList, SEMANTIC_SOURCE_FIXED_PREFIX } from '../scripts/semantic-source-hash.mjs';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

// Phase 6C frozen semantic-source hash. Guards the freeze: any semantic
// production change must go through a new freeze cycle, never a silent edit.
const FROZEN_SEMANTIC_SOURCE_SHA256 = '692c3f4008c6d02efe3e96c0cb35f307ce3794ef4f598830882375b214d09821';

test('canonical file list uses the frozen fixed prefix plus codepoint-sorted resolver files', () => {
  const files = canonicalSemanticFileList(repoRoot);
  assert.deepEqual(files.slice(0, 4), [...SEMANTIC_SOURCE_FIXED_PREFIX]);
  const suffix = files.slice(4);
  assert.ok(suffix.length >= 12);
  assert.ok(suffix.every((f) => f.startsWith('src/intent-resolver/') && f.endsWith('.js')));
  assert.deepEqual([...suffix].sort(), suffix);
});

test('semantic-source hash is deterministic and matches the Phase 6C freeze', () => {
  const first = hashSemanticSource(repoRoot);
  const second = hashSemanticSource(repoRoot);
  assert.equal(first.files.length, 16);
  assert.deepEqual(first, second);
  for (const entry of first.files) assert.match(entry.sha256, /^[0-9a-f]{64}$/);
  assert.equal(first.combined, FROZEN_SEMANTIC_SOURCE_SHA256);
});

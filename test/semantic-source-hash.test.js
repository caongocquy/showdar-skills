import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { hashSemanticSource, canonicalSemanticFileList, SEMANTIC_SOURCE_FIXED_PREFIX, SEMANTIC_SOURCE_RESOLVER_DIR, SEMANTIC_SOURCE_FRAME_DIR, SEMANTIC_SOURCE_PROJECTORS_DIR } from '../scripts/semantic-source-hash.mjs';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

// Phase 6G T03 authority shadow harness (roll-forward: append-only
// meta.authorityShadow wiring in src/intent-resolver/index.js; all existing
// return values unchanged, shadow diagnostic-only). Guards the freeze: any
// semantic production change must go through a new freeze cycle, never a
// silent edit.
const FROZEN_SEMANTIC_SOURCE_SHA256 = 'b3bc69b8fb2181934bae141ebe886dc417a61fbbbb76f130b090362c4bddb563';

// T19: every new authoritative frame/projector module must be inside the hash.
const EXPECTED_FRAME_FILES = [
  'src/intent-resolver/frame/action-frame.js',
  'src/intent-resolver/frame/clause-frame.js',
  'src/intent-resolver/frame/relations.js',
  'src/intent-resolver/frame/request-frame.js',
  'src/intent-resolver/frame/shadow.js',
  'src/intent-resolver/frame/surface-map.js',
];

const EXPECTED_PROJECTOR_FILES = [
  'src/intent-resolver/frame/projectors/constraints.js',
  'src/intent-resolver/frame/projectors/index.js',
  'src/intent-resolver/frame/projectors/metadata.js',
  'src/intent-resolver/frame/projectors/mutation.js',
  'src/intent-resolver/frame/projectors/primary.js',
  'src/intent-resolver/frame/projectors/secondary.js',
];

test('canonical file list is fixed prefix + resolver files + frame/ group + projectors/ group', () => {
  const files = canonicalSemanticFileList(repoRoot);
  assert.deepEqual(files.slice(0, 4), [...SEMANTIC_SOURCE_FIXED_PREFIX]);
  const rest = files.slice(4);
  const resolverFiles = rest.filter(
    (f) => f.startsWith(`${SEMANTIC_SOURCE_RESOLVER_DIR}/`) && !f.startsWith(`${SEMANTIC_SOURCE_FRAME_DIR}/`),
  );
  assert.ok(resolverFiles.length >= 12);
  assert.ok(resolverFiles.every((f) => /^src\/intent-resolver\/[^/]+\.js$/.test(f)));
  const frameFiles = rest.filter(
    (f) => f.startsWith(`${SEMANTIC_SOURCE_FRAME_DIR}/`) && !f.startsWith(`${SEMANTIC_SOURCE_PROJECTORS_DIR}/`),
  );
  const projectorFiles = rest.filter((f) => f.startsWith(`${SEMANTIC_SOURCE_PROJECTORS_DIR}/`));
  assert.deepEqual(frameFiles, EXPECTED_FRAME_FILES);
  assert.deepEqual(projectorFiles, EXPECTED_PROJECTOR_FILES);
  assert.deepEqual(files, [
    ...SEMANTIC_SOURCE_FIXED_PREFIX,
    ...resolverFiles,
    ...EXPECTED_FRAME_FILES,
    ...EXPECTED_PROJECTOR_FILES,
  ]);
});

test('canonical file list ordering is deterministic and shuffle-insensitive', () => {
  const first = canonicalSemanticFileList(repoRoot);
  const second = canonicalSemanticFileList(repoRoot);
  assert.deepEqual(first, second);
  const rest = first.slice(4);
  const groups = [
    rest.filter((f) => !f.startsWith(`${SEMANTIC_SOURCE_FRAME_DIR}/`)),
    rest.filter((f) => f.startsWith(`${SEMANTIC_SOURCE_FRAME_DIR}/`) && !f.startsWith(`${SEMANTIC_SOURCE_PROJECTORS_DIR}/`)),
    rest.filter((f) => f.startsWith(`${SEMANTIC_SOURCE_PROJECTORS_DIR}/`)),
  ];
  for (const group of groups) assert.deepEqual([...group].sort(), group);
});

test('semantic-source hash fails when a listed file is missing', () => {
  const tmpRoot = mkdtempSync(join(tmpdir(), 'semantic-hash-'));
  try {
    mkdirSync(join(tmpRoot, SEMANTIC_SOURCE_RESOLVER_DIR), { recursive: true });
    mkdirSync(join(tmpRoot, SEMANTIC_SOURCE_FRAME_DIR), { recursive: true });
    mkdirSync(join(tmpRoot, SEMANTIC_SOURCE_PROJECTORS_DIR), { recursive: true });
    assert.throws(() => hashSemanticSource(tmpRoot), /semantic source file missing/);
  } finally {
    rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test('semantic-source hash is deterministic and matches the T19 protocol freeze', () => {
  const first = hashSemanticSource(repoRoot);
  const second = hashSemanticSource(repoRoot);
  assert.equal(first.files.length, 4 + 12 + EXPECTED_FRAME_FILES.length + EXPECTED_PROJECTOR_FILES.length);
  assert.deepEqual(first, second);
  for (const entry of first.files) assert.match(entry.sha256, /^[0-9a-f]{64}$/);
  assert.equal(first.combined, FROZEN_SEMANTIC_SOURCE_SHA256);
});

/**
 * Canonical semantic-source hash tool (Phase 6C freeze protocol).
 *
 * Method (recovered from the Phase 6C freeze record — do NOT "improve"):
 * 1. Ordered file list: the four root semantic files in fixed order, then
 *    every src/intent-resolver/*.js file in codepoint-sorted order, then
 *    every src/intent-resolver/frame/*.js top-level file in codepoint-sorted
 *    order, then every src/intent-resolver/frame/projectors/*.js file in
 *    codepoint-sorted order.
 *    (Phase 6F T19 protocol update: the new authoritative frame/projector
 *    modules must be inside the hash before freeze.)
 * 2. Compute per-file SHA-256 hex (equivalent to `shasum -a 256 <file>`).
 * 3. Combined hash = SHA-256 over the per-file hex digests, each
 *    terminated by "\n" (equivalent to `printf '%s\n' h1 ... hn | shasum -a 256`).
 *    Filenames are NOT part of the combined input; file bytes are NOT
 *    concatenated directly.
 *
 * Pure Node (no shell, no locale-dependent `sort`, no shasum) so output is
 * identical on macOS and Linux.
 *
 * Usage: node scripts/semantic-source-hash.mjs [--root <repo-root>] [--json]
 * Exit code is 0 on success, 1 if any listed file is missing.
 */
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SEMANTIC_SOURCE_FIXED_PREFIX = Object.freeze([
  'src/intent-resolver.js',
  'src/route-plan.js',
  'src/verification-budget.js',
  'src/verification-executor.js',
]);

export const SEMANTIC_SOURCE_RESOLVER_DIR = 'src/intent-resolver';

// Phase 6F T19: authoritative structural frame modules. Listed explicitly
// (subdir, not filesystem order) so the hash is deterministic on
// macOS+Linux; new authoritative modules must be inside the hash before
// freeze.
export const SEMANTIC_SOURCE_FRAME_DIR = 'src/intent-resolver/frame';
export const SEMANTIC_SOURCE_PROJECTORS_DIR = 'src/intent-resolver/frame/projectors';

function codepointSort(values) {
  return [...values].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

function listTopLevelJsFiles(repoRoot, dir) {
  const dirents = readdirSync(join(repoRoot, dir), { withFileTypes: true });
  return codepointSort(
    dirents
      .filter((d) => d.isFile() && d.name.endsWith('.js'))
      .map((d) => `${dir}/${d.name}`),
  );
}

export function canonicalSemanticFileList(repoRoot) {
  const resolverFiles = listTopLevelJsFiles(repoRoot, SEMANTIC_SOURCE_RESOLVER_DIR);
  const frameFiles = listTopLevelJsFiles(repoRoot, SEMANTIC_SOURCE_FRAME_DIR);
  const projectorFiles = listTopLevelJsFiles(repoRoot, SEMANTIC_SOURCE_PROJECTORS_DIR);
  return [...SEMANTIC_SOURCE_FIXED_PREFIX, ...resolverFiles, ...frameFiles, ...projectorFiles];
}

export function hashSemanticSource(repoRoot) {
  const files = canonicalSemanticFileList(repoRoot);
  const perFile = files.map((rel) => {
    const abs = join(repoRoot, rel);
    if (!existsSync(abs)) throw new Error(`semantic source file missing: ${rel}`);
    const hex = createHash('sha256').update(readFileSync(abs)).digest('hex');
    return { file: rel, sha256: hex };
  });
  const combinedInput = perFile.map((entry) => `${entry.sha256}\n`).join('');
  const combined = createHash('sha256').update(combinedInput, 'utf8').digest('hex');
  return { files: perFile, combined };
}

function parseArgs(argv) {
  const args = { root: null, json: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--root') args.root = argv[++i];
    else if (argv[i] === '--json') args.json = true;
  }
  return args;
}

const isMain = resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url);
if (isMain) {
  const args = parseArgs(process.argv.slice(2));
  const repoRoot = resolve(args.root ?? join(fileURLToPath(import.meta.url), '..', '..'));
  try {
    const result = hashSemanticSource(repoRoot);
    if (args.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      for (const entry of result.files) console.log(`${entry.sha256}  ${entry.file}`);
      console.log(`combined: ${result.combined}`);
    }
  } catch (error) {
    console.error(`semantic-source-hash: ${error.message}`);
    process.exitCode = 1;
  }
}

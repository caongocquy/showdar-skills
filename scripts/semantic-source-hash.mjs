/**
 * Canonical semantic-source hash tool (Phase 6C freeze protocol).
 *
 * Method (recovered from the Phase 6C freeze record — do NOT "improve"):
 * 1. Ordered file list: the four root semantic files in fixed order, then
 *    every src/intent-resolver/*.js file in codepoint-sorted order.
 * 2. Compute per-file SHA-256 hex (equivalent to `shasum -a 256 <file>`).
 * 3. Combined hash = SHA-256 over the 16 per-file hex digests, each
 *    terminated by "\n" (equivalent to `printf '%s\n' h1 ... h16 | shasum -a 256`).
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

function codepointSort(values) {
  return [...values].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

export function canonicalSemanticFileList(repoRoot) {
  const dirents = readdirSync(join(repoRoot, SEMANTIC_SOURCE_RESOLVER_DIR), { withFileTypes: true });
  const resolverFiles = codepointSort(
    dirents
      .filter((d) => d.isFile() && d.name.endsWith('.js'))
      .map((d) => `${SEMANTIC_SOURCE_RESOLVER_DIR}/${d.name}`),
  );
  return [...SEMANTIC_SOURCE_FIXED_PREFIX, ...resolverFiles];
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

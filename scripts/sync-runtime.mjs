#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CANONICAL_RUNTIME_FILE, VENDORED_RUNTIME_FILES } from '../src/runtime.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = await readFile(path.join(root, CANONICAL_RUNTIME_FILE));
let changed = 0;

for (const relative of VENDORED_RUNTIME_FILES) {
  const target = path.join(root, relative);
  let current = null;
  try { current = await readFile(target); } catch { /* target creation is handled below */ }
  if (current?.equals(source)) continue;
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, source);
  changed += 1;
}

console.log(`Runtime sync OK: ${VENDORED_RUNTIME_FILES.length} vendored detector(s), ${changed} updated.`);

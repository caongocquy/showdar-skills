#!/usr/bin/env node
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { searchCsv } from './lib/search.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const dataRoot = path.resolve(here, '..', 'data');
const args = process.argv.slice(2);

function value(flag, fallback = null) {
  const i = args.indexOf(flag);
  return i === -1 ? fallback : args[i + 1];
}

const query = value('--query') ?? args.filter((arg) => !arg.startsWith('--') && !['domain','stack','limit'].includes(arg)).join(' ');
const domain = value('--domain', 'styles');
const stack = value('--stack');
const limit = Number(value('--limit', '8'));
if (!query) {
  console.error('Usage: node scripts/search.mjs --query "..." [--domain products|styles|colors|typography|motion|accessibility|components|ui-patterns] [--stack react-native] [--limit 8]');
  process.exit(1);
}

try {
  const index = JSON.parse(await readFile(path.join(dataRoot, 'index.json'), 'utf8'));
  const relative = stack ? `data/stacks/${stack}.csv` : `data/${domain}.csv`;
  const dataset = index.datasets.find((entry) => entry.file === relative);
  if (!dataset) throw new Error(`unknown dataset ${relative}; inspect data/index.json`);
  const weights = Object.fromEntries((dataset.searchableFields ?? []).map((field) => [field, ['id', 'tags', 'category', 'product', 'style'].includes(field) ? 2 : 1]));
  const results = await searchCsv(path.join(path.dirname(dataRoot), dataset.file), query, {
    fields: dataset.searchableFields, weights, filters: stack ? { stack } : {}, limit, includeZero: false,
  });
  console.log(JSON.stringify(results.map(({ row, score, matchedTokens }) => ({ score, matchedTokens, ...row })), null, 2));
} catch (error) {
  console.error(`showdar-design search: ${error.message}`);
  process.exit(1);
}

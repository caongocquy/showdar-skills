import { readFile } from 'node:fs/promises';
import { parseCsv } from './csv.mjs';
import { rankRows } from './rank.mjs';

export function searchRows(rows, query, { fields = [], weights = {}, filters = {}, limit = 8, includeZero = true } = {}) {
  const matches = (actual, expected) => {
    const actualValues = String(actual ?? '').split(/[,|;]/).map((value) => value.trim().toLowerCase()).filter(Boolean);
    const expectedValues = (Array.isArray(expected) ? expected : [expected]).flatMap((value) => String(value).split(/[,|;]/)).map((value) => value.trim().toLowerCase()).filter(Boolean);
    return expectedValues.length > 0 && expectedValues.every((value) => actualValues.includes(value));
  };
  const filtered = rows.filter((row) => Object.entries(filters).every(([key, value]) => matches(row[key], value)));
  const ranked = rankRows(filtered, query, { fields, weights });
  const candidates = includeZero ? ranked : ranked.filter((entry) => entry.score > 0);
  return candidates.slice(0, Math.max(0, limit));
}

export async function searchCsv(file, query, options = {}) {
  const rows = parseCsv(await readFile(file, 'utf8'));
  return searchRows(rows, query, options);
}

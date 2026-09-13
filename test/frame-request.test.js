import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

export async function loadStructuralCases() {
  const filePath = path.resolve(import.meta.dirname, '../evals/structural-routing-cases.json');
  const data = await readFile(filePath, 'utf8');
  const json = JSON.parse(data);
  // Support both legacy array format or new { version, cases }
  return json.cases ?? json;
}

test('structural routing fixture schema keys', async () => {
  const cases = await loadStructuralCases();
  const requiredTop = ['id', 'input', 'expected'];
  const requiredExpected = ['clauses', 'actions', 'relations', 'constraints', 'intent', 'primary', 'advisors'];
  for (const c of cases) {
    for (const k of requiredTop) {
      assert.ok(Object.prototype.hasOwnProperty.call(c, k), `Case missing top-level key ${k}`);
    }
    const exp = c.expected;
    for (const ek of requiredExpected) {
      assert.ok(Object.prototype.hasOwnProperty.call(exp, ek), `Case ${c.id} missing expected.${ek}`);
    }
  }
});

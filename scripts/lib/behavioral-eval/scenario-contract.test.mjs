import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { validateSuite, validateScenario } from './scenario-contract.mjs';

const url = new URL('../../../evals/behavioral/scenarios.json', import.meta.url);
const suite = JSON.parse(await readFile(fileURLToPath(url), 'utf8'));
const clone = (value) => structuredClone(value);

test('behavioral evaluation suite defines 18 validated, distinct cases', () => {
  assert.deepEqual(validateSuite(suite), []);
});

test('invalid, missing, and duplicate cases are rejected', () => {
  const broken = clone(suite);
  broken.scenarios[1].id = broken.scenarios[0].id;
  assert.match(validateSuite(broken).join('\n'), /unique|must match case ID/);
  broken.scenarios.pop();
  assert.match(validateSuite(broken).join('\n'), /expected 18 cases/);
});

test('unknown actions and impossible ordering are rejected', () => {
  const broken = clone(suite.scenarios[0]);
  broken.oracle.required[0].kind = 'magic_action';
  assert.match(validateScenario(broken, suite.fixtureTemplates).join('\n'), /kind unknown/);
  broken.oracle.required[0].kind = 'skill_selected';
  broken.oracle.order.push(['not-real', 'also-not-real']);
  assert.match(validateScenario(broken, suite.fixtureTemplates).join('\n'), /order/);
});

test('negative-action and approval safeguards are required', () => {
  const broken = clone(suite.scenarios.find(x => x.id === 'BRAIN-003'));
  broken.oracle.forbidden = [];
  assert.match(validateScenario(broken, suite.fixtureTemplates).join('\n'), /forbidden/);
  const unsafe = clone(suite.scenarios.find(x => x.id === 'SAFE-001'));
  unsafe.oracle.required = [];
  assert.match(validateScenario(unsafe, suite.fixtureTemplates).join('\n'), /required/);
});

test('agent-unavailable and parallel-host contradictions are invalid', () => {
  const broken = clone(suite.scenarios.find(x => x.id === 'BUILD-002'));
  broken.capabilities.subagents = false;
  broken.capabilities.parallel = true;
  assert.match(validateScenario(broken, suite.fixtureTemplates).join('\n'), /parallel requires subagents/);
});

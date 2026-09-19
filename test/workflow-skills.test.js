import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ALL_SKILLS,
  PRIMITIVE_COUNT,
  SKILLS,
  TOTAL_COUNT,
  WORKFLOW_COUNT,
  WORKFLOW_SKILLS,
  getPrimitive,
  getSkill,
  getWorkflow,
  isWorkflowSkill,
  normalizeSkillName,
} from '../src/catalog.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const EXPECTED_WORKFLOWS = ['showdar-feature', 'showdar-bugfix', 'showdar-release', 'showdar-incident'];

const EXPECTED_STAGES = {
  'showdar-feature': ['showdar-understand', 'showdar-requirements', 'showdar-plan', 'showdar-design', 'showdar-build', 'showdar-test', 'showdar-review'],
  'showdar-bugfix': ['showdar-understand', 'showdar-debug', 'showdar-build', 'showdar-test', 'showdar-review'],
  'showdar-release': ['showdar-quality', 'showdar-security', 'showdar-ship', 'showdar-ops'],
  'showdar-incident': ['showdar-understand', 'showdar-debug', 'showdar-recover', 'showdar-test', 'showdar-ops'],
};

async function workflowText(id) {
  return readFile(path.join(repoRoot, 'skills', id, 'SKILL.md'), 'utf8');
}

test('primitive count remains exactly fifteen', () => {
  assert.equal(SKILLS.length, 15);
  assert.equal(PRIMITIVE_COUNT, 15);
  assert.ok(SKILLS.every((skill) => skill.kind === 'primitive'));
});

test('workflow count is four and total installable is nineteen', () => {
  assert.deepEqual(WORKFLOW_SKILLS.map((skill) => skill.id), EXPECTED_WORKFLOWS);
  assert.equal(WORKFLOW_COUNT, 4);
  assert.equal(TOTAL_COUNT, 19);
  assert.equal(ALL_SKILLS.length, 19);
  assert.ok(WORKFLOW_SKILLS.every((skill) => skill.kind === 'workflow'));
});

test('workflow lookups distinguish primitives from workflows', () => {
  for (const id of EXPECTED_WORKFLOWS) {
    assert.ok(isWorkflowSkill(id));
    assert.equal(getWorkflow(id)?.id, id);
    assert.equal(getSkill(id)?.kind, 'workflow');
    assert.equal(getPrimitive(id), null);
  }
  assert.ok(!isWorkflowSkill('showdar-build'));
  assert.equal(getWorkflow('showdar-build'), null);
  assert.equal(getPrimitive('showdar-build')?.kind, 'primitive');
});

test('short workflow names normalize like primitives', () => {
  assert.equal(normalizeSkillName('feature'), 'showdar-feature');
  assert.equal(normalizeSkillName('bugfix'), 'showdar-bugfix');
  assert.equal(normalizeSkillName('release'), 'showdar-release');
  assert.equal(normalizeSkillName('incident'), 'showdar-incident');
  assert.equal(normalizeSkillName('showdar-feature'), 'showdar-feature');
});

test('workflow candidate stages reference only known primitives', () => {
  const primitives = new Set(SKILLS.map((skill) => skill.id));
  for (const workflow of WORKFLOW_SKILLS) {
    assert.ok(Array.isArray(workflow.stages) && workflow.stages.length > 0, `${workflow.id} declares stages`);
    for (const stage of workflow.stages) {
      assert.ok(primitives.has(stage), `${workflow.id} references unknown primitive ${stage}`);
      assert.ok(!isWorkflowSkill(stage), `${workflow.id} must not stage another workflow`);
    }
  }
  assert.deepEqual(Object.fromEntries(WORKFLOW_SKILLS.map((w) => [w.id, w.stages])), EXPECTED_STAGES);
});

test('workflow composition has no cycles and no self-reference', () => {
  for (const workflow of WORKFLOW_SKILLS) {
    assert.ok(!workflow.stages.includes(workflow.id), `${workflow.id} must not invoke itself`);
  }
});

test('workflow SKILL.md files exist with discovery metadata', async () => {
  for (const workflow of WORKFLOW_SKILLS) {
    const text = await workflowText(workflow.id);
    const native = text.match(/^description:\s*(.+)$/m)?.[1];
    assert.ok(native?.startsWith('Use when '), `${workflow.id} needs a trigger-style discovery description`);
    assert.equal(workflow.description, native, `${workflow.id} catalog/native descriptions drifted`);
  }
});

test('feature workflow is adaptive, not a fixed pipeline', async () => {
  const text = await workflowText('showdar-feature');
  assert.match(text, /skip requirements/i);
  assert.match(text, /skip plan/i);
  assert.match(text, /skip design/i);
  assert.match(text, /never skip verification/i);
  assert.match(text, /ops.*NOT implied|NOT.*implied by feature/i);
});

test('bugfix workflow adapts to known versus unknown root cause', async () => {
  const text = await workflowText('showdar-bugfix');
  assert.match(text, /root cause.*unknown|unknown.*root cause/i);
  assert.match(text, /proven|already.*known/i);
  assert.match(text, /investigation-only|diagnosis/i);
  assert.match(text, /symptom.*not.*authority|symptom description alone/i);
});

test('release workflow separates readiness from execution', async () => {
  const text = await workflowText('showdar-release');
  assert.match(text, /readiness/i);
  assert.match(text, /must NOT imply deployment|NOT imply deployment/i);
  assert.match(text, /explicit.*authoriz/i);
});

test('incident workflow keeps severity from granting authority', async () => {
  const text = await workflowText('showdar-incident');
  assert.match(text, /diagnosis before/i);
  assert.match(text, /severity.*never|never.*severity/i);
  assert.match(text, /production mutation is never inferred|never inferred/i);
});

test('workflows consume authority and never mint it', async () => {
  for (const workflow of WORKFLOW_SKILLS) {
    const text = await workflowText(workflow.id);
    assert.match(text, /does not grant|does NOT|never grants|never mints|not .* authority|never inferred/i);
    assert.doesNotMatch(text, /you are authorized|grants you|you may deploy/i);
  }
});

test('workflows do not duplicate primitive instructions', async () => {
  for (const workflow of WORKFLOW_SKILLS) {
    const text = await workflowText(workflow.id);
    for (const stage of EXPECTED_STAGES[workflow.id]) {
      assert.ok(!text.includes(`skills/${stage}/`), `${workflow.id} must reference ${stage}, not embed it`);
    }
  }
});

test('single primitive intent stays primitive', async () => {
  const feature = await workflowText('showdar-feature');
  assert.match(feature, /single primitive|stays primitive/i);
  const bugfix = await workflowText('showdar-bugfix');
  assert.match(bugfix, /single primitive|stays primitive|only.*diagnos/i);
});

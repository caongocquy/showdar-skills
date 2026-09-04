import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { validateRepository, validateSkillDirectory } from '../src/validate.js';

const REQUIRED = [
  'Purpose', 'When to use', 'When not to use', 'Inputs and assumptions',
  'Non-negotiable rules', 'Workflow', 'Decision points', 'Stack detection',
  'Failure modes', 'Stop conditions', 'Escalation conditions', 'Verification',
  'Output contract', 'Anti-patterns', 'Example',
];

function skillText({ extra = '', description = 'A sufficiently detailed skill description used by validator tests.' } = {}) {
  const sections = REQUIRED.map((name) => `## ${name}\n\n${Array.from({ length: 6 }, () => 'Useful implementation guidance with concrete constraints and evidence.').join('\n')}`).join('\n\n');
  return `---\nname: showdar-example\ndescription: ${description}\n---\n\n# Showdar Example\n\n${sections}\n\n${extra}\n`;
}

async function makeSkill(text = skillText()) {
  const root = await mkdtemp(path.join(tmpdir(), 'showdar-validate-'));
  await mkdir(path.join(root, 'showdar-example'), { recursive: true });
  await writeFile(path.join(root, 'showdar-example', 'SKILL.md'), text);
  return path.join(root, 'showdar-example');
}

test('validator accepts a deep skill with all required sections', async () => {
  const dir = await makeSkill();
  const result = await validateSkillDirectory(dir);
  assert.deepEqual(result.errors, []);
});

test('validator rejects shallow skills and missing required sections', async () => {
  const dir = await makeSkill('---\nname: showdar-example\ndescription: short\n---\n\n## Purpose\nTiny.\n');
  const result = await validateSkillDirectory(dir);
  assert.ok(result.errors.some((error) => error.includes('description')));
  assert.ok(result.errors.some((error) => error.includes('missing section')));
  assert.ok(result.errors.some((error) => error.includes('meaningful lines')));
});

test('validator rejects placeholder markers', async () => {
  const dir = await makeSkill(skillText({ extra: '\nImplementation detail: TODO fill later.\n' }));
  const result = await validateSkillDirectory(dir);
  assert.ok(result.errors.some((error) => error.includes('placeholder')));
});

test('validator checks explicitly referenced local assets', async () => {
  const dir = await makeSkill(skillText({ extra: '\nRead `references/missing.md` before continuing.\n' }));
  const result = await validateSkillDirectory(dir);
  assert.ok(result.errors.some((error) => error.includes('references/missing.md')));
});


test('validator rejects broken relative imports inside skill scripts', async () => {
  const dir = await makeSkill(skillText({ extra: '\nRun `scripts/tool.mjs` for deterministic inspection.\n' }));
  await mkdir(path.join(dir, 'scripts'), { recursive: true });
  await writeFile(path.join(dir, 'scripts', 'tool.mjs'), "import './missing.mjs';\nconsole.log('x');\n");
  const result = await validateSkillDirectory(dir);
  assert.ok(result.errors.some((error) => error.includes('missing relative import')));
});

test('validator rejects scripts with invalid syntax', async () => {
  const dir = await makeSkill(skillText({ extra: '\nRun `scripts/tool.mjs` for deterministic inspection.\n' }));
  await mkdir(path.join(dir, 'scripts'), { recursive: true });
  await writeFile(path.join(dir, 'scripts', 'tool.mjs'), "const broken = ;\n");
  const result = await validateSkillDirectory(dir);
  assert.ok(result.errors.some((error) => error.includes('not runnable JavaScript')));
});

test('validator checks indexed CSV schemas, duplicate rows, IDs, stacks, and empty datasets', async () => {
  const dir = await makeSkill();
  await mkdir(path.join(dir, 'data'), { recursive: true });
  await writeFile(path.join(dir, 'data', 'index.json'), JSON.stringify({
    version: 1,
    skill: 'showdar-example',
    datasets: [
      {
        file: 'data/knowledge.csv',
        idField: 'id',
        requiredColumns: ['id', 'category', 'tags', 'stack', 'summary'],
        searchableFields: ['summary', 'tags'],
        filterFields: ['category', 'stack'],
      },
      {
        file: 'data/empty.csv',
        idField: 'id',
        requiredColumns: ['id', 'category'],
        searchableFields: ['category'],
        filterFields: ['category'],
      },
    ],
  }, null, 2));
  await writeFile(path.join(dir, 'data', 'knowledge.csv'), [
    'id,category,tags,stack,summary',
    'same,debug,"race,async",not-a-stack,First diagnosis',
    'same,debug,"race,async",not-a-stack,First diagnosis',
  ].join('\n') + '\n');
  await writeFile(path.join(dir, 'data', 'empty.csv'), 'id,category\n');
  const result = await validateSkillDirectory(dir);
  assert.ok(result.errors.some((error) => error.includes('duplicate row')));
  assert.ok(result.errors.some((error) => error.includes('duplicate id')));
  assert.ok(result.errors.some((error) => error.includes('invalid stack')));
  assert.ok(result.errors.some((error) => error.includes('empty dataset')));
});

test('validator rejects unindexed data assets and invalid index references', async () => {
  const dir = await makeSkill();
  await mkdir(path.join(dir, 'data'), { recursive: true });
  await writeFile(path.join(dir, 'data', 'index.json'), JSON.stringify({
    version: 1,
    skill: 'showdar-example',
    datasets: [{ file: 'data/missing.csv', idField: 'id', requiredColumns: ['id'], searchableFields: ['id'], filterFields: [] }],
  }));
  await writeFile(path.join(dir, 'data', 'extra.csv'), 'id\na\n');
  const result = await validateSkillDirectory(dir);
  assert.ok(result.errors.some((error) => error.includes('indexed dataset does not exist')));
  assert.ok(result.errors.some((error) => error.includes('not listed in data/index.json')));
});

test('validator rejects malformed dataset metadata', async () => {
  const dir = await makeSkill();
  await mkdir(path.join(dir, 'data'), { recursive: true });
  await writeFile(path.join(dir, 'data', 'index.json'), JSON.stringify({
    version: 1,
    skill: 'showdar-example',
    datasets: [{
      file: 'data/knowledge.csv',
      idField: '',
      requiredColumns: ['id', 'id'],
      searchableFields: 'summary',
      filterFields: ['missing', 'missing'],
    }],
  }));
  await writeFile(path.join(dir, 'data', 'knowledge.csv'), 'id,summary\na,works\n');
  const result = await validateSkillDirectory(dir);
  assert.ok(result.errors.some((error) => error.includes('idField must be a non-empty string')));
  assert.ok(result.errors.some((error) => error.includes('requiredColumns contains duplicates')));
  assert.ok(result.errors.some((error) => error.includes('searchableFields must be an array')));
  assert.ok(result.errors.some((error) => error.includes('filterFields contains duplicates')));
});

test('validator rejects drift in a vendored runtime detector', async () => {
  const sourceRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
  const tempRoot = await mkdtemp(path.join(tmpdir(), 'showdar-runtime-validate-'));
  const packageRoot = path.join(tempRoot, 'package');
  try {
    await cp(sourceRoot, packageRoot, {
      recursive: true,
      filter: (source) => !source.includes(`${path.sep}.git${path.sep}`) && !source.includes(`${path.sep}node_modules${path.sep}`) && !source.endsWith('.tgz'),
    });
    await writeFile(path.join(packageRoot, 'skills/showdar-debug/scripts/lib/detect-stack.mjs'), 'export function detectStacks() { return []; }\n');
    const result = await validateRepository(packageRoot);
    assert.ok(result.errors.some((error) => error.includes('vendored runtime detector drift')));
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

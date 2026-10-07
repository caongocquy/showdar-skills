import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { buildThinRoutePlan } from '../src/route-plan.js';
import { routeRequest, projectLifecycle } from '../src/runtime-route.js';
import { resolveIntentFromPrompt } from '../src/intent-resolver/index.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cli = path.join(root, 'bin/showdar.js');
const run = (cwd, args, input) => spawnSync(process.execPath, [cli, 'route', ...args], { cwd, input, encoding: 'utf8' });

for (const [prompt, primary, advisor] of [
  ['Implement the approved feature', 'showdar-build'],
  ['Investigate why the app crashes', 'showdar-debug'],
  ['Commit the task files', 'showdar-git'],
  ['Implement the approved feature and add regression tests', 'showdar-build', 'showdar-test'],
  ['Implement the approved feature and review the code', 'showdar-build', 'showdar-review'],
  ['Implement the approved feature and perform a security review', 'showdar-build'],
]) test(`route canonical lifecycle: ${prompt}`, () => {
  const output = run(tmpdir(), ['--prompt', prompt, '--json']);
  assert.equal(output.status, 0, output.stderr);
  const result = JSON.parse(output.stdout);
  assert.equal(result.data.lifecycle.primary, primary);
  if (advisor) assert.ok(result.data.lifecycle.advisors.includes(advisor));
  assert.deepEqual(result.data.intent, resolveIntentFromPrompt(prompt).intent);
  assert.deepEqual(result.data.lifecycle.advisors, resolveIntentFromPrompt(prompt).advisors);
  assert.deepEqual(Object.keys(result.data.intent).sort(), ['action', 'evidence', 'mutation', 'object', 'phase', 'risks', 'secondaryActions']);
  for (const key of ['primaryCapability', 'resolverMeta', 'diagnostics', 'ActionCandidate', 'AuthorizedAction', 'requestFrame']) assert.ok(!output.stdout.includes(key));
});

for (const [prompt, domain] of [
  ['Explain insurance terminology', 'showdar-insurance-domain'],
  ['Implement underwriting and premium rating', 'showdar-insurance-workflows'],
  ['Review insurer API mapping and insurance UI terminology', 'showdar-insurance-review'],
  ['Explain thuật ngữ bảo hiểm', 'showdar-insurance-domain'],
]) test(`advisory domain: ${prompt}`, () => {
  const out = run(tmpdir(), ['--prompt', prompt, '--json']);
  assert.equal(out.status, 0, out.stderr);
  const data = JSON.parse(out.stdout).data;
  const canonical = resolveIntentFromPrompt(prompt);
  assert.ok(data.domain.matches.includes(domain));
  assert.equal(data.lifecycle.primary, canonical.primary.skill);
  assert.deepEqual(data.intent, canonical.intent);
});

test('availability observes managed native files; missing primary never substitutes', async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), 'route-availability-'));
  try {
    const prompt = 'Investigate why the app crashes during underwriting';
    let out = JSON.parse(run(cwd, ['--prompt', prompt, '--json']).stdout);
    assert.equal(out.data.availability.managed, false);
    assert.equal(out.data.availability.missingLifecyclePrimary, null);
    const ids = ['showdar-build', 'showdar-insurance-workflows'];
    for (const id of ids) {
      await mkdir(path.join(cwd, '.agents/skills', id), { recursive: true });
      await writeFile(path.join(cwd, '.agents/skills', id, 'SKILL.md'), 'fixture');
    }
    await writeFile(path.join(cwd, '.showdar.json'), JSON.stringify({ version: 2, skills: [...ids, 'showdar-debug'], files: ids.map(id => ({ path: `.agents/skills/${id}` })) }));
    out = JSON.parse(run(cwd, ['--prompt', prompt, '--json']).stdout);
    assert.equal(out.data.lifecycle.primary, 'showdar-debug');
    assert.equal(out.data.availability.missingLifecyclePrimary, true);
    assert.deepEqual(out.data.availability.missingDomainMatches, []);
    await rm(path.join(cwd, '.agents/skills/showdar-insurance-workflows'), { recursive: true });
    out = JSON.parse(run(cwd, ['--prompt', prompt, '--json']).stdout);
    assert.deepEqual(out.data.availability.missingDomainMatches, ['showdar-insurance-workflows']);
    const human = run(cwd, ['--prompt', prompt]);
    assert.match(human.stdout, /showdar add debug/);
    assert.match(human.stdout, /showdar add insurance-workflows/);
    await mkdir(path.join(cwd, '.agents/skills/showdar-debug'), { recursive: true });
    await writeFile(path.join(cwd, '.agents/skills/showdar-debug/SKILL.md'), 'fixture');
    const manifest = JSON.parse(await readFile(path.join(cwd, '.showdar.json')));
    manifest.files.push({ path: '.agents/skills/showdar-debug' });
    await writeFile(path.join(cwd, '.showdar.json'), JSON.stringify(manifest));
    out = JSON.parse(run(cwd, ['--prompt', prompt, '--json']).stdout);
    assert.equal(out.data.availability.missingLifecyclePrimary, false);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test('stdin, multiline Unicode and shell metacharacters remain inert and deterministic', async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), 'route-input-'));
  try {
    const prompt = 'Implement bảo hiểm\n"quotes" `touch sentinel` ; $(touch sentinel) | & > sentinel';
    const outputs = Array.from({ length: 3 }, () => run(cwd, ['--stdin', '--json'], prompt));
    for (const out of outputs) assert.equal(out.status, 0, out.stderr);
    assert.equal(outputs[0].stdout, outputs[1].stdout);
    assert.equal(outputs[1].stdout, outputs[2].stdout);
    assert.equal(outputs[0].stdout, run(cwd, ['--prompt', prompt, '--json']).stdout);
    await assert.rejects(readFile(path.join(cwd, 'sentinel')), { code: 'ENOENT' });
    assert.match(run(cwd, ['--prompt', 'Implement feature']).stdout, /Lifecycle: showdar-build/);
    for (const args of [[], ['--stdin', '--prompt', 'x'], ['--prompt'], ['--wat']]) {
      const out = run(cwd, [...args, '--json'], '');
      assert.notEqual(out.status, 0);
      assert.equal(JSON.parse(out.stdout).ok, false);
    }
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test('security advisor projection preserves the canonical thin route without adding authority', () => {
  const intent = resolveIntentFromPrompt('Implement approved feature').intent;
  const thin = buildThinRoutePlan({ ...intent, secondaryActions: ['security'] }, { primaryCapability: 'implement' });
  assert.deepEqual(projectLifecycle(thin), { primary: 'showdar-build', advisors: ['showdar-security'] });
});


test('malformed manifest and option-like prompt fail explicitly', async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), 'route-invalid-'));
  try {
    await writeFile(path.join(cwd, '.showdar.json'), 'null');
    const out = run(cwd, ['--prompt', 'Implement feature', '--json']);
    assert.notEqual(out.status, 0);
    assert.equal(JSON.parse(out.stdout).ok, false);
    const helpData = run(cwd, ['--prompt', '--help', '--json']);
    assert.notEqual(helpData.status, 0);
    assert.equal(JSON.parse(helpData.stdout).ok, false);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});


test('availability checks recorded global satisfaction, missing advisors and workflow installs', async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), 'route-global-'));
  const home = path.join(cwd, 'home');
  try {
    const ids = ['showdar-build', 'showdar-feature'];
    for (const id of ids) {
      await mkdir(path.join(cwd, '.agents/skills', id), { recursive: true });
      await writeFile(path.join(cwd, '.agents/skills', id, 'SKILL.md'), 'fixture');
    }
    const relative = '.agents/skills/showdar-insurance-workflows';
    await mkdir(path.join(home, relative), { recursive: true });
    await writeFile(path.join(home, relative, 'SKILL.md'), 'fixture');
    await mkdir(path.join(home, '.showdar'));
    await writeFile(path.join(home, '.showdar/global.json'), JSON.stringify({ version: 2, skills: ['showdar-insurance-workflows'], files: [{ path: relative }] }));
    await writeFile(path.join(cwd, '.showdar.json'), JSON.stringify({ version: 2, skills: [...ids, 'showdar-insurance-workflows'], files: ids.map(id => ({ path: `.agents/skills/${id}` })), satisfiedByGlobal: [{ skill: 'showdar-insurance-workflows', path: relative }] }));
    const options = { prompt: 'Implement underwriting and add regression tests', cwd, home, packageRoot: root };
    let data = await routeRequest(options);
    assert.equal(data.availability.missingLifecyclePrimary, false);
    assert.deepEqual(data.availability.missingAdvisors, ['showdar-test']);
    assert.ok(data.availability.installed.includes('showdar-feature'));
    assert.deepEqual(data.availability.missingDomainMatches, []);
    await rm(path.join(home, relative), { recursive: true });
    data = await routeRequest(options);
    assert.deepEqual(data.availability.missingDomainMatches, ['showdar-insurance-workflows']);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

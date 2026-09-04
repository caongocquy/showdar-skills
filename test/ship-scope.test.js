import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function read(relative) {
  return readFile(path.join(root, relative), 'utf8');
}

test('ordinary ship is delivery verification, not deployment execution', async () => {
  const skill = await read('skills/showdar-ship/SKILL.md');
  assert.match(skill, /delivery verification/i);
  assert.match(skill, /must not[\s\S]*create or modify `\.github\/workflows\/\*\*`/i);
  assert.match(skill, /ordinary Ship verification[\s\S]*does not require CI\/CD/i);
  assert.match(skill, /existing CI[\s\S]*read-only/i);
  assert.match(skill, /deployed endpoint[\s\S]*(not|required|prerequisite)/i);
  assert.match(skill, /explicitly requests?[\s\S]*(deploy|release execution)/i);
});

test('ship execution references are gated by explicit intent', async () => {
  const skill = await read('skills/showdar-ship/SKILL.md');
  const postDeploy = await read('skills/showdar-ship/references/post-deploy.md');
  const bundle = await read('bundles/release.yaml');
  const command = await read('commands/opencode/showdar/ship.md');
  assert.match(skill, /Inspect existing CI[\s\S]*without modifying it/i);
  assert.match(skill, /Only when explicit deployment or release-execution intent exists/i);
  assert.match(postDeploy, /Only load this reference when the task explicitly requests/i);
  assert.match(bundle, /delivery verification/i);
  assert.doesNotMatch(bundle, /approved execution -> post-deploy/i);
  assert.match(command, /delivery verification/i);
  assert.match(command, /do not create or modify `?\.github\/workflows\/\*\*`?/i);
});

test('test and review skills do not imply CI creation', async () => {
  for (const relative of ['skills/showdar-test/SKILL.md', 'skills/showdar-review/SKILL.md']) {
    const text = await read(relative);
    assert.doesNotMatch(text, /create or modify.*(?:GitHub Actions|CI\/CD|workflow|pipeline)/i);
    assert.doesNotMatch(text, /add.*(?:GitHub Actions|CI\/CD|workflow|pipeline)/i);
  }
});

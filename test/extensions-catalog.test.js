import test from 'node:test';
import assert from 'node:assert/strict';
import { createExtensionCatalog, getCatalogSkill, getCatalogWorkflow, resolveCatalogProfile, BUILTIN_SNAPSHOT } from '../src/extension-catalog.js';
import { SKILLS, WORKFLOW_SKILLS, PROFILES, PROFILE_ALIASES, getSkill, getWorkflow, resolveProfile } from '../src/catalog.js';

function deepFrozen(obj) {
  if (obj === null || typeof obj !== 'object') return true;
  if (!Object.isFrozen(obj)) return false;
  return Object.values(obj).every(deepFrozen);
}

test('extension catalog: built-in-only parity', () => {
  const result = createExtensionCatalog({});
  assert.ok(result.ok, 'empty catalog should succeed');
  assert.equal(result.value.skills.length, SKILLS.length);
  assert.equal(result.value.workflows.length, WORKFLOW_SKILLS.length);
  assert.ok(Object.keys(PROFILES).every(p => Array.isArray(result.value.profiles[p])));
});

test('extension catalog: deterministic snapshot (order independence)', () => {
  const packs1 = [
    { manifest: { name: 'b', version: '1.0.0', skills: [{ id: 'b/skill', path: 's' }] } },
    { manifest: { name: 'a', version: '1.0.0', skills: [{ id: 'a/skill', path: 's' }] } }
  ];
  const packs2 = [
    { manifest: { name: 'a', version: '1.0.0', skills: [{ id: 'a/skill', path: 's' }] } },
    { manifest: { name: 'b', version: '1.0.0', skills: [{ id: 'b/skill', path: 's' }] } }
  ];
  const r1 = createExtensionCatalog({ packs: packs1 });
  const r2 = createExtensionCatalog({ packs: packs2 });
  assert.ok(r1.ok && r2.ok);
  assert.deepStrictEqual(r1.value, r2.value, 'order must not affect result');
});

test('extension catalog: deep immutability', () => {
  const result = createExtensionCatalog({});
  assert.ok(deepFrozen(result.value), 'snapshot must be deeply frozen');
});

test('extension catalog: duplicate pack skill ID rejected', () => {
  const result = createExtensionCatalog({
    packs: [
      { manifest: { name: 'a', version: '1.0.0', skills: [{ id: 'x/skill', path: 's' }] } },
      { manifest: { name: 'b', version: '1.0.0', skills: [{ id: 'x/skill', path: 's' }] } }
    ]
  });
  assert.ok(!result.ok);
  assert.ok(result.errors.some(e => e.includes('duplicate skill id')));
});

test('extension catalog: duplicate workflow ID rejected', () => {
  const result = createExtensionCatalog({
    packs: [
      { manifest: { name: 'a', version: '1.0.0', skills: [], workflows: [{ id: 'x-workflow', path: 'w.json' }] }, workflows: { 'x-workflow': { description: 'A minimal custom workflow for testing purposes ok', stages: ['showdar-build'] } } },
      { manifest: { name: 'b', version: '1.0.0', skills: [], workflows: [{ id: 'x-workflow', path: 'w.json' }] }, workflows: { 'x-workflow': { description: 'A minimal custom workflow for testing purposes ok', stages: ['showdar-build'] } } }
    ]
  });
  assert.ok(!result.ok);
  assert.ok(result.errors.some(e => e.includes('duplicate workflow id')));
});

test('extension catalog: built-in skill ID collision rejected', () => {
  const result = createExtensionCatalog({
    packs: [{ manifest: { name: 'a', version: '1.0.0', skills: [{ id: 'showdar-debug', path: 's' }] } }]
  });
  assert.ok(!result.ok);
  assert.ok(result.errors.some(e => e.includes('collides with built-in')));
});

test('extension catalog: built-in workflow ID collision rejected', () => {
  const result = createExtensionCatalog({
    packs: [{ manifest: { name: 'a', version: '1.0.0', workflows: [{ id: 'showdar-feature', path: 'w.json' }] } }]
  });
  assert.ok(!result.ok);
  assert.ok(result.errors.some(e => e.includes('collides with built-in')));
});

test('extension catalog: built-in profile mutation rejected', () => {
  const result = createExtensionCatalog({
    packs: [{ manifest: { name: 'a', version: '1.0.0', profiles: { minimal: ['a/skill'] } } }]
  });
  assert.ok(!result.ok);
  assert.ok(result.errors.some(e => e.includes('collides with built-in profile')));
});

test('extension catalog: pack-local profile works', () => {
  const result = createExtensionCatalog({
    packs: [{
      manifest: { name: 'acme', version: '1.0.0', skills: [{ id: 'acme/lint', path: 's' }], profiles: { 'acme-security': ['acme/lint'] } }
    }]
  });
  assert.ok(result.ok);
  assert.ok(result.value.profiles['acme-security']);
  assert.equal(result.value.profiles['acme-security'][0], 'acme/lint');
});

test('extension catalog: project-owned profile works', () => {
  const result = createExtensionCatalog({
    projectOverrides: { profiles: { 'team-custom': ['showdar-build', 'acme/lint'] } },
    packs: [{ manifest: { name: 'acme', version: '1.0.0', skills: [{ id: 'acme/lint', path: 's' }] } }]
  });
  assert.ok(result.ok);
  assert.ok(result.value.profiles['team-custom']);
  assert.ok(result.value.profiles['team-custom'].includes('showdar-build'));
  assert.ok(result.value.profiles['team-custom'].includes('acme/lint'));
});

test('extension catalog: custom workflow override valid refinement', () => {
  const result = createExtensionCatalog({
    packs: [{
      manifest: {
        name: 'acme', version: '1.0.0',
        skills: [],
        workflows: [{ id: 'acme-release', path: 'w.json' }]
      },
      workflows: { 'acme-release': { description: 'A custom release workflow for testing purposes ok', stages: ['showdar-build', 'showdar-test'], requiredStages: ['showdar-build'] } }
    }],
    projectOverrides: {
      workflowPolicy: {
        'acme-release': { stages: ['showdar-build', 'showdar-test'], requiredStages: ['showdar-build', 'showdar-test'] }
      }
    }
  });
  assert.ok(result.ok);
  const wf = result.value.workflows.find(w => w.id === 'acme-release');
  assert.ok(wf);
  assert.deepEqual([...result.value.selectableStages['acme-release']].sort(), ['showdar-build', 'showdar-test'].sort());
  assert.deepEqual([...result.value.requiredStages['acme-release']].sort(), ['showdar-build', 'showdar-test'].sort());
});

test('extension catalog: protected built-in workflow policy override rejected', () => {
  const result = createExtensionCatalog({
    projectOverrides: {
      workflowPolicy: { 'showdar-feature': { stages: ['showdar-build'] } }
    }
  });
  assert.ok(!result.ok);
  assert.ok(result.errors.some(e => e.includes('MUST NOT change built-in workflow')));
});

test('extension catalog: no module-global state leakage', () => {
  const r1 = createExtensionCatalog({ packs: [{ manifest: { name: 'a', version: '1.0.0', skills: [{ id: 'a/skill', path: 's' }] } }] });
  const r2 = createExtensionCatalog({ packs: [{ manifest: { name: 'b', version: '1.0.0', skills: [{ id: 'b/skill', path: 's' }] } }] });
  assert.ok(r1.ok && r2.ok);
  assert.equal(r1.value.skills.find(s => s.id === 'a/skill')?.pack, 'a');
  assert.equal(r2.value.skills.find(s => s.id === 'b/skill')?.pack, 'b');
});

test('extension catalog: getCatalogSkill respects overrides', () => {
  const cat = createExtensionCatalog({
    projectOverrides: { skillDescriptions: { 'showdar-debug': 'Custom debug description' }, skillDomains: { 'showdar-debug': 'custom-domain' } }
  }).value;
  const skill = getCatalogSkill(cat, 'showdar-debug');
  assert.equal(skill.description, 'Custom debug description');
  assert.equal(skill.domain, 'custom-domain');
});

test('extension catalog: getCatalogWorkflow returns custom workflow', () => {
  const cat = createExtensionCatalog({
    packs: [{
      manifest: { name: 'acme', version: '1.0.0', skills: [], workflows: [{ id: 'acme-release', path: 'w.json' }] },
      workflows: { 'acme-release': { description: 'A custom release workflow for testing purposes ok', stages: ['showdar-build'] } }
    }]
  }).value;
  const wf = getCatalogWorkflow(cat, 'acme-release');
  assert.ok(wf);
  assert.equal(wf.id, 'acme-release');
  assert.equal(wf.kind, 'custom-workflow');
});

test('extension catalog: resolveCatalogProfile prefers project > pack > built-in', () => {
  const cat = createExtensionCatalog({
    packs: [{ manifest: { name: 'acme', version: '1.0.0', skills: [{ id: 'acme/lint', path: 's' }], profiles: { 'acme-security': ['acme/lint'] } } }],
    projectOverrides: { profiles: { 'team-custom': ['showdar-build'] } }
  }).value;
  const projectProfile = resolveCatalogProfile(cat, 'team-custom');
  assert.ok(projectProfile.includes('showdar-build'));
  const packProfile = resolveCatalogProfile(cat, 'acme-security');
  assert.ok(packProfile.includes('acme/lint'));
  const builtinProfile = resolveCatalogProfile(cat, 'minimal');
  assert.ok(builtinProfile.length > 0);
});

test('extension catalog: built-in snapshot unchanged when no extensions', () => {
  const cat = createExtensionCatalog({}).value;
  assert.deepEqual(cat.skills.map(s => s.id).sort(), SKILLS.map(s => s.id).sort());
  assert.deepEqual(cat.workflows.map(w => w.id).sort(), WORKFLOW_SKILLS.map(w => w.id).sort());
  assert.deepEqual(Object.keys(cat.profiles).sort(), Object.keys(PROFILES).sort());
});
import test from 'node:test';
import assert from 'node:assert/strict';
import { validatePackManifest, validateCustomWorkflowDoc, validateProjectOverridesDoc, validatePackSkillId, validateCustomWorkflowId, validateBuiltinSkillId, validateDomain, validateDomains, validatePackSkillRef, containsForbiddenAuthorityKey, validatePack } from '../src/validate-pack.js';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';

test('validation: valid pack manifest', () => {
  const manifest = { name: 'acme', version: '1.0.0', description: 'Test pack', skills: [{ id: 'acme/lint', path: 'skills/acme-lint', description: 'Lint skill', domains: ['code-quality'] }] };
  const result = validatePackManifest(manifest);
  assert.ok(result.ok, JSON.stringify(result.errors));
});

test('validation: invalid pack manifest - missing name', () => {
  const result = validatePackManifest({ version: '1.0.0', skills: [] });
  assert.ok(!result.ok);
});

test('validation: pack manifest rejects content-hash field', () => {
  const result = validatePackManifest({ name: 'a', version: '1.0.0', skills: [], hash: 'abc' });
  assert.ok(!result.ok);
  assert.ok(result.errors.some(e => e.includes('MUST NOT contain a content hash')));
});

test('validation: malformed pack skill namespace rejected', () => {
  const result = validatePackManifest({ name: 'a', version: '1.0.0', skills: [{ id: 'showdar-lint', path: 's' }] });
  assert.ok(!result.ok);
  assert.ok(result.errors.some(e => e.includes('must match vendor/skill grammar')));
});

test('validation: pack skill with built-in suffix accepted (collision checked at catalog time)', () => {
  const result = validatePackManifest({ name: 'a', version: '1.0.0', skills: [{ id: 'acme/showdar-debug', path: 's' }] });
  assert.ok(result.ok);
});

test('validation: malformed custom workflow namespace rejected', () => {
  const result = validateCustomWorkflowDoc({ id: 'showdar-release', description: 'test description long enough', stages: ['showdar-build'] });
  assert.ok(Array.isArray(result) && result.length > 0);
  assert.ok(result.some(e => e.includes('never showdar-*')));
});

test('validation: built-in namespace spoof rejected', () => {
  assert.equal(validateBuiltinSkillId('showdar-debug'), true);
  assert.equal(validateBuiltinSkillId('showdar-fake'), true);
  assert.equal(validateBuiltinSkillId('debug'), false);
  assert.equal(validateBuiltinSkillId('Showdar-Debug'), false);
});

test('validation: pack skill namespace validation', () => {
  assert.equal(validatePackSkillId('acme/lint'), true);
  assert.equal(validatePackSkillId('showdar/lint'), false);
  assert.equal(validatePackSkillId('a/'), false);
  assert.equal(validatePackSkillId('acme.lint'), false);
});

test('validation: custom workflow namespace validation', () => {
  assert.equal(validateCustomWorkflowId('acme-release'), true);
  assert.equal(validateCustomWorkflowId('showdar-release'), false);
  assert.equal(validateCustomWorkflowId('acme/release'), false);
});

test('validation: malformed domains rejected', () => {
  const result = validateDomains(['Mobile Dev'], 'domains');
  assert.ok(!result.includes(''));
  assert.ok(result.some(e => e.includes('invalid domain')));
});

test('validation: duplicate domains rejected', () => {
  const result = validateDomains(['code-quality', 'code-quality'], 'domains');
  assert.ok(result.some(e => e.includes('duplicates')));
});

test('validation: >8 domains rejected', () => {
  const result = validateDomains(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'], 'domains');
  assert.ok(result.some(e => e.includes('at most 8')));
});

test('validation: traversal path rejected', () => {
  const result = validatePackSkillRef({ id: 'acme/lint', path: '../evil' }, 'skills');
  assert.ok(result.some(e => e.includes('unsafe')));
});

test('validation: absolute path rejected', () => {
  const result = validatePackSkillRef({ id: 'acme/lint', path: '/absolute/path' }, 'skills');
  assert.ok(result.some(e => e.includes('unsafe')));
});

test('validation: recursive forbidden authority key rejected', () => {
  const hit = containsForbiddenAuthorityKey({ a: { b: { primaryCapability: 1 } } });
  assert.ok(hit && hit.includes('primaryCapability'));
});

test('validation: nested authorizedAction rejected', () => {
  const hit = containsForbiddenAuthorityKey({ x: { authorizedAction: 'x' } });
  assert.ok(hit && hit.includes('authorizedAction'));
});

test('validation: nested mutationPermission rejected', () => {
  const hit = containsForbiddenAuthorityKey({ arr: [{ mutationPermission: true }] });
  assert.ok(hit && hit.includes('mutationPermission'));
});

test('validation: nested routeAuthority rejected', () => {
  const hit = containsForbiddenAuthorityKey({ deep: { routeAuthority: 123 } });
  assert.ok(hit && hit.includes('routeAuthority'));
});

test('validation: nested primaryCapability rejected', () => {
  const hit = containsForbiddenAuthorityKey({ payload: { primaryCapability: 'x' } });
  assert.ok(hit && hit.includes('primaryCapability'));
});

test('validation: ordinary prose with authority words NOT rejected', () => {
  const prose = { description: 'This feature provides authorization for user actions without mutation permission' };
  const hit = containsForbiddenAuthorityKey(prose);
  assert.equal(hit, null);
});

test('validation: built-in workflow semantic override rejected', () => {
  const result = validateProjectOverridesDoc({ workflowPolicy: { 'showdar-feature': { stages: ['showdar-build'] } } });
  assert.ok(!result.ok);
  assert.ok(result.errors.some(e => e.includes('MUST NOT change built-in workflow')));
});

test('validation: built-in profile mutation rejected', () => {
  const result = validateProjectOverridesDoc({ profiles: { minimal: ['showdar-build'] } });
  assert.ok(!result.ok);
  assert.ok(result.errors.some(e => e.includes('MUST NOT mutate built-in profile')));
});

test('validation: valid project override accepted', () => {
  const result = validateProjectOverridesDoc({
    skillDescriptions: { 'showdar-debug': 'Custom desc' },
    skillDomains: { 'showdar-build': 'custom-domain' },
    workflowPolicy: { 'acme-release': { stages: ['showdar-build'] } },
    guidance: { 'showdar-feature': 'Our guidance' },
    profiles: { 'team-custom': ['showdar-build'] }
  });
  assert.ok(result.ok);
});

test('validation: pack manifest rejects built-in profile in pack profiles', () => {
  const result = validatePackManifest({ name: 'a', version: '1.0.0', skills: [], profiles: { minimal: ['a/skill'] } });
  assert.ok(!result.ok);
  assert.ok(result.errors.some(e => e.includes('collides with built-in profile')));
});

test('validation: pack profile references only pack-owned IDs', () => {
  const result = validatePackManifest({ name: 'a', version: '1.0.0', skills: [{ id: 'a/x', path: 's' }], profiles: { p: ['a/x', 'showdar-build'] } });
  assert.ok(!result.ok);
  assert.ok(result.errors.some(e => e.includes('non-pack-owned id')));
});

test('validation: project override profile accepts unknown pack skill ID format', () => {
  const result = validateProjectOverridesDoc({ profiles: { p: ['unknown/skill'] } });
  assert.ok(result.ok);
});

test('validation: project override profile rejects built-in profile mutation', () => {
  const result = validateProjectOverridesDoc({ profiles: { minimal: ['showdar-build'] } });
  assert.ok(!result.ok);
  assert.ok(result.errors.some(e => e.includes('MUST NOT mutate built-in profile')));
});

test('validation: custom workflow stages must be built-in primitives', () => {
  const result = validateCustomWorkflowDoc({ id: 'acme-test', description: 'A test workflow description ok', stages: ['acme/custom'] });
  assert.ok(Array.isArray(result) && result.length > 0);
  assert.ok(result.some(e => e.includes('built-in primitive skill id')));
});

test('validation: custom workflow skip reason must be canonical', () => {
  const result = validateCustomWorkflowDoc({
    id: 'acme-test', description: 'A test workflow description ok',
    stages: ['showdar-build'],
    allowedSkips: [{ stage: 'showdar-build', reason: 'not-a-real-reason', policy: 'adaptive-skip', evidence: [] }]
  });
  assert.ok(Array.isArray(result) && result.length > 0);
  assert.ok(result.some(e => e.includes('must be one of')));
});

test('validation: custom workflow completion policy must be all true', () => {
  const result = validateCustomWorkflowDoc({
    id: 'acme-test', description: 'A test workflow description ok',
    stages: ['showdar-build'],
    completionPolicy: { allSelectedStagesAccounted: true, noBlockers: true, requiredVerificationSatisfied: true, noNegativeEvidence: false }
  });
  assert.ok(!result.ok);
});

test('validation: pack skill path traversal rejected', () => {
  const result = validatePackManifest({ name: 'a', version: '1.0.0', skills: [{ id: 'a/b', path: '../../etc/passwd' }] });
  assert.ok(!result.ok);
});
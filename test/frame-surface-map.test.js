import assert from 'node:assert/strict';
import { SURFACE_TO_CAPABILITY, lookupSurfaceOperation } from '../src/intent-resolver/frame/surface-map.js';

function testRepresentativeTrace() {
  assert.equal(lookupSurfaceOperation('trace').canonicalAction, 'understand');
}

function testRepresentativePush() {
  assert.equal(lookupSurfaceOperation('push').canonicalAction, 'git');
}

function testRepresentativeDefine() {
  assert.equal(lookupSurfaceOperation('define').canonicalAction, 'define');
}

function testSeedEntries() {
  const cases = [
    ['map', 'understanding', 'understand'],
    ['trace', 'understanding', 'understand'],
    ['explain', 'understanding', 'understand'],
    ['commit', 'git-op', 'git'],
    ['rebase', 'git-op', 'git'],
    ['push', 'git-op', 'git'],
    ['merge', 'git-op', 'git'],
    ['run', 'testing', 'test'],
    ['execute', 'testing', 'test'],
    ['test-suite', 'testing', 'test'],
    ['audit', 'assessment', 'assess'],
    ['threat-model', 'assessment', 'assess'],
    ['define', 'requirements', 'define'],
    ['specify', 'requirements', 'define'],
    ['deploy', 'deployment', 'deploy'],
    ['promote', 'deployment', 'deploy'],
    ['rollout', 'deployment', 'deploy'],
    ['recover', 'recovery', 'recover'],
    ['resume', 'recovery', 'recover'],
  ];
  for (const [phrase, semanticCapability, canonicalAction] of cases) {
    const result = lookupSurfaceOperation(phrase);
    assert.deepEqual(
      result,
      { surfaceVerb: phrase, semanticCapability, canonicalAction },
      `lookupSurfaceOperation('${phrase}')`,
    );
  }
}

function testClosedSetUnknownReturnsNull() {
  assert.equal(lookupSurfaceOperation('frobnicate'), null);
  assert.equal(lookupSurfaceOperation('delete'), null);
  assert.equal(lookupSurfaceOperation(''), null);
  assert.equal(lookupSurfaceOperation('  '), null);
}

function testNormalization() {
  assert.equal(lookupSurfaceOperation('  Push  ').canonicalAction, 'git');
  assert.equal(lookupSurfaceOperation('TRACE').canonicalAction, 'understand');
}

function testMapIsFrozen() {
  assert.ok(Object.isFrozen(SURFACE_TO_CAPABILITY));
}

function testNoSkillOwnership() {
  for (const verb of Object.keys(SURFACE_TO_CAPABILITY)) {
    const serialized = JSON.stringify(lookupSurfaceOperation(verb));
    assert.ok(!serialized.includes('showdar-'), `surface vocabulary must not decide skill ownership (${verb})`);
  }
}

function runAll() {
  testRepresentativeTrace();
  testRepresentativePush();
  testRepresentativeDefine();
  testSeedEntries();
  testClosedSetUnknownReturnsNull();
  testNormalization();
  testMapIsFrozen();
  testNoSkillOwnership();
  console.log('All surface-map tests passed');
}

runAll();

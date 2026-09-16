import assert from 'node:assert/strict';
import { extractCandidates } from '../src/intent-resolver/frame/authority/candidate.js';

function testBasicExtraction() {
  const clauses = [{ id: 'c0', text: 'Repair the checkout total' }];
  const c = extractCandidates(clauses);
  assert.equal(c.length, 1);
  assert.equal(c[0].kind, 'ActionCandidate');
  assert.equal(c[0].capability, 'implementation');
  assert.deepEqual(Object.keys(c[0]).sort(), ['capability', 'clauseId', 'environment', 'kind', 'surface', 'target']);
  assert.equal(c[0].target, 'checkout');
  assert.equal(c[0].clauseId, 'c0');
  assert.equal(c[0].surface, 'repair');
  assert.equal(c[0].environment, 'unspecified');
  // Authority-free: no commitment, mutation, role, authority fields
  assert.ok(!('commitment' in c[0]));
  assert.ok(!('mutation' in c[0]));
  assert.ok(!('role' in c[0]));
  assert.ok(!('authority' in c[0]));
  assert.ok(!('provenance' in c[0]));
  assert.ok(!('polarity' in c[0]));
  // Record is frozen
  assert.ok(Object.isFrozen(c[0]));
}

function testUnknownSurfaceYieldsUnknownCapability() {
  const clauses = [{ id: 'c0', text: 'Florp the wobblewidget' }];
  const u = extractCandidates(clauses);
  assert.equal(u.length, 1);
  assert.equal(u[0].capability, 'unknown');
  assert.equal(u[0].target, null);
  assert.equal(u[0].clauseId, 'c0');
  assert.equal(u[0].surface, 'unknown');
  assert.equal(u[0].environment, 'unspecified');
  assert.ok(Object.isFrozen(u[0]));
}

function testBareNounClauseNoVerbYieldsUnknown() {
  // Noun-collision guard: bare domain noun without governing action verb
  const clauses = [{ id: 'c0', text: 'the event pipeline status' }];
  const c = extractCandidates(clauses);
  assert.equal(c.length, 1);
  assert.equal(c[0].capability, 'unknown');
  assert.ok(Object.isFrozen(c[0]));
}

function testMultiClausePreservesClauseId() {
  const clauses = [
    { id: 'c0', text: 'Fix the login bug' },
    { id: 'c1', text: 'Deploy to staging' },
    { id: 'c2', text: 'Verify the fix' },
  ];
  const candidates = extractCandidates(clauses);
  assert.equal(candidates.length, 3);
  assert.equal(candidates[0].clauseId, 'c0');
  assert.equal(candidates[1].clauseId, 'c1');
  assert.equal(candidates[2].clauseId, 'c2');
  assert.equal(candidates[0].capability, 'implementation');
  assert.equal(candidates[1].capability, 'deployment');
  assert.equal(candidates[2].capability, 'testing');
  candidates.forEach(c => assert.ok(Object.isFrozen(c)));
}

function testEnvironmentMentionedButUnvalidated() {
  // Environment token extracted lexically but unvalidated - no authority meaning
  const clauses = [
    { id: 'c0', text: 'Deploy to production' },
    { id: 'c1', text: 'Test in staging' },
    { id: 'c2', text: 'Run locally' },
    { id: 'c3', text: 'Push remote' },
  ];
  const candidates = extractCandidates(clauses);
  assert.equal(candidates[0].environment, 'production');
  assert.equal(candidates[1].environment, 'staging');
  assert.equal(candidates[2].environment, 'local');
  assert.equal(candidates[3].environment, 'remote');
  // Unknown capability with production mention stays unknown - no authority
  const u = extractCandidates([{ id: 'c0', text: 'Florp production' }]);
  assert.equal(u[0].capability, 'unknown');
  assert.equal(u[0].environment, 'production');
  assert.ok(Object.isFrozen(u[0]));
}

function testVariousActionVerbs() {
  const cases = [
    ['map the api', 'understanding'],
    ['analyze the code', 'understanding'],
    ['explain the feature', 'understanding'],
    ['define the requirements', 'requirements'],
    ['plan the rollout', 'planning'],
    ['design the ui', 'design'],
    ['implement the feature', 'implementation'],
    ['fix the bug', 'implementation'],
    ['investigate the crash', 'diagnosis'],
    ['test the api', 'testing'],
    ['review the code', 'verification'],
    ['upgrade the dependency', 'implementation'],
    ['assess the risk', 'assessment'],
    ['deploy the app', 'deployment'],
    ['recover the data', 'recovery'],
    ['commit the changes', 'git-op'],
  ];
  for (const [text, expectedCapability] of cases) {
    const c = extractCandidates([{ id: 'c0', text }]);
    assert.equal(c[0].capability, expectedCapability, `capability for "${text}"`);
    assert.ok(Object.isFrozen(c[0]));
  }
}

function testGerundAndStemMatching() {
  // Gerunds and past tense should map via stem
  const cases = [
    ['fixing the bug', 'implementation'],
    ['deploying the app', 'deployment'],
    ['fixed the bug', 'implementation'],
    ['deployed the app', 'deployment'],
    ['testing the api', 'testing'],
  ];
  for (const [text, expectedCapability] of cases) {
    const c = extractCandidates([{ id: 'c0', text }]);
    assert.equal(c[0].capability, expectedCapability, `capability for "${text}"`);
  }
}

function testNgramMatching() {
  // Multi-word phrases should match ngrams
  const cases = [
    ['run tests', 'testing'],
    ['run test suite', 'testing'],
    ['push to production', 'git-op'],
    ['run production', 'deployment'],
    ['root cause', 'diagnosis'],
    ['threat model', 'assessment'],
  ];
  for (const [text, expectedCapability] of cases) {
    const c = extractCandidates([{ id: 'c0', text }]);
    assert.equal(c[0].capability, expectedCapability, `capability for "${text}"`);
  }
}

function testTargetExtraction() {
  const cases = [
    ['Fix the login bug', 'login'],
    ['Deploy the api', 'api'],
    ['Check the config', 'config'],
    ['Review the pull request', 'request'],
  ];
  for (const [text, expectedTarget] of cases) {
    const c = extractCandidates([{ id: 'c0', text }]);
    assert.equal(c[0].target, expectedTarget, `target for "${text}"`);
  }
}

function testNoTargetWhenNoMatch() {
  const c = extractCandidates([{ id: 'c0', text: 'Fix it' }]);
  assert.equal(c[0].target, null);
}

function runAll() {
  testBasicExtraction();
  testUnknownSurfaceYieldsUnknownCapability();
  testBareNounClauseNoVerbYieldsUnknown();
  testMultiClausePreservesClauseId();
  testEnvironmentMentionedButUnvalidated();
  testVariousActionVerbs();
  testGerundAndStemMatching();
  testNgramMatching();
  testTargetExtraction();
  testNoTargetWhenNoMatch();
  console.log('All authority-candidate tests passed');
}

runAll();
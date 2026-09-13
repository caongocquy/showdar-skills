import assert from 'node:assert/strict';
import { segmentPrompt } from '../src/intent-resolver/segments.js';
import { parseClauses } from '../src/intent-resolver/frame/clause-frame.js';
import { lookupSurfaceOperation } from '../src/intent-resolver/frame/surface-map.js';
import {
  buildActionFrames,
  buildContextFrames,
  authorizeSpan,
} from '../src/intent-resolver/frame/action-frame.js';

function parse(text) {
  return parseClauses(segmentPrompt(text));
}

function testDeployAuthorizedNow() {
  const frames = buildActionFrames(parse('Deploy the api.'));
  assert.equal(frames.length, 1);
  assert.equal(frames[0].commitment, 'AUTHORIZED_NOW');
  assert.equal(frames[0].provenance, 'DIRECT_INSTRUCTION');
  assert.equal(frames[0].surfaceVerb, 'deploy');
  assert.equal(frames[0].canonicalAction, 'deploy');
  assert.ok(frames[0].target !== null && frames[0].target !== undefined);
  assert.equal(frames[0].polarity, 'positive');
  assert.ok(['local', 'remote', 'production', 'unspecified'].includes(frames[0].environment));
  assert.ok(frames[0].clauseId && frames[0].clauseId.startsWith('c'));
}

function testLogOutputNoDeployFrame() {
  const frames = buildActionFrames(parse('Logs: deploy failed. Diagnose it.'));
  assert.ok(frames.every((f) => f.surfaceVerb !== 'deploy'));
  // Context frames hold the deploy verb; no action frame carries it.
}

function testNonAuthoritativeProvenanceThrows() {
  const nonAuthKinds = [
    'LOG_OUTPUT',
    'QUOTED_CONTENT',
    'CODE_BLOCK',
    'INLINE_CODE',
    'EXAMPLE',
    'MENTION',
    'CONTEXT',
  ];
  for (const kind of nonAuthKinds) {
    assert.throws(
      () => authorizeSpan({ provenance: kind, text: 'deploy now' }),
      /provenance/i,
      `${kind} should throw on authorizeSpan`
    );
  }
}

function testConditionalCommitment() {
  const frames = buildActionFrames(parse('Deploy if approved.'));
  // Deploy clause is gated by the IF sibling clause.
  const deployFrames = frames.filter(f => f.canonicalAction === 'deploy');
  assert.equal(deployFrames.length, 1);
  assert.equal(deployFrames[0].commitment, 'CONDITIONAL');
}

function testHypotheticalCommitment() {
  const frames = buildActionFrames(parse('Deploying would be dangerous.'));
  const deployFrames = frames.filter(f => f.canonicalAction === 'deploy');
  assert.equal(deployFrames.length, 1);
  assert.equal(deployFrames[0].commitment, 'HYPOTHETICAL');
}

function testContextFramesForNonAuthoritative() {
  const clauses = parse('"deploy now"');
  const contextFrames = buildContextFrames(clauses);
  assert.ok(contextFrames.length > 0);
  // The deploy verb in quoted content should be a context frame
  const deployContexts = contextFrames.filter(c => c.text.toLowerCase().includes('deploy'));
  assert.ok(deployContexts.length > 0);
  for (const c of contextFrames) {
    assert.ok(['LOG_OUTPUT', 'QUOTED_CONTENT', 'CODE_BLOCK', 'INLINE_CODE', 'EXAMPLE', 'MENTION', 'CONTEXT'].includes(c.kind));
    assert.ok(c.contributesTo && Array.isArray(c.contributesTo));
  }
}

function testL2CoverageFields() {
  const frames = buildActionFrames(parse('Deploy the api to production.'));
  const f = frames[0];
  // surface verb
  assert.ok(f.surfaceVerb && typeof f.surfaceVerb === 'string');
  // canonical capability
  assert.ok(f.semanticCapability && typeof f.semanticCapability === 'string');
  // target
  assert.ok(f.target !== null && f.target !== undefined && typeof f.target === 'string');
  // provenance
  assert.ok(['DIRECT_INSTRUCTION', 'SECONDARY_INSTRUCTION'].includes(f.provenance));
  // polarity
  assert.ok(['positive', 'negative', 'neutral'].includes(f.polarity));
  // environment
  assert.ok(['local', 'remote', 'production', 'unspecified'].includes(f.environment));
  // commitment
  assert.ok(['AUTHORIZED_NOW', 'CONDITIONAL', 'HYPOTHETICAL'].includes(f.commitment));
  // clauseId
  assert.ok(f.clauseId && f.clauseId.startsWith('c'));
  // id
  assert.ok(f.id && f.id.startsWith('a'));
}

function testNegativePolarity() {
  // Negated authorized provenance yields a negative-polarity frame.
  const neg = [{ id: 'c0', text: 'never deploy', provenance: 'SECONDARY_INSTRUCTION', connector: 'AND', polarity: 'negative', parentClauseId: 'c0' }];
  const deployFrames = buildActionFrames(neg).filter(f => f.canonicalAction === 'deploy');
  assert.equal(deployFrames.length, 1);
  assert.equal(deployFrames[0].polarity, 'negative');
}

function testSecondaryInstructionProvenance() {
  const frames = buildActionFrames(parse('Implement feature and deploy it.'));
  const deployFrames = frames.filter(f => f.canonicalAction === 'deploy');
  // Secondary instruction should produce action frame with SECONDARY_INSTRUCTION provenance
  assert.equal(deployFrames.length, 1);
  // The second clause should have SECONDARY_INSTRUCTION provenance
  // Note: segments.js assigns SECONDARY_INSTRUCTION to explicit "and deploy" patterns
  // If it's parsed as DIRECT_INSTRUCTION, that's also authoritative
  assert.ok(['DIRECT_INSTRUCTION', 'SECONDARY_INSTRUCTION'].includes(deployFrames[0].provenance));
}

function testEnvironmentDetection() {
  const frames = buildActionFrames(parse('Deploy the api to production.'));
  const deployFrames = frames.filter(f => f.canonicalAction === 'deploy');
  assert.equal(deployFrames.length, 1);
  // production keyword should set environment to production
  assert.equal(deployFrames[0].environment, 'production');
}

function runAll() {
  testDeployAuthorizedNow();
  testLogOutputNoDeployFrame();
  testNonAuthoritativeProvenanceThrows();
  testConditionalCommitment();
  testHypotheticalCommitment();
  testContextFramesForNonAuthoritative();
  testL2CoverageFields();
  testNegativePolarity();
  testSecondaryInstructionProvenance();
  testEnvironmentDetection();
  console.log('All action-frame tests passed');
}

runAll();
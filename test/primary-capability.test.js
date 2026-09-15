import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveIntentFromPrompt } from '../src/intent-resolver.js';
import { projectPrimary } from '../src/intent-resolver/frame/projectors/primary.js';
import { segmentPrompt } from '../src/intent-resolver/segments.js';
import { parseClauses } from '../src/intent-resolver/frame/clause-frame.js';
import { buildActionFrames } from '../src/intent-resolver/frame/action-frame.js';
import { resolveRelations } from '../src/intent-resolver/frame/relations.js';
import { buildThinRoutePlan, buildRoutePlan } from '../src/route-plan.js';

function capabilityOf(prompt) {
  const segments = segmentPrompt(prompt);
  const clauses = parseClauses(segments);
  const frames = buildActionFrames(clauses);
  resolveRelations(frames, clauses);
  return projectPrimary({ actions: frames, relations: [], clauses, contexts: [], constraints: [] });
}

function routed(prompt) {
  const r = resolveIntentFromPrompt(prompt);
  return {
    phase: r.intent.phase,
    action: r.intent.action,
    capability: r.resolverMeta.routing.primaryCapability,
    primary: r.primary.skill,
    intentKeys: Object.keys(r.intent),
  };
}

// 1. generic review → review capability → showdar-review
test('generic review routes via review capability', () => {
  const r = routed('Review this code for correctness');
  assert.equal(r.capability, 'review');
  assert.equal(r.primary, 'showdar-review');
  assert.equal(r.phase, 'verification');
  assert.equal(r.action, 'review');
});

// 2. explicit security review → security-assessment capability → showdar-security
test('explicit security review routes via security-assessment capability', () => {
  const r = routed('Review this webhook for security vulnerabilities');
  assert.equal(r.capability, 'security-assessment');
  assert.equal(r.primary, 'showdar-security');
  // Public Intent projection is unchanged: still verification/review.
  assert.equal(r.phase, 'verification');
  assert.equal(r.action, 'review');
});

// 3. auth-domain generic review → review capability → showdar-review
test('auth-domain generic review stays review capability', () => {
  const r = routed('Review this auth code but do not change anything');
  assert.equal(r.capability, 'review');
  assert.equal(r.primary, 'showdar-review');
});

// 4. OAuth implementation + security risk → implement capability → showdar-build
test('OAuth implementation with security risk stays implement capability', () => {
  const r = routed('Implement OAuth login according to approved acceptance criteria');
  assert.equal(r.capability, 'implement');
  assert.equal(r.primary, 'showdar-build');
});

// 4b. audit security → security-assessment capability → showdar-security, read-only
test('audit security routes via security-assessment capability', () => {
  const r = routed("Audit security, don't patch anything");
  assert.equal(r.capability, 'security-assessment');
  assert.equal(r.primary, 'showdar-security');
  assert.equal(r.phase, 'discovery');
  assert.equal(r.action, 'assess');
});

// 5. identical governing frame with changed risks → same primaryCapability
test('primaryCapability is invariant under risks/object changes', () => {
  const base = { actions: [{ id: 'a0', surfaceVerb: 'implement', semanticCapability: 'implementation', canonicalAction: 'implement', target: 'api', provenance: 'DIRECT_INSTRUCTION', polarity: 'positive', role: 'GOVERNING', commitment: 'AUTHORIZED_NOW', environment: 'unspecified', clauseId: 'c0' }], relations: [], clauses: [], contexts: [], constraints: [] };
  const withRisks = { ...base, risks: ['security', 'production'], object: 'other' };
  assert.deepEqual(projectPrimary(withRisks), projectPrimary(base));
  assert.equal(projectPrimary(base).primaryCapability, 'implement');
});

// 6. structural runtime does not invoke PRIMARY_SELECTION_RULES:
// the thin capability path ignores risks that the legacy rule path would use
// to override ownership.
test('thin capability path ignores risk-based ownership override', () => {
  const intent = { phase: 'verification', action: 'review', object: 'repository', secondaryActions: [], risks: ['security'], mutation: 'read-only', evidence: {} };
  // Legacy path: security risk + verification/review overrides to security.
  assert.equal(buildRoutePlan(intent).primary.skill, 'showdar-security');
  // Structural path with review capability: stays review despite the risk.
  assert.equal(buildThinRoutePlan(intent, { primaryCapability: 'review' }).primary.skill, 'showdar-review');
  // Structural path with security-assessment capability: security via capability.
  assert.equal(buildThinRoutePlan(intent, { primaryCapability: 'security-assessment' }).primary.skill, 'showdar-security');
});

// 7. resolverMeta carries capability; public intent never contains it.
test('resolverMeta carries capability; public intent stays clean', () => {
  const r = resolveIntentFromPrompt('Review this webhook for security vulnerabilities');
  assert.equal(r.resolverMeta.routing.primaryCapability, 'security-assessment');
  const keys = Object.keys(r.intent);
  assert.ok(!keys.includes('primaryCapability'));
  assert.ok(!keys.includes('resolverMeta'));
});

// 8. capability derives from governing frame fields only (no risk/object read):
// projectPrimary source contains no risk/object/evidence imports or reads.
test('primary projector has no risk/object authority path', async () => {
  const { readFileSync } = await import('node:fs');
  const { fileURLToPath } = await import('node:url');
  const { dirname, join } = await import('node:path');
  const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'intent-resolver', 'frame', 'projectors', 'primary.js'), 'utf8');
  assert.ok(!src.includes('metadata.js'), 'must not import metadata projector');
  assert.ok(!src.includes('intent.risks') && !src.includes('.risks'), 'must not read risks');
  assert.ok(!src.includes('PRIMARY_SELECTION_RULES'), 'must not reference route selection rules');
});

// 9. threat-model verb produces security-assessment capability directly.
test('threat model routes via security-assessment capability', () => {
  const r = routed('Threat model the OAuth authorization flow');
  assert.equal(r.capability, 'security-assessment');
  assert.equal(r.primary, 'showdar-security');
});

// 10. auth-diff security review: explicit scope beats domain coincidence.
test('auth diff security review routes via security-assessment capability', () => {
  const r = routed('Review this auth diff specifically for authorization vulnerabilities');
  assert.equal(r.capability, 'security-assessment');
  assert.equal(r.primary, 'showdar-security');
  assert.equal(r.phase, 'verification');
  assert.equal(r.action, 'review');
});

// 11. structural runtime never consults legacy ownership: on a prompt where
// legacy and structural disagree, the structural result follows the thin
// capability table and carries no legacy authority.
test('structural runtime bypasses legacy ownership machinery', () => {
  const r = resolveIntentFromPrompt('Review this webhook for security vulnerabilities');
  assert.equal(r.meta.usesLegacyAuthority, false);
  assert.equal(r.primary.skill, 'showdar-security');
  assert.equal(r.resolverMeta.routing.primaryCapability, 'security-assessment');
  // Legacy machinery on the same intent would also say security here (risk
  // rule), so prove the bypass on a diverging case instead: review capability
  // with a security risk must stay review on the structural path.
  const intent = { phase: 'verification', action: 'review', object: 'repository', secondaryActions: [], risks: ['security'], mutation: 'read-only', evidence: {} };
  assert.equal(buildRoutePlan(intent).primary.skill, 'showdar-security');
  assert.equal(buildThinRoutePlan(intent, { primaryCapability: 'review' }).primary.skill, 'showdar-review');
});

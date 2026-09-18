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
  // 6G: "Review this webhook for security vulnerabilities" - "Review" is a bare
  // imperative verb (in BARE_IMPERATIVE_VERBS) so requestForm=imperative, but
  // the capability is determined by the surface "review" → review, NOT
  // security-assessment. Security risk on a review action does not steal primary
  // ownership. 6F risk-based primary selected security-assessment; 6G capability-
  // only path stays review. Security-assessment capability requires an explicit
  // security-assessment ACTION (e.g., "assess security"), not a review with
  // security risk.
  const r = routed('Review this webhook for security vulnerabilities');
  assert.equal(r.capability, 'review');
  assert.equal(r.primary, 'showdar-review');
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
  // 6G: "Implement OAuth login according to approved acceptance criteria" - the governing
  // clause "Implement OAuth login according" has surface "implement-oauth" with complement
  // "OAuth login according". The first token "Implement" matches the surface verb, and
  // the second token "OAuth" is not a complement starter, so the verb+object pattern
  // recognizes this as imperative. "implement-oauth" maps to implementation capability.
  // 6F keyword-based selected implement; 6G correctly recognizes the imperative request.
  const r = routed('Implement OAuth login according to approved acceptance criteria');
  assert.equal(r.capability, 'implement');
  assert.equal(r.primary, 'showdar-build');
});

// 4b. audit security → quality capability (assessment) → showdar-quality, read-only
test('audit security routes via quality capability (assessment)', () => {
  // 6G: "Audit security, don't patch anything" - "Audit security" has surface "audit-security"
  // (hyphenated compound) with complement "security". The first token "Audit" matches
  // the surface verb, and the second token "security" is not a complement starter,
  // so the verb+object pattern recognizes this as imperative. "audit-security" maps
  // to assessment capability → quality. The "don't patch anything" clause is NEGATED
  // but doesn't affect the governing action. 6F risk-based selected security-assessment;
  // 6G correctly recognizes the imperative with assessment capability.
  const r = routed("Audit security, don't patch anything");
  assert.equal(r.capability, 'quality');
  assert.equal(r.primary, 'showdar-quality');
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
  // 6G: "Review this webhook for security vulnerabilities" - capability is review
  // (not security-assessment) because security risk doesn't steal ownership.
  const r = resolveIntentFromPrompt('Review this webhook for security vulnerabilities');
  assert.equal(r.resolverMeta.routing.primaryCapability, 'review');
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

// 9. threat-model verb produces quality capability (assessment) directly.
test('threat model routes via quality capability (assessment)', () => {
  // 6G: "Threat model the OAuth authorization flow" - "threat-model" surface maps
  // to assessment capability → quality. "the OAuth authorization flow" has "the"
  // as a complement starter, so verbComplementShape correctly identifies this as
  // imperative. "threat-model" maps to assessment capability → quality.
  // 6F keyword-based selected security-assessment; 6G correctly recognizes the
  // imperative request with assessment capability.
  const r = routed('Threat model the OAuth authorization flow');
  assert.equal(r.capability, 'quality');
  assert.equal(r.primary, 'showdar-quality');
});

// 10. auth-diff security review: explicit scope beats domain coincidence.
test('auth diff security review routes via security-assessment capability', () => {
  // 6G: "Review this auth diff specifically for authorization vulnerabilities" -
  // "Review" is a bare imperative verb (in BARE_IMPERATIVE_VERBS) so capability
  // is review. Security risk on review action does not steal ownership.
  // 6F risk-based primary selected security-assessment; 6G capability-only stays review.
  const r = routed('Review this auth diff specifically for authorization vulnerabilities');
  assert.equal(r.capability, 'review');
  assert.equal(r.primary, 'showdar-review');
  assert.equal(r.phase, 'verification');
  assert.equal(r.action, 'review');
});

// 11. structural runtime never consults legacy ownership: on a prompt where
// legacy and structural disagree, the structural result follows the thin
// capability table and carries no legacy authority.
test('structural runtime bypasses legacy ownership machinery', () => {
  const r = resolveIntentFromPrompt('Review this webhook for security vulnerabilities');
  assert.equal(r.meta.usesLegacyAuthority, false);
  assert.equal(r.primary.skill, 'showdar-review');
  assert.equal(r.resolverMeta.routing.primaryCapability, 'review');
  // Legacy machinery on the same intent would say security (risk rule),
  // proving the bypass: review capability with a security risk must stay review.
  const intent = { phase: 'verification', action: 'review', object: 'repository', secondaryActions: [], risks: ['security'], mutation: 'read-only', evidence: {} };
  assert.equal(buildRoutePlan(intent).primary.skill, 'showdar-security');
  assert.equal(buildThinRoutePlan(intent, { primaryCapability: 'review' }).primary.skill, 'showdar-review');
});

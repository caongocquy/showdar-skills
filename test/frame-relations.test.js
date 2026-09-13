import assert from 'node:assert/strict';
import { resolveRelations } from '../src/intent-resolver/frame/relations.js';

/**
 * Helper to create fixed ClauseFrame[] for testing
 * clauseId must match action.clauseId
 */
function clause(id, connector, polarity = 'positive', provenance = 'DIRECT_INSTRUCTION') {
  return {
    id,
    text: `clause ${id}`,
    provenance,
    connector,
    polarity,
    parentClauseId: id === 'c0' ? null : `c${parseInt(id.slice(1)) - 1}`,
  };
}

/**
 * Helper to create fixed ActionFrame[] for testing
 * role is initially GOVERNING (default from action-frame.js) and gets reassigned by resolveRelations
 */
function action(id, canonicalAction, clauseId, commitment = 'AUTHORIZED_NOW', polarity = 'positive', connector = 'ROOT') {
  return {
    id,
    surfaceVerb: canonicalAction,
    semanticCapability: canonicalAction,
    canonicalAction,
    target: 'test-target',
    provenance: 'DIRECT_INSTRUCTION',
    polarity,
    role: 'GOVERNING', // will be reassigned
    commitment,
    environment: 'unspecified',
    clauseId,
  };
}

function runTest(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (e) {
    console.error(`✗ ${name}`);
    console.error(e);
    throw e;
  }
}

// ===== GOVERNING =====

runTest('first positive AUTHORIZED_NOW in ROOT clause becomes GOVERNING', () => {
  const clauses = [clause('c0', 'ROOT')];
  const actions = [action('a0', 'implement', 'c0')];
  const rels = resolveRelations(actions, clauses);
  assert.equal(actions[0].role, 'GOVERNING');
  assert.ok(rels.some(r => r.kind === 'GOVERNING' && r.from === 'a0' && r.to === 'a0'));
});

runTest('only one GOVERNING even with multiple ROOT actions', () => {
  const clauses = [clause('c0', 'ROOT'), clause('c1', 'ROOT')];
  const actions = [
    action('a0', 'implement', 'c0'),
    action('a1', 'audit', 'c1'),
  ];
  const rels = resolveRelations(actions, clauses);
  // First in ROOT order is GOVERNING
  assert.equal(actions[0].role, 'GOVERNING');
  assert.equal(actions[1].role, 'ORTHOGONAL'); // second independent request
  const gov = rels.filter(r => r.kind === 'GOVERNING');
  assert.equal(gov.length, 1);
  assert.equal(gov[0].from, 'a0');
});

// ===== SUPPORTING =====

runTest('same-workflow step markers in THEN clause → SUPPORTING', () => {
  const clauses = [
    clause('c0', 'ROOT'),
    clause('c1', 'THEN'),
  ];
  const actions = [
    action('a0', 'rebase', 'c0'),
    action('a1', 'resolve', 'c1'), // "resolve conflicts" follows rebase
  ];
  const rels = resolveRelations(actions, clauses);
  assert.equal(actions[0].role, 'GOVERNING');
  assert.equal(actions[1].role, 'SUPPORTING');
  assert.ok(rels.some(r => r.kind === 'SUPPORTING' && r.from === 'a1' && r.to === 'a0'));
});

runTest('health check after deploy in AND clause → SUPPORTING', () => {
  const clauses = [
    clause('c0', 'ROOT'),
    clause('c1', 'AND'),
  ];
  const actions = [
    action('a0', 'deploy', 'c0'),
    action('a1', 'check', 'c1'), // "check it for stale entries" follows deploy
  ];
  const rels = resolveRelations(actions, clauses);
  assert.equal(actions[0].role, 'GOVERNING');
  assert.equal(actions[1].role, 'SUPPORTING');
  assert.ok(rels.some(r => r.kind === 'SUPPORTING' && r.from === 'a1' && r.to === 'a0'));
});

runTest('follow-up language "verify" in THEN → SUPPORTING', () => {
  const clauses = [
    clause('c0', 'ROOT'),
    clause('c1', 'THEN'),
  ];
  const actions = [
    action('a0', 'implement', 'c0'),
    action('a1', 'verify', 'c1'),
  ];
  const rels = resolveRelations(actions, clauses);
  assert.equal(actions[0].role, 'GOVERNING');
  assert.equal(actions[1].role, 'SUPPORTING');
  assert.ok(rels.some(r => r.kind === 'SUPPORTING' && r.from === 'a1' && r.to === 'a0'));
});

// ===== ORTHOGONAL =====

runTest('independent explicit request in AND clause → ORTHOGONAL', () => {
  const clauses = [
    clause('c0', 'ROOT'),
    clause('c1', 'AND'),
  ];
  const actions = [
    action('a0', 'implement', 'c0'),
    action('a1', 'audit', 'c1'), // independent explicit request
  ];
  const rels = resolveRelations(actions, clauses);
  assert.equal(actions[0].role, 'GOVERNING');
  assert.equal(actions[1].role, 'ORTHOGONAL');
  assert.ok(rels.some(r => r.kind === 'ORTHOGONAL' && r.from === 'a1' && r.to === 'a0'));
});

runTest('T05 representative: Rebuild index and check it → ORTHOGONAL', () => {
  // "Rebuild the index and check it for stale entries."
  // rebuild → GOVERNING, check → ORTHOGONAL (independent audit-like request)
  const clauses = [
    clause('c0', 'ROOT'),
    clause('c1', 'AND'),
  ];
  const actions = [
    action('a0', 'implement', 'c0'), // rebuild maps to implement
    action('a1', 'assess', 'c1'),    // check maps to assess (audit)
  ];
  const rels = resolveRelations(actions, clauses);
  assert.ok(rels.some(r => r.kind === 'ORTHOGONAL'), 'should have ORTHOGONAL relation');
  assert.equal(actions[0].role, 'GOVERNING');
  assert.equal(actions[1].role, 'ORTHOGONAL');
});

runTest('multiple independent requests → all but first are ORTHOGONAL', () => {
  const clauses = [
    clause('c0', 'ROOT'),
    clause('c1', 'AND'),
    clause('c2', 'AND'),
  ];
  const actions = [
    action('a0', 'implement', 'c0'),
    action('a1', 'audit', 'c1'),
    action('a2', 'test', 'c2'),
  ];
  const rels = resolveRelations(actions, clauses);
  assert.equal(actions[0].role, 'GOVERNING');
  assert.equal(actions[1].role, 'ORTHOGONAL');
  assert.equal(actions[2].role, 'ORTHOGONAL');
  const orth = rels.filter(r => r.kind === 'ORTHOGONAL');
  assert.equal(orth.length, 2);
});

// ===== CONDITIONAL =====

runTest('IF-gated action → CONDITIONAL', () => {
  const clauses = [
    clause('c0', 'ROOT'),
    clause('c1', 'IF'), // "if approved"
  ];
  const actions = [
    action('a0', 'inspect', 'c0'),
    action('a1', 'deploy', 'c1', 'CONDITIONAL'), // gated by IF
  ];
  const rels = resolveRelations(actions, clauses);
  assert.equal(actions[0].role, 'GOVERNING');
  assert.equal(actions[1].role, 'CONDITIONAL');
  assert.ok(rels.some(r => r.kind === 'CONDITIONAL' && r.from === 'a1' && r.to === 'a0'));
});

runTest('T05 representative: Inspect release and deploy if approved → CONDITIONAL', () => {
  // "Inspect the release and deploy if approved."
  const clauses = [
    clause('c0', 'ROOT'),
    clause('c1', 'IF'),
  ];
  const actions = [
    action('a0', 'inspect', 'c0'), // inspect → GOVERNING
    action('a1', 'deploy', 'c1', 'CONDITIONAL'),
  ];
  const rels = resolveRelations(actions, clauses);
  assert.ok(rels.some(r => r.kind === 'CONDITIONAL'), 'should have CONDITIONAL relation');
  assert.equal(actions[0].role, 'GOVERNING');
  assert.equal(actions[1].role, 'CONDITIONAL');
});

runTest('UNLESS-gated action → CONDITIONAL', () => {
  const clauses = [
    clause('c0', 'ROOT'),
    clause('c1', 'UNLESS'),
  ];
  const actions = [
    action('a0', 'implement', 'c0'),
    action('a1', 'deploy', 'c1', 'CONDITIONAL'),
  ];
  const rels = resolveRelations(actions, clauses);
  assert.equal(actions[1].role, 'CONDITIONAL');
  assert.ok(rels.some(r => r.kind === 'CONDITIONAL' && r.from === 'a1'));
});

// ===== CONTEXTUAL =====

runTest('historical/background provenance → CONTEXTUAL', () => {
  const clauses = [
    clause('c0', 'ROOT', 'positive', 'CONTEXT'), // historical
    clause('c1', 'AND', 'positive', 'DIRECT_INSTRUCTION'),
  ];
  const actions = [
    action('a0', 'deploy', 'c0', 'AUTHORIZED_NOW'), // but provenance is CONTEXT
    action('a1', 'investigate', 'c1'),
  ];
  const rels = resolveRelations(actions, clauses);
  // Historical deploy should be CONTEXTUAL
  assert.equal(actions[0].role, 'CONTEXTUAL');
  assert.equal(actions[1].role, 'GOVERNING');
  assert.ok(rels.some(r => r.kind === 'CONTEXTUAL' && r.from === 'a0'));
});

runTest('past tense / background language → CONTEXTUAL', () => {
  const clauses = [
    clause('c0', 'ROOT', 'positive', 'DIRECT_INSTRUCTION'),
    clause('c1', 'AND', 'positive', 'DIRECT_INSTRUCTION'),
  ];
  const actions = [
    action('a0', 'deploy', 'c0', 'AUTHORIZED_NOW'),
    action('a1', 'deploy', 'c1', 'AUTHORIZED_NOW'),
  ];
  // Both are same action but second is in CONTEXT provenance (historical)
  // Actually we test via clause provenance
  const ctxClauses = [
    clause('c0', 'ROOT', 'positive', 'DIRECT_INSTRUCTION'),
    { ...clause('c1', 'AND', 'positive', 'CONTEXT'), text: 'was deployed yesterday' },
  ];
  const rels = resolveRelations(actions, ctxClauses);
  assert.equal(actions[1].role, 'CONTEXTUAL');
  assert.ok(rels.some(r => r.kind === 'CONTEXTUAL' && r.from === 'a1'));
});

// ===== NEGATIVE POLARITY =====

runTest('negative polarity action never GOVERNING', () => {
  const clauses = [
    clause('c0', 'ROOT', 'negative'),
    clause('c1', 'AND', 'positive'),
  ];
  const actions = [
    action('a0', 'deploy', 'c0', 'AUTHORIZED_NOW', 'negative'),
    action('a1', 'implement', 'c1'),
  ];
  const rels = resolveRelations(actions, clauses);
  // Negative first action should not be GOVERNING
  assert.notEqual(actions[0].role, 'GOVERNING');
  assert.equal(actions[1].role, 'GOVERNING');
});

runTest('negative polarity can be ORTHOGONAL', () => {
  const clauses = [
    clause('c0', 'ROOT', 'positive'),
    clause('c1', 'AND', 'negative'),
  ];
  const actions = [
    action('a0', 'implement', 'c0'),
    action('a1', 'deploy', 'c1', 'AUTHORIZED_NOW', 'negative'),
  ];
  const rels = resolveRelations(actions, clauses);
  assert.equal(actions[0].role, 'GOVERNING');
  assert.equal(actions[1].role, 'ORTHOGONAL'); // independent but negative
});

// ===== EDGE CASES =====

runTest('empty actions → empty relations', () => {
  const clauses = [clause('c0', 'ROOT')];
  const actions = [];
  const rels = resolveRelations(actions, clauses);
  assert.deepEqual(rels, []);
});

runTest('no AUTHORIZED_NOW positive actions → no GOVERNING', () => {
  const clauses = [
    clause('c0', 'ROOT'),
    clause('c1', 'AND'),
  ];
  const actions = [
    action('a0', 'deploy', 'c0', 'CONDITIONAL'),
    action('a1', 'implement', 'c1', 'HYPOTHETICAL'),
  ];
  const rels = resolveRelations(actions, clauses);
  const gov = rels.filter(r => r.kind === 'GOVERNING');
  assert.equal(gov.length, 0);
  assert.ok(actions.every(a => a.role !== 'GOVERNING'));
});

runTest('relation objects have correct shape', () => {
  const clauses = [clause('c0', 'ROOT'), clause('c1', 'AND')];
  const actions = [action('a0', 'implement', 'c0'), action('a1', 'audit', 'c1')];
  const rels = resolveRelations(actions, clauses);
  for (const r of rels) {
    assert.ok(['GOVERNING', 'SUPPORTING', 'ORTHOGONAL', 'CONDITIONAL', 'CONTEXTUAL'].includes(r.kind));
    assert.ok(typeof r.from === 'string' && r.from.startsWith('a'));
    assert.ok(typeof r.to === 'string' && r.to.startsWith('a'));
  }
});

runTest('all actions get a role assigned', () => {
  const clauses = [
    clause('c0', 'ROOT'),
    clause('c1', 'THEN'),
    clause('c2', 'AND'),
    clause('c3', 'IF'),
    clause('c4', 'ROOT', 'positive', 'CONTEXT'),
  ];
  const actions = [
    action('a0', 'implement', 'c0'),
    action('a1', 'resolve', 'c1'),
    action('a2', 'audit', 'c2'),
    action('a3', 'deploy', 'c3', 'CONDITIONAL'),
    action('a4', 'deploy', 'c4'),
  ];
  const rels = resolveRelations(actions, clauses);
  for (const a of actions) {
    assert.ok(['GOVERNING', 'SUPPORTING', 'ORTHOGONAL', 'CONDITIONAL', 'CONTEXTUAL'].includes(a.role), `action ${a.id} missing role`);
  }
});

console.log('\nAll relation tests passed');
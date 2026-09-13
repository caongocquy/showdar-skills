import test from 'node:test';
import assert from 'node:assert/strict';
import { projectPrimary, projectConservativeIntent } from '../src/intent-resolver/frame/projectors/primary.js';
import { resolveStructuralIntent } from '../src/intent-resolver/frame/projectors/index.js';
import { projectMutation } from '../src/intent-resolver/frame/projectors/mutation.js';
import { buildConstraintFrames, applyConstraintGates } from '../src/intent-resolver/frame/projectors/constraints.js';

// Helper to build a fixed RequestFrame with a GOVERNING action and optional ORTHOGONAL action
function makeFrame(governingVerb, orthogonalVerb = null, governingOptions = {}) {
  const actions = [
    {
      id: 'a0',
      surfaceVerb: governingVerb,
      canonicalAction: governingVerb,
      target: 'X',
      provenance: 'DIRECT_INSTRUCTION',
      polarity: 'positive',
      role: 'GOVERNING',
      commitment: 'AUTHORIZED_NOW',
      environment: 'unspecified',
      clauseId: 'c0',
      ...governingOptions,
    },
  ];
  if (orthogonalVerb) {
    actions.push({
      id: 'a1',
      surfaceVerb: orthogonalVerb,
      canonicalAction: orthogonalVerb,
      target: 'X',
      provenance: 'DIRECT_INSTRUCTION',
      polarity: 'positive',
      role: 'ORTHOGONAL',
      commitment: 'AUTHORIZED_NOW',
      environment: 'unspecified',
      clauseId: 'c1',
    });
  }
  return { actions, relations: [], diagnostics: [], clauses: [], contexts: [], constraints: [] };
}

test('projectPrimary: implement+audit → implement', async () => {
  const frame = makeFrame('implement', 'audit');
  assert.deepEqual(projectPrimary(frame).action, 'implement');
});

test('projectPrimary: rebase+conflicts → git', async () => {
  const frame = makeFrame('rebase', 'resolve');
  assert.deepEqual(projectPrimary(frame).action, 'git');
});

test('projectPrimary: historical+investigate → investigate', async () => {
  // Historical deploy is CONTEXTUAL (non-governing); investigate is GOVERNING
  const frame = {
    actions: [
      {
        id: 'a0',
        surfaceVerb: 'deploy',
        canonicalAction: 'deploy',
        target: 'api',
        provenance: 'CONTEXT',
        polarity: 'positive',
        role: 'CONTEXTUAL',
        commitment: 'AUTHORIZED_NOW',
        environment: 'production',
        clauseId: 'c0',
      },
      {
        id: 'a1',
        surfaceVerb: 'investigate',
        canonicalAction: 'investigate',
        target: 'slowdown',
        provenance: 'DIRECT_INSTRUCTION',
        polarity: 'positive',
        role: 'GOVERNING',
        commitment: 'AUTHORIZED_NOW',
        environment: 'unspecified',
        clauseId: 'c1',
      },
    ],
    relations: [],
    diagnostics: [],
    clauses: [],
    contexts: [],
    constraints: [],
  };
  assert.deepEqual(projectPrimary(frame).action, 'investigate');
});

test('projectPrimary: upgrade+deploy → upgrade', async () => {
  const frame = makeFrame('upgrade', 'deploy');
  assert.deepEqual(projectPrimary(frame).action, 'upgrade');
});

test('projectConservativeIntent: NO_GOVERNING_ACTION → read-only', async () => {
  const intent = projectConservativeIntent([{ code: 'NO_GOVERNING_ACTION' }]);
  assert.equal(intent.mutation, 'read-only');
  assert.equal(intent.secondaryActions.length, 0);
  // discovery/verification read-only
  assert.ok(['discovery', 'verification'].includes(intent.phase));
});

test('ownership isolation: risks/object never change primary', async () => {
  const base = makeFrame('implement', 'audit');
  const withRisks = { ...base, risks: ['security', 'production'] };
  const withObject = { ...base, risks: [], object: 'other' };
  assert.deepEqual(projectPrimary(withRisks), projectPrimary(withRisks));
  assert.deepEqual(projectPrimary(withRisks), projectPrimary(base));
  assert.deepEqual(projectPrimary(withObject), projectPrimary(base));
});

test('resolveStructuralIntent: wires primary-only', async () => {
  const frame = makeFrame('implement', 'audit');
  const intent = resolveStructuralIntent(frame);
  assert.equal(intent.action, 'implement');
  assert.equal(intent.phase, 'implementation');
});

test('projectPrimary: unresolved governing → conservative fallback', async () => {
  const frame = { actions: [], relations: [], diagnostics: [{ code: 'NO_GOVERNING_ACTION' }], clauses: [], contexts: [], constraints: [] };
  const primary = projectPrimary(frame);
  assert.equal(primary.phase, 'discovery');
});

// --- Mutation projector tests (T11) ---

// Helper to create frames for mutation tests
function makeMutationFrame(actions) {
  return {
    actions,
    relations: [],
    diagnostics: [],
    clauses: [],
    contexts: [],
    constraints: [],
  };
}

function governingAction(overrides = {}) {
  return {
    id: 'a0',
    surfaceVerb: 'investigate',
    canonicalAction: 'investigate',
    target: 'X',
    provenance: 'DIRECT_INSTRUCTION',
    polarity: 'positive',
    role: 'GOVERNING',
    commitment: 'AUTHORIZED_NOW',
    environment: 'unspecified',
    clauseId: 'c0',
    ...overrides,
  };
}

function supportingAction(overrides = {}) {
  return {
    id: 'a1',
    surfaceVerb: 'verify',
    canonicalAction: 'assess',
    target: 'X',
    provenance: 'DIRECT_INSTRUCTION',
    polarity: 'positive',
    role: 'SUPPORTING',
    commitment: 'AUTHORIZED_NOW',
    environment: 'unspecified',
    clauseId: 'c1',
    ...overrides,
  };
}

function orthogonalAction(overrides = {}) {
  return {
    id: 'a2',
    surfaceVerb: 'audit',
    canonicalAction: 'assess',
    target: 'X',
    provenance: 'DIRECT_INSTRUCTION',
    polarity: 'positive',
    role: 'ORTHOGONAL',
    commitment: 'AUTHORIZED_NOW',
    environment: 'unspecified',
    clauseId: 'c2',
    ...overrides,
  };
}

function contextualAction(overrides = {}) {
  return {
    id: 'a3',
    surfaceVerb: 'deploy',
    canonicalAction: 'deploy',
    target: 'api',
    provenance: 'CONTEXT',
    polarity: 'positive',
    role: 'CONTEXTUAL',
    commitment: 'AUTHORIZED_NOW',
    environment: 'production',
    clauseId: 'c3',
    ...overrides,
  };
}

test('projectMutation: historical production deploy + investigate → read-only (leak-impossibility)', async () => {
  // Historical deploy is CONTEXTUAL; investigate is GOVERNING
  const frame = makeMutationFrame([
    contextualAction({ surfaceVerb: 'deploy', canonicalAction: 'deploy', environment: 'production' }),
    governingAction({ surfaceVerb: 'investigate', canonicalAction: 'investigate', target: 'slowdown' }),
  ]);
  assert.equal(projectMutation(frame), 'read-only');
});

test('projectMutation: log shows deploy failed + diagnose → read-only (leak-impossibility)', async () => {
  // Log output is CONTEXTUAL; diagnose is GOVERNING
  const frame = makeMutationFrame([
    {
      id: 'a0',
      surfaceVerb: 'deploy',
      canonicalAction: 'deploy',
      target: 'api',
      provenance: 'LOG_OUTPUT',
      polarity: 'positive',
      role: 'CONTEXTUAL',
      commitment: 'AUTHORIZED_NOW',
      environment: 'production',
      clauseId: 'c0',
    },
    governingAction({ surfaceVerb: 'diagnose', canonicalAction: 'investigate', target: 'failure' }),
  ]);
  assert.equal(projectMutation(frame), 'read-only');
});

test('projectMutation: quoted "deploy now" + explain → read-only (leak-impossibility)', async () => {
  // Quoted content is CONTEXTUAL; explain is GOVERNING
  const frame = makeMutationFrame([
    {
      id: 'a0',
      surfaceVerb: 'deploy',
      canonicalAction: 'deploy',
      target: 'now',
      provenance: 'QUOTED_CONTENT',
      polarity: 'positive',
      role: 'CONTEXTUAL',
      commitment: 'AUTHORIZED_NOW',
      environment: 'unspecified',
      clauseId: 'c0',
    },
    governingAction({ surfaceVerb: 'explain', canonicalAction: 'understand', target: 'config' }),
  ]);
  assert.equal(projectMutation(frame), 'read-only');
});

test('projectMutation: inspect production config → read-only (environment never manufactures write)', async () => {
  // inspect is read-only action; production environment cannot escalate it
  const frame = makeMutationFrame([
    governingAction({ surfaceVerb: 'inspect', canonicalAction: 'investigate', target: 'config', environment: 'production' }),
  ]);
  assert.equal(projectMutation(frame), 'read-only');
});

test('projectMutation: deploy api to staging → remote-write', async () => {
  // deploy is production-impacting base; staging environment caps at remote-write
  const frame = makeMutationFrame([
    governingAction({ surfaceVerb: 'deploy', canonicalAction: 'deploy', target: 'api', environment: 'staging' }),
  ]);
  assert.equal(projectMutation(frame), 'remote-write');
});

test('projectMutation: GOVERNING local-write + SUPPORTING assess → local-write (supporting ceiling)', async () => {
  // Governing implements (local-write); supporting verify (read-only) capped at governing's local-write
  const frame = makeMutationFrame([
    governingAction({ surfaceVerb: 'implement', canonicalAction: 'implement', target: 'feature', environment: 'local' }),
    supportingAction({ surfaceVerb: 'verify', canonicalAction: 'assess', target: 'feature' }),
  ]);
  assert.equal(projectMutation(frame), 'local-write');
});

test('projectMutation: GOVERNING remote-write + SUPPORTING deploy → remote-write (supporting ceiling)', async () => {
  // Governing deploys to staging (remote-write); supporting deploy cannot exceed
  const frame = makeMutationFrame([
    governingAction({ surfaceVerb: 'deploy', canonicalAction: 'deploy', target: 'api', environment: 'staging' }),
    supportingAction({ surfaceVerb: 'deploy', canonicalAction: 'deploy', target: 'staging', environment: 'production' }),
  ]);
  assert.equal(projectMutation(frame), 'remote-write');
});

test('projectMutation: ORTHOGONAL deploy + GOVERNING implement → production-impacting (orthogonal independent)', async () => {
  // Orthogonal deploy (production-impacting) + governing implement (local-write) = max = production-impacting
  const frame = makeMutationFrame([
    governingAction({ surfaceVerb: 'implement', canonicalAction: 'implement', target: 'feature' }),
    orthogonalAction({ surfaceVerb: 'deploy', canonicalAction: 'deploy', target: 'production', environment: 'production' }),
  ]);
  assert.equal(projectMutation(frame), 'production-impacting');
});

test('projectMutation: CONDITIONAL deploy contributes nothing', async () => {
  const frame = makeMutationFrame([
    governingAction({ surfaceVerb: 'inspect', canonicalAction: 'investigate', target: 'config' }),
    {
      id: 'a1',
      surfaceVerb: 'deploy',
      canonicalAction: 'deploy',
      target: 'production',
      provenance: 'DIRECT_INSTRUCTION',
      polarity: 'positive',
      role: 'CONDITIONAL',
      commitment: 'CONDITIONAL',
      environment: 'production',
      clauseId: 'c1',
    },
  ]);
  // Conditional contributes nothing; governing inspect is read-only
  assert.equal(projectMutation(frame), 'read-only');
});

test('projectMutation: HYPOTHETICAL deploy contributes nothing', async () => {
  const frame = makeMutationFrame([
    governingAction({ surfaceVerb: 'inspect', canonicalAction: 'investigate', target: 'config' }),
    {
      id: 'a1',
      surfaceVerb: 'deploy',
      canonicalAction: 'deploy',
      target: 'production',
      provenance: 'DIRECT_INSTRUCTION',
      polarity: 'positive',
      role: 'HYPOTHETICAL',
      commitment: 'HYPOTHETICAL',
      environment: 'production',
      clauseId: 'c1',
    },
  ]);
  assert.equal(projectMutation(frame), 'read-only');
});

test('projectMutation: NEGATED deploy contributes nothing', async () => {
  const frame = makeMutationFrame([
    governingAction({ surfaceVerb: 'inspect', canonicalAction: 'investigate', target: 'config' }),
    {
      id: 'a1',
      surfaceVerb: 'deploy',
      canonicalAction: 'deploy',
      target: 'production',
      provenance: 'DIRECT_INSTRUCTION',
      polarity: 'negative',
      role: 'ORTHOGONAL',
      commitment: 'AUTHORIZED_NOW',
      environment: 'production',
      clauseId: 'c1',
    },
  ]);
  // Negative polarity = no contribution
  assert.equal(projectMutation(frame), 'read-only');
});

// --- Constraint frames and gates tests (T12) ---

function makeClause(id, text, connector = 'ROOT', polarity = 'positive', provenance = 'DIRECT_INSTRUCTION') {
  return { id, text, connector, polarity, provenance, parentClauseId: null };
}

function makeAction(id, surfaceVerb, canonicalAction, overrides = {}) {
  return {
    id,
    surfaceVerb,
    canonicalAction,
    target: 'X',
    provenance: 'DIRECT_INSTRUCTION',
    polarity: 'positive',
    role: 'GOVERNING',
    commitment: 'AUTHORIZED_NOW',
    environment: 'unspecified',
    clauseId: 'c0',
    ...overrides,
  };
}

// --- buildConstraintFrames tests ---

// Realistic two-clause form: action clause + separate constraint clause (split on "but")
test('buildConstraintFrames: NO_PUSH from "do not push" (global)', async () => {
  // "update config but do not push" -> two clauses: c0="update config", c1="do not push"
  const clauses = [
    makeClause('c0', 'update config', 'ROOT'),
    makeClause('c1', 'do not push', 'AND'), // "but" becomes AND connector
  ];
  const actions = [makeAction('a0', 'update', 'implement', { clauseId: 'c0' })];
  const constraints = buildConstraintFrames(clauses, actions);
  const noPush = constraints.find((c) => c.kind === 'NO_PUSH');
  assert.ok(noPush, 'NO_PUSH constraint found');
  assert.equal(noPush.scope, 'global');
  assert.match(noPush.text, /do not push/i);
});

test('buildConstraintFrames: NO_PUSH scoped to action from "do not push it"', async () => {
  // "deploy api but do not push it" -> two clauses: c0="deploy api", c1="do not push it"
  // push action must be in SAME clause as pronoun (c1) for action-scoped
  const clauses = [
    makeClause('c0', 'deploy api', 'ROOT'),
    makeClause('c1', 'do not push it', 'AND'),
  ];
  const actions = [
    makeAction('a0', 'deploy', 'deploy', { clauseId: 'c0' }),
    makeAction('a1', 'push', 'git', { clauseId: 'c1' }), // push in c1 (same as constraint with pronoun)
  ];
  const constraints = buildConstraintFrames(clauses, actions);
  const noPush = constraints.find((c) => c.kind === 'NO_PUSH');
  assert.ok(noPush);
  // "it" refers to the push action in the same clause
  assert.equal(noPush.scope, 'action:a1');
});

test('buildConstraintFrames: NO_COMMIT from "do not commit"', async () => {
  // "stage changes but do not commit" -> two clauses
  const clauses = [
    makeClause('c0', 'stage changes', 'ROOT'),
    makeClause('c1', 'do not commit', 'AND'),
  ];
  const actions = [makeAction('a0', 'stage', 'git', { clauseId: 'c0' })];
  const constraints = buildConstraintFrames(clauses, actions);
  const noCommit = constraints.find((c) => c.kind === 'NO_COMMIT');
  assert.ok(noCommit);
  assert.equal(noCommit.scope, 'global');
});

test('buildConstraintFrames: NO_DEPLOY from "do not deploy"', async () => {
  // "build the service but do not deploy" -> two clauses
  const clauses = [
    makeClause('c0', 'build the service', 'ROOT'),
    makeClause('c1', 'do not deploy', 'AND'),
  ];
  const actions = [makeAction('a0', 'build', 'implement', { clauseId: 'c0' })];
  const constraints = buildConstraintFrames(clauses, actions);
  const noDeploy = constraints.find((c) => c.kind === 'NO_DEPLOY');
  assert.ok(noDeploy);
  assert.equal(noDeploy.scope, 'global');
});

test('buildConstraintFrames: READ_ONLY from "inspect only"', async () => {
  // "inspect the config only" - single clause, READ_ONLY is always global
  const clauses = [makeClause('c0', 'inspect the config only')];
  const actions = [makeAction('a0', 'inspect', 'investigate', { clauseId: 'c0' })];
  const constraints = buildConstraintFrames(clauses, actions);
  const readOnly = constraints.find((c) => c.kind === 'READ_ONLY');
  assert.ok(readOnly);
  assert.equal(readOnly.scope, 'global');
});

test('buildConstraintFrames: NO_CODE_CHANGE from "no code changes"', async () => {
  // "review the PR but make no code changes" -> two clauses
  const clauses = [
    makeClause('c0', 'review the PR', 'ROOT'),
    makeClause('c1', 'make no code changes', 'AND'),
  ];
  const actions = [makeAction('a0', 'review', 'assess', { clauseId: 'c0' })];
  const constraints = buildConstraintFrames(clauses, actions);
  const noCodeChange = constraints.find((c) => c.kind === 'NO_CODE_CHANGE');
  assert.ok(noCodeChange);
  assert.equal(noCodeChange.scope, 'global');
});

test('buildConstraintFrames: NO_IMPLEMENTATION from "do not implement"', async () => {
  // "plan the feature but do not implement it" -> two clauses
  const clauses = [
    makeClause('c0', 'plan the feature', 'ROOT'),
    makeClause('c1', 'do not implement it', 'AND'),
  ];
  const actions = [makeAction('a0', 'plan', 'plan', { clauseId: 'c0' })];
  const constraints = buildConstraintFrames(clauses, actions);
  const noImpl = constraints.find((c) => c.kind === 'NO_IMPLEMENTATION');
  assert.ok(noImpl);
  assert.equal(noImpl.scope, 'global');
});

test('buildConstraintFrames: clause-scoped when prohibition in same clause', async () => {
  // "update config and do not push" - single clause (AND doesn't split in same way)
  // Real parser splits on "and" but keeps same clauseId? Actually it creates separate clauses.
  // For same-clause test, use a single clause with "and" (the test expects clause-scoped)
  const clauses = [makeClause('c0', 'update config and do not push')];
  const actions = [makeAction('a0', 'update', 'implement', { clauseId: 'c0' })];
  const constraints = buildConstraintFrames(clauses, actions);
  const noPush = constraints.find((c) => c.kind === 'NO_PUSH');
  assert.ok(noPush);
  // Same clause -> clause-scoped
  assert.equal(noPush.scope, 'clause:c0');
});

test('buildConstraintFrames: ambiguous scope widens to global', async () => {
  // "avoid pushing" - ambiguous what "pushing" refers to, no pronoun, no actions in SAME clause
  // Action is in a DIFFERENT clause (c1), constraint is in c0
  const clauses = [
    makeClause('c0', 'avoid pushing'),
    makeClause('c1', 'update config', 'AND'),
  ];
  const actions = [makeAction('a0', 'update', 'implement', { clauseId: 'c1' })];
  const constraints = buildConstraintFrames(clauses, actions);
  const noPush = constraints.find((c) => c.kind === 'NO_PUSH');
  assert.ok(noPush);
  assert.equal(noPush.scope, 'global'); // widens to global + _ambiguous flag
  assert.ok(noPush._ambiguous === true);
});

test('buildConstraintFrames: multiple constraints in one clause', async () => {
  // "build and test but do not push or deploy" -> two clauses: c0="build and test", c1="do not push or deploy"
  const clauses = [
    makeClause('c0', 'build and test', 'ROOT'),
    makeClause('c1', 'do not push or deploy', 'AND'),
  ];
  const actions = [
    makeAction('a0', 'build', 'implement', { clauseId: 'c0' }),
    makeAction('a1', 'test', 'test', { clauseId: 'c0' }),
  ];
  const constraints = buildConstraintFrames(clauses, actions);
  const kinds = constraints.map((c) => c.kind).sort();
  assert.deepEqual(kinds, ['NO_DEPLOY', 'NO_PUSH']);
});

// --- applyConstraintGates tests ---

test('applyConstraintGates: NO_PUSH on local-write stays local-write', async () => {
  // "update config but do not push" -> local-write remains
  const result = applyConstraintGates('local-write', [
    { kind: 'NO_PUSH', scope: 'global', text: 'do not push' },
  ]);
  // NO_PUSH does not reduce local-write
  assert.equal(result, 'local-write');
});

test('applyConstraintGates: NO_PUSH on remote-write -> local-write', async () => {
  // push is a remote-write action; NO_PUSH gates it to local-write
  const result = applyConstraintGates('remote-write', [
    { kind: 'NO_PUSH', scope: 'global', text: 'do not push' },
  ]);
  assert.equal(result, 'local-write');
});

test('applyConstraintGates: NO_PUSH on production-impacting -> remote-write', async () => {
  const result = applyConstraintGates('production-impacting', [
    { kind: 'NO_PUSH', scope: 'global', text: 'do not push' },
  ]);
  assert.equal(result, 'remote-write');
});

test('applyConstraintGates: NO_COMMIT on local-write -> read-only', async () => {
  const result = applyConstraintGates('local-write', [
    { kind: 'NO_COMMIT', scope: 'global', text: 'do not commit' },
  ]);
  assert.equal(result, 'read-only');
});

test('applyConstraintGates: NO_DEPLOY on remote-write -> local-write', async () => {
  const result = applyConstraintGates('remote-write', [
    { kind: 'NO_DEPLOY', scope: 'global', text: 'do not deploy' },
  ]);
  assert.equal(result, 'local-write');
});

test('applyConstraintGates: NO_DEPLOY on production-impacting -> remote-write', async () => {
  const result = applyConstraintGates('production-impacting', [
    { kind: 'NO_DEPLOY', scope: 'global', text: 'do not deploy' },
  ]);
  assert.equal(result, 'remote-write');
});

test('applyConstraintGates: READ_ONLY global overrides everything', async () => {
  const result = applyConstraintGates('production-impacting', [
    { kind: 'READ_ONLY', scope: 'global', text: 'inspect only' },
  ]);
  assert.equal(result, 'read-only');
});

test('applyConstraintGates: NO_CODE_CHANGE on local-write -> read-only', async () => {
  const result = applyConstraintGates('local-write', [
    { kind: 'NO_CODE_CHANGE', scope: 'global', text: 'no code changes' },
  ]);
  assert.equal(result, 'read-only');
});

test('applyConstraintGates: NO_IMPLEMENTATION on local-write -> read-only', async () => {
  const result = applyConstraintGates('local-write', [
    { kind: 'NO_IMPLEMENTATION', scope: 'global', text: 'do not implement' },
  ]);
  assert.equal(result, 'read-only');
});

test('applyConstraintGates: clause-scoped only affects that clause actions', async () => {
  const constraints = [
    { kind: 'NO_DEPLOY', scope: 'clause:c0', text: 'do not deploy' },
  ];
  const actions = [
    { id: 'a0', clauseId: 'c0' }, // action in clause c0
    { id: 'a1', clauseId: 'c1' }, // action in different clause c1
  ];
  // Without actionId, clause-scoped reduces (conservative default)
  assert.equal(applyConstraintGates('production-impacting', constraints), 'remote-write');
  // With actionId from same clause (and actions map), clause-scoped applies
  assert.equal(applyConstraintGates('production-impacting', constraints, 'a0', actions), 'remote-write');
  // With actionId from different clause (and actions map), clause-scoped does not apply
  assert.equal(applyConstraintGates('production-impacting', constraints, 'a1', actions), 'production-impacting');
  // With actionId but NO actions map -> skip clause-scoped (conservative)
  assert.equal(applyConstraintGates('production-impacting', constraints, 'a1'), 'production-impacting');
});

test('applyConstraintGates: action-scoped only affects that action', async () => {
  const constraints = [
    { kind: 'NO_DEPLOY', scope: 'action:a0', text: 'do not deploy it' },
  ];
  // Without actionId
  assert.equal(applyConstraintGates('production-impacting', constraints), 'remote-write');
  // With matching actionId
  assert.equal(applyConstraintGates('production-impacting', constraints, 'a0'), 'remote-write');
  // With different actionId
  assert.equal(applyConstraintGates('production-impacting', constraints, 'a1'), 'production-impacting');
});

test('applyConstraintGates: most restrictive wins across multiple constraints', async () => {
  const result = applyConstraintGates('production-impacting', [
    { kind: 'NO_DEPLOY', scope: 'global', text: 'do not deploy' },
    { kind: 'NO_PUSH', scope: 'global', text: 'do not push' },
  ]);
  // NO_DEPLOY -> remote-write, NO_PUSH -> remote-write; most restrictive = remote-write
  assert.equal(result, 'remote-write');
});

test('applyConstraintGates: READ_ONLY dominates all other constraints', async () => {
  const result = applyConstraintGates('production-impacting', [
    { kind: 'NO_DEPLOY', scope: 'global', text: 'do not deploy' },
    { kind: 'READ_ONLY', scope: 'global', text: 'inspect only' },
  ]);
  assert.equal(result, 'read-only');
});

test('applyConstraintGates: never escalates - read-only stays read-only', async () => {
  const result = applyConstraintGates('read-only', [
    { kind: 'NO_PUSH', scope: 'global', text: 'do not push' },
  ]);
  assert.equal(result, 'read-only');
});

// --- Three representative behaviors from T12 spec ---

test('T12 behavior: update config plus do not push -> local-write remains', async () => {
  const result = applyConstraintGates('local-write', [
    { kind: 'NO_PUSH', scope: 'global', text: 'do not push' },
  ]);
  assert.equal(result, 'local-write'); // local-write allowed
});

test('T12 behavior: inspect only -> global read-only', async () => {
  const result = applyConstraintGates('read-only', [
    { kind: 'READ_ONLY', scope: 'global', text: 'inspect only' },
  ]);
  assert.equal(result, 'read-only');
});

test('T12 behavior: deploy staging but not production -> production reduced', async () => {
  // NO_DEPLOY on production-impacting -> remote-write
  const result = applyConstraintGates('production-impacting', [
    { kind: 'NO_DEPLOY', scope: 'global', text: 'do not deploy production' },
  ]);
  assert.equal(result, 'remote-write');
});

test('applyConstraintGates: empty constraints returns mutation unchanged', async () => {
  assert.equal(applyConstraintGates('local-write', []), 'local-write');
  assert.equal(applyConstraintGates('production-impacting', []), 'production-impacting');
});

test('applyConstraintGates: reduce-only never escalates (matrix)', async () => {
  const ladder = ['read-only', 'local-write', 'remote-write', 'production-impacting'];
  const kinds = ['NO_PUSH', 'NO_COMMIT', 'NO_DEPLOY', 'READ_ONLY', 'NO_CODE_CHANGE', 'NO_IMPLEMENTATION'];
  for (const mut of ladder) {
    for (const kind of kinds) {
      const result = applyConstraintGates(mut, [{ kind, scope: 'global', text: 'test' }]);
      const mutIdx = ladder.indexOf(mut);
      const resultIdx = ladder.indexOf(result);
      assert.ok(resultIdx <= mutIdx, `${kind} on ${mut} gave ${result} (index ${resultIdx} > ${mutIdx})`);
    }
  }
});
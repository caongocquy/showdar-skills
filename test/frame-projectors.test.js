import test from 'node:test';
import assert from 'node:assert/strict';
import { projectPrimary, projectConservativeIntent } from '../src/intent-resolver/frame/projectors/primary.js';
import { resolveStructuralIntent } from '../src/intent-resolver/frame/projectors/index.js';
import { projectMutation } from '../src/intent-resolver/frame/projectors/mutation.js';

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

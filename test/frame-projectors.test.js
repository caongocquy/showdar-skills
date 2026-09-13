import test from 'node:test';
import assert from 'node:assert/strict';
import { projectPrimary, projectConservativeIntent } from '../src/intent-resolver/frame/projectors/primary.js';
import { resolveStructuralIntent } from '../src/intent-resolver/frame/projectors/index.js';

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

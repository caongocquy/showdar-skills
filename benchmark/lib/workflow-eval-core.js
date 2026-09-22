import {
  createWorkflowState,
  startStage,
  completeStage,
  skipStage,
  recordEvidence,
  addWorkflowBlocker,
  removeWorkflowBlocker,
  interruptWorkflow,
  finalizeWorkflow,
  serializeWorkflowState,
  deserializeWorkflowState,
  resumeFromCheckpoint,
  isWorkflowComplete,
} from '../../src/workflow-state.js';
import {
  projectWorkflowEvents,
  normalizeTrace,
  assertNoAuthority,
} from '../../src/workflow-trace.js';

const FORBIDDEN_SERIALIZED = ['primarycapability', 'authorizedaction', 'mutationpermission', 'routeauthority'];

function stamp(receipt) {
  return { detail: 'benchmark receipt', timestamp: new Date().toISOString(), ...receipt };
}

export function executeWorkflowStep(state, step, stubs, extensionCatalog = null) {
  const ctx = extensionCatalog ? { extensionCatalog } : {};
  switch (step.op) {
    case 'start':
      return { next: startStage(state, step.stage), input: { op: 'start', stage: step.stage } };
    case 'complete': {
      const receipts = (step.receipts ?? []).map(stamp);
      return { next: completeStage(state, step.stage, receipts), input: { op: 'complete', stage: step.stage } };
    }
    case 'skip':
      return {
        next: skipStage(state, step.stage, { reason: step.reason, evidence: step.evidence ?? [], policy: step.policy }, ctx),
        input: { op: 'skip', stage: step.stage },
      };
    case 'record': {
      const receipts = (step.receipts ?? []).map(stamp);
      let next = state;
      for (const receipt of receipts) next = recordEvidence(next, receipt);
      return { next, input: { op: 'record', receipts } };
    }
    case 'block':
      return { next: addWorkflowBlocker(state, step.blocker), input: { op: 'block' } };
    case 'unblock':
      return { next: removeWorkflowBlocker(state, step.blockerId), input: { op: 'unblock' } };
    case 'interrupt':
      return { next: interruptWorkflow(state, step.interruptReason ?? 'benchmark interrupt'), input: { op: 'interrupt' } };
    case 'resume': {
      const stub = stubs[step.resolution];
      if (!stub) throw new Error(`Unknown resolution stub: ${step.resolution}`);
      const checkpoint = serializeWorkflowState(state, ctx);
      const restored = deserializeWorkflowState(checkpoint, ctx);
      if (JSON.stringify(restored) !== JSON.stringify(state)) throw new Error('Checkpoint round-trip changed state');
      const result = resumeFromCheckpoint(checkpoint, stub, ctx);
      return {
        next: result.state,
        input: { op: 'resume', resolutionOutcome: result.replanRequired ? 'blocked' : 'ready', staleReason: result.reason ?? null },
        replanRequired: result.replanRequired,
      };
    }
    case 'finalize':
      return { next: finalizeWorkflow(state), input: { op: 'finalize' } };
    default:
      throw new Error(`Unknown step op: ${step.op}`);
  }
}

export function checkWorkflowInvariants({ scenario, state, events, keys, replanRequired, revisions }) {
  const failures = [];
  const expected = scenario.expected;
  if (expected.selectedStages && JSON.stringify(state.selectedStages) !== JSON.stringify(expected.selectedStages)) {
    failures.push(`M1 selection: got ${JSON.stringify(state.selectedStages)}, want ${JSON.stringify(expected.selectedStages)}`);
  }
  if (state.status !== expected.status) {
    failures.push(`M6 status: got ${state.status}, want ${expected.status}`);
  }
  if (expected.status === 'COMPLETE') {
    if (state.nextStage !== null) failures.push('M6 nextStage must be null when COMPLETE');
    if (state.blockers.length) failures.push('M6 blockers must be empty when COMPLETE');
    if (!isWorkflowComplete(state)) failures.push('M6 isWorkflowComplete must hold when COMPLETE');
  }
  if (expected.nextStage !== undefined && state.nextStage !== expected.nextStage) {
    failures.push(`nextStage: got ${state.nextStage}, want ${expected.nextStage}`);
  }
  if (expected.completedStages) {
    const got = state.completedStages.map((c) => c.stage);
    if (JSON.stringify(got) !== JSON.stringify(expected.completedStages)) failures.push(`completedStages: got ${JSON.stringify(got)}`);
  }
  if (expected.skippedStages) {
    const got = state.skippedStages.map((s) => s.stage);
    if (JSON.stringify(got) !== JSON.stringify(expected.skippedStages)) failures.push(`skippedStages: got ${JSON.stringify(got)}`);
  }
  if (expected.replanRequired !== undefined && replanRequired !== expected.replanRequired) {
    failures.push(`M4 replanRequired: got ${replanRequired}, want ${expected.replanRequired}`);
  }
  const expectedKeys = expected.trace.map((t) => JSON.stringify([t.type, scenario.workflow, t.stage, t.detail]));
  if (JSON.stringify(keys) !== JSON.stringify(expectedKeys)) {
    failures.push(`M7 trace mismatch:\n  got  ${JSON.stringify(keys, null, 1)}\n  want ${JSON.stringify(expectedKeys, null, 1)}`);
  }
  for (let i = 1; i < revisions.length; i++) {
    if (revisions[i] < revisions[i - 1]) {
      failures.push(`M8 revision decreased at event ${i}: ${revisions[i - 1]} -> ${revisions[i]}`);
      break;
    }
  }
  for (const event of events) {
    try {
      assertNoAuthority(event);
    } catch (error) {
      failures.push(`M5 authority leak: ${error.message}`);
      break;
    }
    if (event.type === 'stage-skipped' && (!event.detail.reason || !event.detail.policy)) {
      failures.push('M10 skipped event missing reason/policy');
    }
  }
  const serialized = JSON.stringify(state).toLowerCase().replace(/[\s_-]+/g, '');
  for (const forbidden of FORBIDDEN_SERIALIZED) {
    if (serialized.includes(forbidden)) failures.push(`M5 serialized state contains ${forbidden}`);
  }
  return failures;
}

export function runWorkflowScenario(scenario, extensionCatalog = null) {
  const ctx = extensionCatalog ? { extensionCatalog } : {};
  const creation = createWorkflowState(scenario.workflow, {
    selectedStages: scenario.selection.selectedStages,
    ...(scenario.selection.candidateStages ? { candidateStages: scenario.selection.candidateStages } : {}),
    ...ctx,
  });
  if (scenario.expectCreation) {
    if (scenario.expectCreation.ok !== creation.ok) {
      return { pass: false, failures: [`creation ok: got ${creation.ok}, want ${scenario.expectCreation.ok}`], keys: [] };
    }
    if (!creation.ok) {
      const match = scenario.expectCreation.errorMatch ?? '';
      if (match && !creation.errors.join('; ').includes(match)) {
        return { pass: false, failures: [`creation error mismatch: ${creation.errors.join('; ')}`], keys: [] };
      }
      return { pass: true, failures: [], keys: [] };
    }
  }
  if (!creation.ok) return { pass: false, failures: [`creation failed: ${creation.errors.join('; ')}`], keys: [] };
  let state = creation.value;
  const traceCtx = extensionCatalog ? { extensionCatalog } : {};
  let events = [...projectWorkflowEvents(null, state, { op: 'create', ...traceCtx })];
  let replanRequired = false;
  for (const step of scenario.steps ?? []) {
    if (step.mustThrow) {
      const beforeRevision = state.revision;
      let threw = false;
      try {
        executeWorkflowStep(state, step, scenario.resolutionStubs, extensionCatalog);
      } catch {
        threw = true;
      }
      if (!threw) return { pass: false, failures: [`M2 step ${step.op} ${step.stage ?? ''} did not throw`], keys: normalizeTrace(events) };
      if (state.revision !== beforeRevision) return { pass: false, failures: ['M2 revision changed on rejected transition'], keys: normalizeTrace(events) };
      continue;
    }
    const prev = state;
    const { next, input, replanRequired: stepReplan } = executeWorkflowStep(state, step, scenario.resolutionStubs, extensionCatalog);
    if (next.revision !== prev.revision + 1) {
      return { pass: false, failures: [`M8 accepted step ${step.op} did not bump revision exactly once`], keys: normalizeTrace(events) };
    }
    if (stepReplan !== undefined) replanRequired = stepReplan;
    events = [...events, ...projectWorkflowEvents(prev, next, { ...input, ...traceCtx })];
    state = next;
  }
  const keys = normalizeTrace(events);
  const revisions = events.map((e) => e.revision);
  const failures = checkWorkflowInvariants({ scenario, state, events, keys, replanRequired, revisions });
  return { pass: failures.length === 0, failures, keys };
}

export function summarizeWorkflowResults(scenarios, results) {
  const byWorkflow = new Map();
  let passCount = 0;
  const failedIds = [];
  scenarios.forEach((scenario, i) => {
    const result = results[i];
    const bucket = byWorkflow.get(scenario.workflow) ?? { pass: 0, total: 0 };
    bucket.total++;
    if (result.pass) {
      passCount++;
      bucket.pass++;
    } else {
      failedIds.push(scenario.id);
    }
    byWorkflow.set(scenario.workflow, bucket);
  });
  return { passCount, total: scenarios.length, failedIds, byWorkflow };
}

export const workflowEvalCoreAPI = {
  executeWorkflowStep,
  checkWorkflowInvariants,
  runWorkflowScenario,
  summarizeWorkflowResults,
};

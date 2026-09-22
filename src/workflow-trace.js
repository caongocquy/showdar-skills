import {
  validateWorkflowState,
  isWorkflowComplete,
  FORBIDDEN_AUTHORITY_KEYS,
} from './workflow-state.js';

export const WORKFLOW_EVENT_TYPES = Object.freeze([
  'workflow-created',
  'stages-selected',
  'stage-entered',
  'evidence-recorded',
  'stage-completed',
  'stage-skipped',
  'workflow-blocked',
  'workflow-interrupted',
  'workflow-resumed',
  'workflow-completed',
]);

const EVENT_TYPE_SET = new Set(WORKFLOW_EVENT_TYPES);
const EVENT_KEYS = new Set(['seq', 'type', 'workflowId', 'revision', 'stage', 'detail']);

function sortedKinds(receipts) {
  return [...receipts].map((r) => r.kind).sort();
}

function sortedQualities(receipts) {
  return [...receipts].map((r) => r.quality).sort();
}

function freezeEvent(event) {
  return Object.freeze({ ...event, detail: Object.freeze({ ...event.detail }) });
}

function makeEvent(seq, type, state, stage, detail) {
  return freezeEvent({
    seq,
    type,
    workflowId: state.workflowId,
    revision: state.revision,
    stage: stage ?? null,
    detail: detail ?? {},
  });
}

export function assertNoAuthority(event) {
  const serialized = JSON.stringify(event).toLowerCase().replace(/[\s_-]+/g, '');
  for (const forbidden of FORBIDDEN_AUTHORITY_KEYS) {
    if (serialized.includes(forbidden)) {
      throw new Error(`workflow trace event must not contain authority-derived content (found ${forbidden})`);
    }
  }
  return true;
}

export function validateWorkflowEvent(event) {
  const errors = [];
  if (event === null || typeof event !== 'object' || Array.isArray(event)) return { ok: false, errors: ['workflow event must be an object'] };
  for (const key of Object.keys(event)) {
    if (!EVENT_KEYS.has(key)) errors.push(`event contains unknown key: ${key}`);
  }
  if (!Number.isInteger(event.seq) || event.seq < 0) errors.push('event seq must be a non-negative integer');
  if (!EVENT_TYPE_SET.has(event.type)) errors.push(`event type must be one of: ${WORKFLOW_EVENT_TYPES.join(', ')}`);
  if (typeof event.workflowId !== 'string' || !event.workflowId) errors.push('event workflowId must be a non-empty string');
  if (!Number.isInteger(event.revision) || event.revision < 0) errors.push('event revision must be a non-negative integer');
  if (event.stage !== null && typeof event.stage !== 'string') errors.push('event stage must be a string or null');
  if (event.detail === null || typeof event.detail !== 'object' || Array.isArray(event.detail)) errors.push('event detail must be an object');
  if (!errors.length) {
    try {
      assertNoAuthority(event);
    } catch (error) {
      errors.push(error.message);
    }
  }
  return { ok: errors.length === 0, errors };
}

export function eventKey(event) {
  return JSON.stringify([event.type, event.workflowId, event.stage, event.detail]);
}

export function normalizeTrace(events) {
  return events.map(eventKey);
}

function requireValidState(state, label, extensionCatalog = null) {
  const validation = validateWorkflowState(state, extensionCatalog ? { extensionCatalog } : {});
  if (!validation.ok) throw new Error(`Invalid ${label} workflow state: ${validation.errors.join('; ')}`);
}

export function projectWorkflowEvents(prevState, nextState, input = {}) {
  const op = input.op ?? null;
  const extensionCatalog = input.extensionCatalog ?? null;
  if (typeof op !== 'string' || !op) throw new Error('projectWorkflowEvents requires input.op');
  if (prevState !== null) requireValidState(prevState, 'prev', extensionCatalog);
  requireValidState(nextState, 'next', extensionCatalog);
  const events = [];
  const emit = (type, stage, detail) => {
    const event = makeEvent(events.length, type, nextState, stage, detail);
    const validation = validateWorkflowEvent(event);
    if (!validation.ok) throw new Error(`Projected invalid event: ${validation.errors.join('; ')}`);
    events.push(event);
  };
  switch (op) {
    case 'create': {
      emit('workflow-created', null, {
        selectedStages: [...nextState.selectedStages],
        candidateStages: [...nextState.candidateStages],
      });
      const sameOrder = nextState.selectedStages.length === nextState.candidateStages.length
        && nextState.selectedStages.every((s, i) => s === nextState.candidateStages[i]);
      if (!sameOrder) emit('stages-selected', null, { selectedStages: [...nextState.selectedStages] });
      break;
    }
    case 'start':
      emit('stage-entered', input.stage ?? nextState.activeStage, {});
      break;
    case 'record': {
      const receipts = input.receipts ?? nextState.evidenceReceipts.slice(-1);
      emit('evidence-recorded', null, { receiptKinds: sortedKinds(receipts), receiptQualities: sortedQualities(receipts) });
      break;
    }
    case 'complete': {
      const entry = nextState.completedStages[nextState.completedStages.length - 1];
      if (!entry) throw new Error('complete projection requires a completed stage entry');
      emit('stage-completed', entry.stage, {
        receiptKinds: sortedKinds(entry.evidenceReceipts),
        receiptQualities: sortedQualities(entry.evidenceReceipts),
      });
      if (nextState.nextStage === null && isWorkflowComplete(nextState)) {
        emit('workflow-completed', null, {
          completedStages: nextState.completedStages.map((c) => c.stage),
          skippedStages: nextState.skippedStages.map((s) => s.stage),
        });
      }
      break;
    }
    case 'skip': {
      const entry = nextState.skippedStages[nextState.skippedStages.length - 1];
      if (!entry) throw new Error('skip projection requires a skipped stage entry');
      emit('stage-skipped', entry.stage, { reason: entry.reason, policy: entry.policy, evidence: [...entry.evidence] });
      break;
    }
    case 'block':
      emit('workflow-blocked', null, {
        blockerIds: [...nextState.blockers].map((b) => b.id).sort(),
        blockerTypes: [...nextState.blockers].map((b) => b.type).sort(),
      });
      break;
    case 'unblock':
      break;
    case 'interrupt':
      emit('workflow-interrupted', null, {});
      break;
    case 'resume': {
      const outcome = input.resolutionOutcome ?? (nextState.status === 'BLOCKED' ? 'blocked' : 'ready');
      emit('workflow-resumed', null, { outcome, staleReason: input.staleReason ?? null });
      if (outcome === 'blocked') {
        emit('workflow-blocked', null, {
          blockerIds: [...nextState.blockers].map((b) => b.id).sort(),
          blockerTypes: [...nextState.blockers].map((b) => b.type).sort(),
        });
      }
      break;
    }
    case 'finalize':
      emit('workflow-completed', null, {
        completedStages: nextState.completedStages.map((c) => c.stage),
        skippedStages: nextState.skippedStages.map((s) => s.stage),
      });
      break;
    default:
      throw new Error(`Unknown workflow trace op: ${op}`);
  }
  return Object.freeze(events);
}

export const workflowTraceAPI = {
  projectWorkflowEvents,
  eventKey,
  normalizeTrace,
  assertNoAuthority,
  validateWorkflowEvent,
};

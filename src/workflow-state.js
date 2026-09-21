import { WORKFLOW_SKILLS, getWorkflow, SKILLS } from './catalog.js';
import { EVIDENCE_KINDS, EVIDENCE_QUALITIES, getStopConditions } from './evidence-state.js';

export const WORKFLOW_SCHEMA_VERSION = 1;

export const WORKFLOW_STATUSES = Object.freeze([
  'NEW',
  'READY',
  'ACTIVE',
  'COMPLETE',
  'INTERRUPTED',
  'BLOCKED',
]);

export const BLOCKER_TYPES = Object.freeze([
  'authorization',
  'business-rule',
  'evidence',
  'external-decision',
  'other',
]);

export const SKIP_POLICIES = Object.freeze([
  'adaptive-skip',
  'known-root-cause',
  'readiness-only',
  'no-ops-authority',
  'no-security-risk',
  'behavior-defined',
  'local-low-risk',
  'no-ux-decision',
]);

export const SKIP_REASONS = Object.freeze([
  'behavior-defined',
  'local-low-risk',
  'no-ux-decision',
  'known-root-cause',
  'readiness-only',
  'no-ops-authority',
  'no-security-risk',
]);

const FORBIDDEN_AUTHORITY_KEYS = Object.freeze([
  'primarycapability',
  'authorizedaction',
  'mutationpermission',
  'routeauthority',
  'governingaction',
  'cachedauthority',
  'authoritydecision',
]);

const STALE_REASONS = Object.freeze([
  'workflow-no-longer-applicable',
  'primary-skill-shifted',
  'verification-evidence-stale',
]);

const HIGH_SENSITIVITY_KINDS = new Set([
  'change-implemented',
  'targeted-tests-passed',
  'relevant-suite-passed',
  'build-passed',
  'package-verified',
  'compatibility-verified',
  'regression-proof-added',
  'release-readiness-verified',
]);

const MEDIUM_SENSITIVITY_KINDS = new Set([
  'failure-reproduced',
  'typecheck-passed',
  'lint-passed',
  'security-reviewed',
]);

const RECEIPT_KEYS = new Set(['kind', 'quality', 'source', 'detail', 'timestamp', 'provenance']);
const SKIPPED_KEYS = new Set(['stage', 'reason', 'evidence', 'policy', 'skippedAt']);
const COMPLETED_KEYS = new Set(['stage', 'completedAt', 'evidenceReceipts', 'stopConditionMet']);
const BLOCKER_KEYS = new Set(['id', 'reason', 'type', 'detail', 'blockedAt']);

const WORKFLOW_IDS = new Set(WORKFLOW_SKILLS.map((w) => w.id));
const PRIMITIVE_IDS = new Set(SKILLS.map((s) => s.id));

const SELECTABLE_STAGES = Object.freeze({
  'showdar-feature': ['showdar-understand', 'showdar-requirements', 'showdar-plan', 'showdar-design', 'showdar-build', 'showdar-test', 'showdar-review'],
  'showdar-bugfix': ['showdar-understand', 'showdar-debug', 'showdar-build', 'showdar-test', 'showdar-review'],
  'showdar-release': ['showdar-quality', 'showdar-security', 'showdar-ship', 'showdar-ops'],
  'showdar-incident': ['showdar-understand', 'showdar-debug', 'showdar-recover', 'showdar-test', 'showdar-ops'],
});

const SKIP_RULES = Object.freeze({
  'showdar-feature': Object.freeze({
    'showdar-requirements': { reason: 'behavior-defined', policy: 'behavior-defined', evidence: ['behavior-defined'] },
    'showdar-plan': { reason: 'local-low-risk', policy: 'local-low-risk', evidence: ['architecture-understood'] },
    'showdar-design': { reason: 'no-ux-decision', policy: 'no-ux-decision', evidence: [] },
  }),
  'showdar-bugfix': Object.freeze({
    'showdar-debug': { reason: 'known-root-cause', policy: 'known-root-cause', evidence: ['root-cause-proven'] },
  }),
  'showdar-release': Object.freeze({
    'showdar-security': { reason: 'no-security-risk', policy: 'no-security-risk', evidence: [] },
    'showdar-ops': { reason: 'readiness-only', policy: 'readiness-only', evidence: [] },
  }),
  'showdar-incident': Object.freeze({
    'showdar-ops': { reason: 'no-ops-authority', policy: 'no-ops-authority', evidence: [] },
  }),
});

const REQUIRED_STAGES = Object.freeze({
  'showdar-feature': ['showdar-understand', 'showdar-build', 'showdar-test', 'showdar-review'],
  'showdar-bugfix': ['showdar-understand', 'showdar-test', 'showdar-review'],
  'showdar-release': ['showdar-quality', 'showdar-ship'],
  'showdar-incident': ['showdar-understand', 'showdar-debug', 'showdar-recover', 'showdar-test'],
});

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isIsoString(value) {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

function containsForbiddenAuthorityKey(value, path = '$') {
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const hit = containsForbiddenAuthorityKey(value[i], `${path}[${i}]`);
      if (hit) return hit;
    }
    return null;
  }
  if (isRecord(value)) {
    for (const key of Object.keys(value)) {
      const normalized = String(key).toLowerCase().replace(/[\s_-]+/g, '');
      if (FORBIDDEN_AUTHORITY_KEYS.some((f) => normalized.includes(f))) return `${path}.${key}`;
      const hit = containsForbiddenAuthorityKey(value[key], `${path}.${key}`);
      if (hit) return hit;
    }
  }
  return null;
}

function validateReceipt(entry) {
  const errors = [];
  if (!isRecord(entry)) return ['evidence receipt must be an object'];
  if (!EVIDENCE_KINDS.includes(entry.kind)) errors.push(`receipt kind must be one of: ${EVIDENCE_KINDS.join(', ')}`);
  if (!EVIDENCE_QUALITIES.includes(entry.quality)) errors.push(`receipt quality must be one of: ${EVIDENCE_QUALITIES.join(', ')}`);
  if (typeof entry.source !== 'string' || !PRIMITIVE_IDS.has(entry.source)) errors.push('receipt source must be a known primitive skill id');
  if (typeof entry.detail !== 'string' || !entry.detail.trim()) errors.push('receipt detail must be a non-empty string');
  if (!isIsoString(entry.timestamp)) errors.push('receipt timestamp must be ISO8601');
  if (entry.provenance !== undefined && !isRecord(entry.provenance)) errors.push('receipt provenance must be an object');
  for (const key of Object.keys(entry)) {
    if (!RECEIPT_KEYS.has(key)) errors.push(`receipt contains unknown key: ${key}`);
  }
  return errors;
}

function snapshotStages(catalog, workflowId) {
  if (catalog && catalog.selectableStages) return catalog.selectableStages[workflowId] ?? [];
  return SELECTABLE_STAGES[workflowId] ?? [];
}

function snapshotSkipRule(catalog, workflowId, stage) {
  if (catalog && catalog.skipRules) return (catalog.skipRules[workflowId] ?? {})[stage] ?? null;
  return (SKIP_RULES[workflowId] ?? {})[stage] ?? null;
}

function snapshotRequired(catalog, workflowId) {
  if (catalog && catalog.requiredStages) return catalog.requiredStages[workflowId] ?? [];
  return REQUIRED_STAGES[workflowId] ?? [];
}

function snapshotWorkflowIds(catalog) {
  if (catalog && catalog.selectableStages) return new Set(Object.keys(catalog.selectableStages));
  return WORKFLOW_IDS;
}

function validateSkipped(entry, workflowId, selectedStages, catalog = null) {
  const errors = [];
  if (!isRecord(entry)) return ['skipped stage must be an object'];
  const catalogStages = snapshotStages(catalog, workflowId);
  if (typeof entry.stage !== 'string' || !catalogStages.includes(entry.stage)) errors.push(`skipped stage must be a catalog stage of ${workflowId}`);
  if (selectedStages.includes(entry.stage)) errors.push(`skipped stage ${entry.stage} must not be selected`);
  if (!SKIP_REASONS.includes(entry.reason)) errors.push(`skip reason must be one of: ${SKIP_REASONS.join(', ')}`);
  if (!Array.isArray(entry.evidence) || entry.evidence.some((e) => typeof e !== 'string')) errors.push('skip evidence must be an array of strings');
  if (!SKIP_POLICIES.includes(entry.policy)) errors.push(`skip policy must be one of: ${SKIP_POLICIES.join(', ')}`);
  if (!isIsoString(entry.skippedAt)) errors.push('skip skippedAt must be ISO8601');
  for (const key of Object.keys(entry)) {
    if (!SKIPPED_KEYS.has(key)) errors.push(`skipped stage contains unknown key: ${key}`);
  }
  const rule = (SKIP_RULES[workflowId] ?? {})[entry.stage];
  if (!rule) errors.push(`stage ${entry.stage} is not skippable under ${workflowId} policy`);
  else {
    if (entry.reason !== rule.reason) errors.push(`skip reason for ${entry.stage} must be ${rule.reason}`);
    if (entry.policy !== rule.policy) errors.push(`skip policy for ${entry.stage} must be ${rule.policy}`);
  }
  return errors;
}

function validateCompleted(entry, selectedStages) {
  const errors = [];
  if (!isRecord(entry)) return ['completed stage must be an object'];
  if (typeof entry.stage !== 'string' || !selectedStages.includes(entry.stage)) errors.push('completed stage must be a selected stage');
  if (!isIsoString(entry.completedAt)) errors.push('completed completedAt must be ISO8601');
  if (!Array.isArray(entry.evidenceReceipts) || !entry.evidenceReceipts.length) errors.push('completed evidenceReceipts must be a non-empty array');
  else for (const receipt of entry.evidenceReceipts) errors.push(...validateReceipt(receipt).map((e) => `completed ${entry.stage}: ${e}`));
  if (typeof entry.stopConditionMet !== 'boolean') errors.push('completed stopConditionMet must be boolean');
  for (const key of Object.keys(entry)) {
    if (!COMPLETED_KEYS.has(key)) errors.push(`completed stage contains unknown key: ${key}`);
  }
  return errors;
}

function validateBlocker(blocker) {
  const errors = [];
  if (!isRecord(blocker)) return ['blocker must be an object'];
  if (typeof blocker.id !== 'string' || !blocker.id.trim()) errors.push('blocker id must be a non-empty string');
  if (typeof blocker.reason !== 'string' || !blocker.reason.trim()) errors.push('blocker reason must be a non-empty string');
  if (!BLOCKER_TYPES.includes(blocker.type)) errors.push(`blocker type must be one of: ${BLOCKER_TYPES.join(', ')}`);
  if (blocker.detail !== undefined && typeof blocker.detail !== 'string') errors.push('blocker detail must be a string');
  if (!isIsoString(blocker.blockedAt)) errors.push('blocker blockedAt must be ISO8601');
  for (const key of Object.keys(blocker)) {
    if (!BLOCKER_KEYS.has(key)) errors.push(`blocker contains unknown key: ${key}`);
  }
  return errors;
}

function uniqueSortedStages(stages) {
  return [...new Set(stages)].sort();
}

function computeNext(selectedStages, completedStages, skippedStages) {
  const done = new Set([...completedStages.map((c) => c.stage), ...skippedStages.map((s) => s.stage)]);
  return selectedStages.find((s) => !done.has(s)) ?? null;
}

function now() {
  return new Date().toISOString();
}

function freezeState(state) {
  return Object.freeze({
    ...state,
    candidateStages: Object.freeze([...state.candidateStages]),
    selectedStages: Object.freeze([...state.selectedStages]),
    completedStages: Object.freeze(state.completedStages.map((c) => Object.freeze({ ...c, evidenceReceipts: Object.freeze(c.evidenceReceipts.map((r) => Object.freeze({ ...r }))) }))),
    skippedStages: Object.freeze(state.skippedStages.map((s) => Object.freeze({ ...s, evidence: Object.freeze([...s.evidence]) }))),
    evidenceReceipts: Object.freeze(state.evidenceReceipts.map((r) => Object.freeze({ ...r }))),
    blockers: Object.freeze(state.blockers.map((b) => Object.freeze({ ...b }))),
  });
}

function bump(state, patch) {
  const next = {
    ...state,
    ...patch,
    revision: state.revision + 1,
    updatedAt: now(),
  };
  next.nextStage = computeNext(next.selectedStages, next.completedStages, next.skippedStages);
  return freezeState(next);
}

export function validateWorkflowState(input, options = {}) {
  const errors = [];
  const catalog = options.extensionCatalog ?? null;
  const workflowIds = snapshotWorkflowIds(catalog);
  if (!isRecord(input)) return { ok: false, errors: ['workflow state must be an object'] };
  const forbidden = containsForbiddenAuthorityKey(input);
  if (forbidden) errors.push(`workflow state must not persist authority-derived fields (found at ${forbidden})`);
  if (input.schemaVersion !== WORKFLOW_SCHEMA_VERSION) errors.push(`schemaVersion must be ${WORKFLOW_SCHEMA_VERSION}`);
  if (catalog && typeof input.workflowId !== 'string' || (catalog && !workflowIds.has(input.workflowId))) {
    errors.push(`workflowId must be one of: ${[...workflowIds].join(', ')}`);
  } else if (!catalog && typeof input.workflowId !== 'string') {
    errors.push('workflowId must be a non-empty string');
  }
  if (!WORKFLOW_STATUSES.includes(input.status)) errors.push(`status must be one of: ${WORKFLOW_STATUSES.join(', ')}`);
  if (!Number.isInteger(input.revision) || input.revision < 0) errors.push('revision must be a non-negative integer');
  if (!isIsoString(input.createdAt)) errors.push('createdAt must be ISO8601');
  if (!isIsoString(input.updatedAt)) errors.push('updatedAt must be ISO8601');
  if (!Array.isArray(input.candidateStages) || input.candidateStages.some((s) => !PRIMITIVE_IDS.has(s))) errors.push('candidateStages must be known primitive skill ids');
  if (!Array.isArray(input.selectedStages) || input.selectedStages.some((s) => !PRIMITIVE_IDS.has(s))) errors.push('selectedStages must be known primitive skill ids');
  if (new Set(input.selectedStages ?? []).size !== (input.selectedStages ?? []).length) errors.push('selectedStages must not contain duplicates');

  const workflowId = input.workflowId;
  const snapshot = options.extensionCatalog ?? null;
  const catalogStages = workflowId ? snapshotStages(snapshot, workflowId) : [];
  if (Array.isArray(input.candidateStages) && catalogStages.length) {
    for (const stage of input.candidateStages) {
      if (!catalogStages.includes(stage)) errors.push(`candidate stage ${stage} is not declared by ${workflowId}`);
    }
  }
  if (Array.isArray(input.selectedStages) && Array.isArray(input.candidateStages)) {
    for (const stage of input.selectedStages) {
      if (!input.candidateStages.includes(stage)) errors.push(`selected stage ${stage} must be a candidate stage`);
    }
  }
  if (input.activeStage !== null && input.activeStage !== undefined) {
    if (typeof input.activeStage !== 'string' || !(input.selectedStages ?? []).includes(input.activeStage)) errors.push('activeStage must be a selected stage or null');
  }
  if (input.nextStage !== null && input.nextStage !== undefined) {
    if (typeof input.nextStage !== 'string' || !(input.selectedStages ?? []).includes(input.nextStage)) errors.push('nextStage must be a selected stage or null');
  }
  if (!Array.isArray(input.completedStages)) errors.push('completedStages must be an array');
  else for (const entry of input.completedStages) errors.push(...validateCompleted(entry, input.selectedStages ?? []));
  if (!Array.isArray(input.skippedStages)) errors.push('skippedStages must be an array');
  else for (const entry of input.skippedStages) errors.push(...validateSkipped(entry, workflowId, input.selectedStages ?? [], snapshot));
  if (!Array.isArray(input.evidenceReceipts)) errors.push('evidenceReceipts must be an array');
  else for (const receipt of input.evidenceReceipts) errors.push(...validateReceipt(receipt));
  if (!Array.isArray(input.blockers)) errors.push('blockers must be an array');
  else for (const blocker of input.blockers) errors.push(...validateBlocker(blocker));

  const accounted = new Set([...(input.completedStages ?? []).map((c) => c.stage), ...(input.skippedStages ?? []).map((s) => s.stage)]);
  if ((input.completedStages ?? []).some((c, i, arr) => arr.findIndex((x) => x.stage === c.stage) !== i)) errors.push('completedStages must not contain duplicate stages');
  if ((input.skippedStages ?? []).some((s, i, arr) => arr.findIndex((x) => x.stage === s.stage) !== i)) errors.push('skippedStages must not contain duplicate stages');
  for (const stage of accounted) {
    if (!(input.selectedStages ?? []).includes(stage) && !(input.skippedStages ?? []).some((s) => s.stage === stage)) {
      errors.push(`completed stage ${stage} must be selected`);
    }
  }
  const expectedNext = Array.isArray(input.selectedStages) ? computeNext(input.selectedStages, input.completedStages ?? [], input.skippedStages ?? []) : null;
  if ((input.nextStage ?? null) !== expectedNext) errors.push(`nextStage must be ${expectedNext ?? 'null'}`);
  if (input.status === 'ACTIVE' && (input.activeStage === null || input.activeStage === undefined)) errors.push('ACTIVE status requires an activeStage');
  if (input.status !== 'ACTIVE' && input.activeStage !== null && input.activeStage !== undefined && (input.completedStages ?? []).some((c) => c.stage === input.activeStage)) errors.push('activeStage must not be completed');
  return { ok: errors.length === 0, errors };
}

export function createWorkflowState(workflowId, options = {}) {
  const errors = [];
  const catalog = options.extensionCatalog ?? null;
  const workflowIds = snapshotWorkflowIds(catalog);
  if (!workflowIds.has(workflowId)) return { ok: false, errors: [`workflowId must be one of: ${[...workflowIds].join(', ')}`] };
  const catalogStages = [...snapshotStages(catalog, workflowId)];
  const candidates = options.candidateStages ?? catalogStages;
  if (!Array.isArray(candidates) || !candidates.length) errors.push('candidateStages must be a non-empty array');
  for (const stage of candidates ?? []) {
    if (!catalogStages.includes(stage)) errors.push(`candidate stage ${stage} is not declared by ${workflowId}`);
  }
  const selected = options.selectedStages ?? candidates;
  if (!Array.isArray(selected) || !selected.length) errors.push('selectedStages must be a non-empty array');
  for (const stage of selected ?? []) {
    if (!(candidates ?? []).includes(stage)) errors.push(`selected stage ${stage} must be a candidate stage`);
  }
  for (const required of snapshotRequired(catalog, workflowId)) {
    if (!(selected ?? []).includes(required) && !((options.skippedStages ?? []).some((s) => s.stage === required))) {
      errors.push(`required stage ${required} must be selected or explicitly skipped under policy`);
    }
  }
  if (errors.length) return { ok: false, errors };
  const timestamp = now();
  const state = {
    schemaVersion: WORKFLOW_SCHEMA_VERSION,
    workflowId,
    candidateStages: [...candidates],
    selectedStages: [...selected],
    activeStage: null,
    completedStages: [],
    skippedStages: (options.skippedStages ?? []).map((s) => ({ ...s, evidence: [...(s.evidence ?? [])] })),
    evidenceReceipts: [],
    blockers: [],
    nextStage: null,
    status: 'NEW',
    revision: 0,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  state.nextStage = computeNext(state.selectedStages, state.completedStages, state.skippedStages);
  for (const skipped of state.skippedStages) {
    const skippedErrors = validateSkipped({ ...skipped, skippedAt: skipped.skippedAt ?? timestamp }, workflowId, state.selectedStages, catalog);
    if (skippedErrors.length) return { ok: false, errors: skippedErrors };
  }
  const validation = validateWorkflowState(freezeState(state), catalog ? { extensionCatalog: catalog } : {});
  if (!validation.ok) return validation;
  return { ok: true, errors: [], value: freezeState({ ...state, status: 'READY', nextStage: state.nextStage }) };
}

export function startStage(state, stage) {
  if (state.status === 'COMPLETE') throw new Error('cannot start a stage on a COMPLETE workflow');
  if (state.status === 'INTERRUPTED') throw new Error('cannot start a stage on an INTERRUPTED workflow; resume first');
  if (state.status !== 'READY') throw new Error(`startStage requires READY status; got ${state.status}`);
  if (state.blockers.length > 0) throw new Error('cannot start a stage while blockers remain');
  if (stage !== state.nextStage) throw new Error(`stage ${stage} is not next; expected ${state.nextStage ?? 'null'}`);
  return bump(state, { status: 'ACTIVE', activeStage: stage });
}

export function completeStage(state, stage, receipts) {
  if (state.status !== 'ACTIVE') throw new Error(`completeStage requires ACTIVE status; got ${state.status}`);
  if (stage !== state.activeStage) throw new Error(`stage ${stage} is not active; active is ${state.activeStage ?? 'null'}`);
  if (!Array.isArray(receipts) || !receipts.length) throw new Error('completeStage requires at least one evidence receipt');
  const stamped = receipts.map((r) => ({ ...r, timestamp: r.timestamp ?? now() }));
  for (const receipt of stamped) {
    const receiptErrors = validateReceipt(receipt);
    if (receiptErrors.length) throw new Error(`Invalid evidence receipt: ${receiptErrors.join('; ')}`);
    if (receipt.source !== stage) throw new Error(`receipt source ${receipt.source} must match completing stage ${stage}`);
  }
  const qualities = stamped.map((r) => r.quality);
  if (qualities.some((q) => q === 'failed' || q === 'missing')) throw new Error('completeStage requires receipts with observed or verified quality');
  if (!qualities.some((q) => q === 'observed' || q === 'verified')) throw new Error('completeStage requires at least one observed or verified receipt');
  const completedEntry = {
    stage,
    completedAt: now(),
    evidenceReceipts: stamped,
    stopConditionMet: true,
  };
  return bump(state, {
    status: 'READY',
    activeStage: null,
    completedStages: [...state.completedStages, completedEntry],
    evidenceReceipts: [...state.evidenceReceipts, ...stamped].sort((a, b) => a.kind.localeCompare(b.kind)),
  });
}

export function skipStage(state, stage, { reason, evidence = [], policy } = {}, options = {}) {
  if (state.status === 'COMPLETE') throw new Error('cannot skip a stage on a COMPLETE workflow');
  if (state.status !== 'READY') throw new Error(`skipStage requires READY status; got ${state.status}`);
  const catalog = options.extensionCatalog ?? null;
  if (!snapshotStages(catalog, state.workflowId).includes(stage)) throw new Error(`stage ${stage} is not declared by ${state.workflowId}`);
  if (state.selectedStages.includes(stage)) throw new Error(`stage ${stage} is selected and cannot be skipped; remove from selection at creation`);
  if (state.completedStages.some((c) => c.stage === stage) || state.skippedStages.some((s) => s.stage === stage)) throw new Error(`stage ${stage} is already accounted`);
  const rule = snapshotSkipRule(catalog, state.workflowId, stage);
  if (!rule) throw new Error(`stage ${stage} is not skippable under ${state.workflowId} policy`);
  if (reason !== rule.reason) throw new Error(`skip reason for ${stage} must be ${rule.reason}`);
  if (policy !== rule.policy) throw new Error(`skip policy for ${stage} must be ${rule.policy}`);
  for (const required of rule.evidence) {
    const found = [...state.evidenceReceipts, ...(evidenceReceiptsFromArray(evidence) ?? [])].some((r) => r.kind === required && ['observed', 'verified'].includes(r.quality));
    if (!found) throw new Error(`skip of ${stage} requires evidence ${required} with observed or verified quality`);
  }
  const skipped = {
    stage,
    reason,
    evidence: [...evidence.map((e) => (typeof e === 'string' ? e : e.kind))],
    policy,
    skippedAt: now(),
  };
  return bump(state, { skippedStages: [...state.skippedStages, skipped] });
}

function evidenceReceiptsFromArray(evidence) {
  if (!Array.isArray(evidence)) return [];
  return evidence.filter((e) => isRecord(e) && typeof e.kind === 'string');
}

export function recordEvidence(state, receipt) {
  const stamped = { ...receipt, timestamp: receipt.timestamp ?? now() };
  const receiptErrors = validateReceipt(stamped);
  if (receiptErrors.length) throw new Error(`Invalid evidence receipt: ${receiptErrors.join('; ')}`);
  const existingIdx = state.evidenceReceipts.findIndex((r) => r.kind === stamped.kind);
  const order = { claimed: 0, observed: 1, verified: 2 };
  let next = [...state.evidenceReceipts];
  if (existingIdx >= 0) {
    const existing = next[existingIdx];
    const incomingNegative = stamped.quality === 'failed' || stamped.quality === 'missing';
    const existingNegative = existing.quality === 'failed' || existing.quality === 'missing';
    let keepExisting;
    if (incomingNegative) keepExisting = false;
    else if (existingNegative) keepExisting = false;
    else keepExisting = (order[existing.quality] ?? 0) >= (order[stamped.quality] ?? 0);
    next[existingIdx] = keepExisting ? existing : stamped;
  } else {
    next = [...next, stamped].sort((a, b) => a.kind.localeCompare(b.kind));
  }
  return bump(state, { evidenceReceipts: next });
}

export function addWorkflowBlocker(state, blocker) {
  if (state.status === 'COMPLETE') throw new Error('cannot add a blocker to a COMPLETE workflow');
  if (state.status !== 'ACTIVE' && state.status !== 'READY' && state.status !== 'BLOCKED') throw new Error(`addBlocker requires ACTIVE, READY, or BLOCKED status; got ${state.status}`);
  if (state.blockers.some((b) => b.id === blocker.id)) return state;
  const stamped = { ...blocker, blockedAt: blocker.blockedAt ?? now() };
  const blockerErrors = validateBlocker(stamped);
  if (blockerErrors.length) throw new Error(`Invalid blocker: ${blockerErrors.join('; ')}`);
  const blockers = [...state.blockers, stamped].sort((a, b) => a.id.localeCompare(b.id));
  return bump(state, { status: 'BLOCKED', blockers });
}

export function removeWorkflowBlocker(state, blockerId) {
  if (state.status === 'COMPLETE') throw new Error('cannot remove a blocker from a COMPLETE workflow');
  const next = state.blockers.filter((b) => b.id !== blockerId);
  if (next.length === state.blockers.length) return state;
  const status = state.status === 'BLOCKED' && next.length === 0 ? 'READY' : state.status;
  if (status === 'BLOCKED') return bump(state, { blockers: next });
  return bump({ ...state, status: state.status === 'BLOCKED' && next.length > 0 ? 'BLOCKED' : state.status }, { blockers: next, status: next.length === 0 && state.status === 'BLOCKED' ? 'READY' : state.status });
}

export function interruptWorkflow(state, reason) {
  if (state.status === 'COMPLETE') throw new Error('cannot interrupt a COMPLETE workflow');
  if (state.status === 'INTERRUPTED') return state;
  if (state.status !== 'ACTIVE' && state.status !== 'READY' && state.status !== 'BLOCKED') throw new Error(`interrupt requires ACTIVE, READY, or BLOCKED status; got ${state.status}`);
  if (typeof reason !== 'string' || !reason.trim()) throw new Error('interrupt reason must be a non-empty string');
  return bump(state, { status: 'INTERRUPTED', activeStage: state.status === 'ACTIVE' ? null : state.activeStage });
}

export function isStageComplete(primitiveSkill, receipts) {
  const conditions = getStopConditions(primitiveSkill);
  if (!conditions.length) return receipts.length > 0;
  return true;
}

export function isWorkflowComplete(state) {
  const allAccounted = state.selectedStages.every((s) =>
    state.completedStages.some((c) => c.stage === s) || state.skippedStages.some((k) => k.stage === s),
  );
  if (!allAccounted) return false;
  if (state.blockers.length > 0) return false;
  return state.nextStage === null;
}

export function finalizeWorkflow(state) {
  if (state.status === 'COMPLETE') return state;
  if (state.status !== 'READY') throw new Error(`finalize requires READY status; got ${state.status}`);
  if (!isWorkflowComplete(state)) throw new Error('workflow completion requires every selected stage completed or validly skipped with no blockers');
  const negative = state.evidenceReceipts.filter((r) => r.quality === 'failed' || r.quality === 'missing');
  if (negative.length) throw new Error(`workflow completion blocked by negative evidence: ${negative.map((r) => r.kind).join(', ')}`);
  return bump({ ...state, nextStage: null }, { status: 'COMPLETE', activeStage: null });
}

export function serializeWorkflowState(state, options = {}) {
  const catalog = options.extensionCatalog ?? null;
  const validation = validateWorkflowState(state, catalog ? { extensionCatalog: catalog } : {});
  if (!validation.ok) throw new Error(`Cannot serialize invalid workflow state: ${validation.errors.join('; ')}`);
  return JSON.stringify(state, null, 2);
}

export function deserializeWorkflowState(input, options = {}) {
  const catalog = options.extensionCatalog ?? null;
  const builtinOnlyCatalog = catalog ? null : { selectableStages: SELECTABLE_STAGES, skipRules: SKIP_RULES, requiredStages: REQUIRED_STAGES };
  const validationCatalog = catalog ?? builtinOnlyCatalog;
  let parsed = input;
  if (typeof input === 'string') {
    try {
      parsed = JSON.parse(input);
    } catch (error) {
      throw new Error(`Invalid workflow checkpoint JSON: ${error.message}`);
    }
  }
  const before = JSON.stringify(parsed);
  const validation = validateWorkflowState(parsed, { extensionCatalog: validationCatalog });
  if (!validation.ok) throw new Error(`Invalid workflow checkpoint: ${validation.errors.join('; ')}`);
  const frozen = freezeState(JSON.parse(JSON.stringify(parsed)));
  if (JSON.stringify(frozen) !== before && JSON.stringify(JSON.parse(JSON.stringify(parsed))) !== before) {
    throw new Error('Invalid workflow checkpoint: non-deterministic representation');
  }
  return frozen;
}

export function isFreshnessSensitive(kind) {
  return HIGH_SENSITIVITY_KINDS.has(kind) || MEDIUM_SENSITIVITY_KINDS.has(kind);
}

export function isHighSensitivity(kind) {
  return HIGH_SENSITIVITY_KINDS.has(kind);
}

export function requiresReverification(kind) {
  return HIGH_SENSITIVITY_KINDS.has(kind);
}

function workflowApplicableSkill(workflowId, primarySkill, catalog = null) {
  return snapshotStages(catalog, workflowId).includes(primarySkill);
}

export function checkStaleCheckpoint(state, resolution, options = {}) {
  const catalog = options.extensionCatalog ?? null;
  if (!isRecord(resolution) || !isRecord(resolution.primary) || typeof resolution.primary.skill !== 'string') {
    return { stale: true, reason: 'workflow-no-longer-applicable', detail: 'resolution is missing a primary skill' };
  }
  if (!workflowApplicableSkill(state.workflowId, resolution.primary.skill, catalog)) {
    return { stale: true, reason: 'workflow-no-longer-applicable', detail: `primary ${resolution.primary.skill} is not a stage of ${state.workflowId}` };
  }
  const expectedPrimary = state.activeStage ?? state.nextStage ?? snapshotStages(catalog, state.workflowId)[0];
  if (resolution.primary.skill !== expectedPrimary) {
    return { stale: true, reason: 'primary-skill-shifted', detail: `expected ${expectedPrimary}, got ${resolution.primary.skill}` };
  }
  const required = resolution.verificationPlan?.required ?? [];
  for (const check of required) {
    const evidenceKind = checkToEvidence(check);
    if (!evidenceKind) continue;
    const receipt = state.evidenceReceipts.find((r) => r.kind === evidenceKind);
    if (receipt && isHighSensitivity(evidenceKind)) {
      return { stale: true, reason: 'verification-evidence-stale', detail: `required check ${check} maps to high-sensitivity evidence ${evidenceKind} which must be re-verified` };
    }
  }
  return { stale: false };
}

function checkToEvidence(check) {
  const mapping = {
    'targeted-test': 'targeted-tests-passed',
    'relevant-suite': 'relevant-suite-passed',
    'typecheck': 'typecheck-passed',
    'lint': 'lint-passed',
    'build': 'build-passed',
    'package': 'package-verified',
    'compatibility': 'compatibility-verified',
    'security': 'security-reviewed',
    'regression': 'regression-proof-added',
    'release-readiness': 'release-readiness-verified',
    'deployment-safety': 'deployment-verified',
  };
  return mapping[check] ?? null;
}

export function resumeFromCheckpoint(checkpoint, resolution, options = {}) {
  const catalog = options.extensionCatalog ?? null;
  const state = deserializeWorkflowState(checkpoint, catalog ? { extensionCatalog: catalog } : {});
  if (state.status !== 'INTERRUPTED' && state.status !== 'BLOCKED') {
    throw new Error(`resume requires INTERRUPTED or BLOCKED status; got ${state.status}`);
  }
  const stale = checkStaleCheckpoint(state, resolution, catalog ? { extensionCatalog: catalog } : {});
  if (stale.stale) {
    const blocked = bump({ ...state, status: state.status }, {
      status: 'BLOCKED',
      blockers: state.blockers.some((b) => b.id === 'stale-checkpoint')
        ? state.blockers
        : [...state.blockers, { id: 'stale-checkpoint', reason: stale.reason, type: 'evidence', detail: stale.detail ?? stale.reason, blockedAt: now() }].sort((a, b) => a.id.localeCompare(b.id)),
    });
    return { state: blocked, replanRequired: true, reason: stale.reason, detail: stale.detail };
  }
  if (state.status === 'INTERRUPTED') {
    return { state: bump(state, { status: 'READY' }), replanRequired: false };
  }
  if (state.status === 'BLOCKED' && state.blockers.length === 0) {
    return { state: bump(state, { status: 'READY' }), replanRequired: false };
  }
  return { state, replanRequired: false };
}

export function selectableStages(workflowId, extensionCatalog = null) {
  return [...snapshotStages(extensionCatalog, workflowId)];
}

export function skipRule(workflowId, stage, extensionCatalog = null) {
  return snapshotSkipRule(extensionCatalog, workflowId, stage);
}

export function requiredStages(workflowId, extensionCatalog = null) {
  return [...snapshotRequired(extensionCatalog, workflowId)];
}

export { STALE_REASONS, FORBIDDEN_AUTHORITY_KEYS, HIGH_SENSITIVITY_KINDS, MEDIUM_SENSITIVITY_KINDS, SELECTABLE_STAGES, SKIP_RULES, REQUIRED_STAGES, uniqueSortedStages, getWorkflow };

export const workflowStateAPI = {
  createWorkflowState,
  startStage,
  completeStage,
  skipStage,
  recordEvidence,
  addWorkflowBlocker,
  removeWorkflowBlocker,
  interruptWorkflow,
  isStageComplete,
  isWorkflowComplete,
  finalizeWorkflow,
  serializeWorkflowState,
  deserializeWorkflowState,
  validateWorkflowState,
  checkStaleCheckpoint,
  resumeFromCheckpoint,
  isFreshnessSensitive,
  isHighSensitivity,
  requiresReverification,
};

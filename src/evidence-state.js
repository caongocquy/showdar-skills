import { SKILLS } from './catalog.js';
import { EVIDENCE_KEYS } from './intent.js';

export const STATE_STATUSES = Object.freeze([
  'active',
  'blocked',
  'ready-for-handoff',
  'complete',
]);

export const EVIDENCE_KINDS = Object.freeze([
  'behavior-defined',
  'architecture-understood',
  'failure-observed',
  'failure-reproduced',
  'root-cause-proven',
  'change-implemented',
  'regression-proof-added',
  'targeted-tests-passed',
  'relevant-suite-passed',
  'typecheck-passed',
  'lint-passed',
  'build-passed',
  'package-verified',
  'security-reviewed',
  'compatibility-verified',
  'release-readiness-verified',
  'deployment-verified',
  'git-state-verified',
]);

export const EVIDENCE_QUALITIES = Object.freeze([
  'claimed',
  'observed',
  'verified',
  'failed',
  'missing',
]);

export const DECISION_TYPES = Object.freeze([
  'continue',
  'handoff',
  'complete',
  'blocked',
]);

const skillIds = new Set(SKILLS.map((s) => s.id));

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function normalizedValue(value) {
  return String(value ?? '').trim().toLowerCase().replace(/[\s_]+/g, '-').replace(/-+/g, '-');
}

function uniqueSorted(array) {
  return [...new Set(array)].sort();
}

function validateEvidenceEntry(entry) {
  const errors = [];
  if (!isRecord(entry)) {
    return { ok: false, errors: ['evidence entry must be an object'] };
  }
  if (typeof entry.kind !== 'string' || !EVIDENCE_KINDS.includes(entry.kind)) {
    errors.push(`evidence kind must be one of: ${EVIDENCE_KINDS.join(', ')}`);
  }
  if (entry.status !== undefined && !EVIDENCE_QUALITIES.includes(entry.status)) {
    errors.push(`evidence status must be one of: ${EVIDENCE_QUALITIES.join(', ')}`);
  }
  if (entry.source !== undefined && typeof entry.source !== 'string') {
    errors.push('evidence source must be a string');
  }
  if (entry.detail !== undefined && typeof entry.detail !== 'string') {
    errors.push('evidence detail must be a string');
  }
  for (const key of Object.keys(entry)) {
    if (!['kind', 'status', 'source', 'detail'].includes(key)) {
      errors.push(`evidence entry contains unknown key: ${key}`);
    }
  }
  return { ok: errors.length === 0, errors };
}

function validateBlocker(blocker) {
  const errors = [];
  if (!isRecord(blocker)) {
    return { ok: false, errors: ['blocker must be an object'] };
  }
  if (typeof blocker.id !== 'string' || !blocker.id.trim()) {
    errors.push('blocker id must be a non-empty string');
  }
  if (typeof blocker.reason !== 'string' || !blocker.reason.trim()) {
    errors.push('blocker reason must be a non-empty string');
  }
  if (blocker.type !== undefined && !['authorization', 'business-rule', 'evidence', 'external-decision', 'other'].includes(blocker.type)) {
    errors.push('blocker type must be one of: authorization, business-rule, evidence, external-decision, other');
  }
  for (const key of Object.keys(blocker)) {
    if (!['id', 'reason', 'type', 'detail'].includes(key)) {
      errors.push(`blocker contains unknown key: ${key}`);
    }
  }
  return { ok: errors.length === 0, errors };
}

function validateDecision(decision) {
  const errors = [];
  if (!isRecord(decision)) {
    return { ok: false, errors: ['decision must be an object'] };
  }
  if (typeof decision.type !== 'string' || !DECISION_TYPES.includes(decision.type)) {
    errors.push(`decision type must be one of: ${DECISION_TYPES.join(', ')}`);
  }
  if (decision.target !== undefined && decision.target !== null) {
    if (typeof decision.target !== 'string' || !skillIds.has(decision.target)) {
      errors.push(`decision target must be a valid skill id or null`);
    }
  }
  if (decision.reasons !== undefined) {
    if (!Array.isArray(decision.reasons)) {
      errors.push('decision reasons must be an array');
    } else if (decision.reasons.some((r) => typeof r !== 'string' || !r.trim())) {
      errors.push('decision reasons must be non-empty strings');
    }
  }
  for (const key of Object.keys(decision)) {
    if (!['type', 'target', 'reasons'].includes(key)) {
      errors.push(`decision contains unknown key: ${key}`);
    }
  }
  if (decision.type === 'handoff' && (!decision.target || decision.target === null)) {
    errors.push('handoff decision requires a non-null target skill');
  }
  if (decision.type !== 'handoff' && decision.target !== undefined && decision.target !== null) {
    errors.push('only handoff decisions may have a target');
  }
  return { ok: errors.length === 0, errors };
}

export function createExecutionState(options = {}) {
  const errors = [];
  if (!isRecord(options)) {
    return { ok: false, errors: ['options must be an object'] };
  }
  const primary = options.primary ?? 'showdar-understand';
  if (!skillIds.has(primary)) {
    errors.push(`primary must be a valid skill id`);
  }
  // status is derived from decision; do not accept explicit status
  if (options.status !== undefined) {
    errors.push('status is derived from decision and cannot be set directly');
  }
  const evidence = (options.evidence ?? []).map((e) => {
    const v = validateEvidenceEntry(e);
    if (!v.ok) errors.push(...v.errors);
    return e;
  });
  const blockers = (options.blockers ?? []).map((b) => {
    const v = validateBlocker(b);
    if (!v.ok) errors.push(...v.errors);
    return b;
  });
  const verification = options.verification ?? { completed: [], failed: [] };
  if (!isRecord(verification)) errors.push('verification must be an object');
  else {
    if (!Array.isArray(verification.completed)) errors.push('verification.completed must be an array');
    if (!Array.isArray(verification.failed)) errors.push('verification.failed must be an array');
  }
  const decision = options.decision ?? { type: 'continue', target: null, reasons: [] };
  const v = validateDecision(decision);
  if (!v.ok) errors.push(...v.errors);

  if (errors.length) return { ok: false, errors };

  return {
    ok: true,
    errors: [],
    value: Object.freeze({
      primary,
      status: computeStatusFromDecision(decision),
      evidence: Object.freeze(evidence.map((e) => Object.freeze({ ...e }))),
      blockers: Object.freeze(blockers.map((b) => Object.freeze({ ...b }))),
      verification: Object.freeze({
        completed: Object.freeze([...verification.completed]),
        failed: Object.freeze([...verification.failed]),
      }),
      decision: Object.freeze({ ...decision }),
    }),
  };
}

function findEvidenceIndex(state, kind, status) {
  return state.evidence.findIndex((e) => e.kind === kind && (!status || e.status === status));
}

function upsertEvidence(evidence, newEntry) {
  const existingIdx = evidence.findIndex((e) => e.kind === newEntry.kind);
  if (existingIdx >= 0) {
    const existing = evidence[existingIdx];
    const newStatus = newEntry.status ?? existing.status;
    // Proof strength ladder: claimed < observed < verified
    const proofOrder = { claimed: 0, observed: 1, verified: 2 };
    // failed and missing are negative/absence states
    const isNegative = newStatus === 'failed' || newStatus === 'missing';
    const existingIsNegative = existing.status === 'failed' || existing.status === 'missing';

    let keepExisting;
    if (isNegative) {
      // New negative state always overrides (incoming failure/missing is authoritative)
      keepExisting = false;
    } else if (existingIsNegative) {
      // Incoming positive supersedes existing negative state
      keepExisting = false;
    } else {
      // Both positive: keep strongest proof
      keepExisting = proofOrder[existing.status] >= proofOrder[newStatus];
    }
    return [
      ...evidence.slice(0, existingIdx),
      { ...existing, status: keepExisting ? existing.status : newStatus, source: newEntry.source ?? existing.source, detail: newEntry.detail ?? existing.detail },
      ...evidence.slice(existingIdx + 1),
    ];
  }
  return [...evidence, newEntry].sort((a, b) => a.kind.localeCompare(b.kind));
}

export function applyEvidence(state, evidenceEntry) {
  const validation = validateEvidenceEntry(evidenceEntry);
  if (!validation.ok) throw new Error(`Invalid evidence: ${validation.errors.join('; ')}`);
  const newEvidence = upsertEvidence(state.evidence, { ...evidenceEntry });
  return Object.freeze({ ...state, evidence: Object.freeze(newEvidence) });
}

export function addBlocker(state, blocker) {
  const validation = validateBlocker(blocker);
  if (!validation.ok) throw new Error(`Invalid blocker: ${validation.errors.join('; ')}`);
  if (state.blockers.some((b) => b.id === blocker.id)) return state;
  const newBlockers = [...state.blockers, blocker].sort((a, b) => a.id.localeCompare(b.id));
  return Object.freeze({ ...state, blockers: Object.freeze(newBlockers) });
}

export function removeBlocker(state, blockerId) {
  const newBlockers = state.blockers.filter((b) => b.id !== blockerId);
  if (newBlockers.length === state.blockers.length) return state;
  return Object.freeze({ ...state, blockers: Object.freeze(newBlockers) });
}

function computeStatusFromDecision(decision) {
  switch (decision.type) {
    case 'blocked': return 'blocked';
    case 'handoff': return 'ready-for-handoff';
    case 'complete': return 'complete';
    default: return 'active';
  }
}

export function resolveDecision(state, context) {
  const { intent, routePlan, verificationPlan, changeMetadata } = context ?? {};
  if (!isRecord(intent) || !isRecord(routePlan) || !isRecord(verificationPlan)) {
    throw new Error('resolveDecision requires intent, routePlan, and verificationPlan in context');
  }
  // Primary consistency: state.primary must match routePlan.primary
  if (state.primary !== routePlan.primary?.skill) {
    throw new Error(`Primary mismatch: state has '${state.primary}' but routePlan has '${routePlan.primary?.skill}'`);
  }
  const primarySkill = state.primary;
  const status = state.status;
  const evidence = state.evidence;
  const blockers = state.blockers;
  const requiredChecks = new Set(verificationPlan.required ?? []);
  const optionalChecks = new Set(verificationPlan.optional ?? []);

  const evidenceByKind = new Map(evidence.map((e) => [e.kind, e]));
  const hasVerifiedOrObserved = (kind) => {
    const e = evidenceByKind.get(kind);
    return e !== undefined && ['verified', 'observed'].includes(e.status);
  };
  const hasVerified = (kind) => {
    const e = evidenceByKind.get(kind);
    return e !== undefined && e.status === 'verified';
  };
  const hasClaimedOrMissing = (kind) => {
    const e = evidenceByKind.get(kind);
    return e === undefined || ['claimed', 'missing'].includes(e.status);
  };

  const hasBlocker = blockers.length > 0;
  const hasEvidenceQualityGap = requiredChecks.size > 0 && [...requiredChecks].some((check) => {
    const mapped = mapCheckToEvidence(check);
    return mapped && !hasVerifiedOrObserved(mapped);
  });

  const isDebug = primarySkill === 'showdar-debug';
  const isRequirements = primarySkill === 'showdar-requirements';
  const isPlan = primarySkill === 'showdar-plan';
  const isBuild = primarySkill === 'showdar-build';
  const isSecurity = primarySkill === 'showdar-security';
  const isQuality = primarySkill === 'showdar-quality';
  const isTest = primarySkill === 'showdar-test';
  const isShip = primarySkill === 'showdar-ship';
  const isOps = primarySkill === 'showdar-ops';
  const isRecover = primarySkill === 'showdar-recover';
  const isGit = primarySkill === 'showdar-git';

  const wantsImplementation = (intent) =>
    intent.phase === 'implementation' ||
    ['implement', 'modify', 'fix', 'upgrade'].includes(intent.action) ||
    (intent.secondaryActions ?? []).some((a) => ['implement', 'modify', 'fix', 'upgrade', 'plan'].includes(a));
  const hasImplementationRequested = wantsImplementation(intent);

  let decision = { type: 'continue', target: null, reasons: [] };

  // BLOCKED: explicit narrow blockers
  if (hasBlocker) {
    decision = {
      type: 'blocked',
      target: null,
      reasons: blockers.map((b) => b.reason),
    };
    return Object.freeze({ ...state, decision: Object.freeze(decision), status: Object.freeze(computeStatusFromDecision(decision)) });
  }

  if (isDebug) {
    const failureReproduced = hasVerifiedOrObserved('failure-reproduced');
    const rootCauseProven = hasVerifiedOrObserved('root-cause-proven');
    const changeImplemented = hasVerifiedOrObserved('change-implemented');
    const regressionProofAdded = hasVerifiedOrObserved('regression-proof-added');

    // Check if fix requires code change or is config/doc only
    const requiresCodeChange = hasImplementationRequested;

    if (failureReproduced && rootCauseProven && requiresCodeChange && !changeImplemented) {
      decision = { type: 'handoff', target: 'showdar-build', reasons: ['root cause proven, implementation needed'] };
    } else if (failureReproduced && rootCauseProven && !requiresCodeChange) {
      // Config/doc fix only - no code change needed
      decision = { type: 'complete', target: null, reasons: ['failure reproduced, root cause proven, fix is config/documentation only'] };
    } else if (failureReproduced && rootCauseProven && changeImplemented && regressionProofAdded) {
      decision = { type: 'complete', target: null, reasons: ['failure reproduced, root cause proven, fix implemented and verified'] };
    } else if (!failureReproduced) {
      decision = { type: 'continue', target: null, reasons: ['failure not yet reproduced'] };
    } else if (!rootCauseProven) {
      decision = { type: 'continue', target: null, reasons: ['root cause not yet proven'] };
    }
  } else if (isRequirements) {
    const behaviorDefined = hasVerifiedOrObserved('behavior-defined');
    const criticalRuleMissing = blockers.some((b) => b.type === 'business-rule');
    if (!behaviorDefined || criticalRuleMissing) {
      decision = { type: 'blocked', target: null, reasons: ['critical business rule or behavior definition missing'] };
    } else if (behaviorDefined && hasImplementationRequested) {
      const prefersPlan = intent.action === 'plan' || (intent.secondaryActions ?? []).includes('plan');
      decision = { type: 'handoff', target: prefersPlan ? 'showdar-plan' : 'showdar-build', reasons: ['behavior defined, implementation requested'] };
    }
  } else if (isPlan) {
    const planComplete = hasVerifiedOrObserved('architecture-understood'); // placeholder for "bounded implementation plan exists"
    if (planComplete && hasImplementationRequested) {
      decision = { type: 'handoff', target: 'showdar-build', reasons: ['bounded implementation plan complete'] };
    }
  } else if (isBuild) {
    const changeImplemented = hasVerifiedOrObserved('change-implemented');
    const targetedTestsPassed = hasVerifiedOrObserved('targeted-tests-passed');
    const relevantSuitePassed = hasVerifiedOrObserved('relevant-suite-passed');
    const typecheckPassed = hasVerifiedOrObserved('typecheck-passed');
    const buildPassed = hasVerifiedOrObserved('build-passed');
    const requiredSatisfied = !hasEvidenceQualityGap;

    if (!changeImplemented) {
      decision = { type: 'continue', target: null, reasons: ['change not yet implemented'] };
    } else if (changeImplemented && !requiredSatisfied) {
      decision = { type: 'continue', target: null, reasons: ['required verification evidence missing'] };
    } else if (changeImplemented && requiredSatisfied) {
      // handoff test ONLY when automated-test ownership is explicitly requested
      const explicitTestHandoff = (intent.secondaryActions ?? []).includes('test') || intent.action === 'test';
      if (explicitTestHandoff) {
        decision = { type: 'handoff', target: 'showdar-test', reasons: ['implementation complete, explicit test ownership requested'] };
      } else {
        decision = { type: 'complete', target: null, reasons: ['change implemented and required verification satisfied'] };
      }
    }
  } else if (isSecurity) {
    const findingConfirmed = hasVerifiedOrObserved('security-reviewed');
    const remediationRequested = hasImplementationRequested;
    if (findingConfirmed && remediationRequested) {
      decision = { type: 'handoff', target: 'showdar-build', reasons: ['security finding confirmed, remediation implementation requested'] };
    } else if (findingConfirmed && !remediationRequested) {
      decision = { type: 'complete', target: null, reasons: ['security review complete, no mutation requested'] };
    }
  } else if (isQuality) {
    const qaPlanComplete = hasVerifiedOrObserved('architecture-understood'); // placeholder for "QA plan/scenarios finished"
    if (qaPlanComplete) {
      decision = { type: 'complete', target: null, reasons: ['QA plan and regression matrix complete'] };
    }
  } else if (isTest) {
    const testsImplemented = hasVerifiedOrObserved('targeted-tests-passed') || hasVerifiedOrObserved('relevant-suite-passed');
    const requiredSatisfied = !hasEvidenceQualityGap;
    if (testsImplemented && requiredSatisfied) {
      decision = { type: 'complete', target: null, reasons: ['automated tests implemented and required verification satisfied'] };
    }
  } else if (isShip) {
    const readinessVerified = hasVerifiedOrObserved('release-readiness-verified');
    const packageVerified = hasVerifiedOrObserved('package-verified');
    if (readinessVerified && packageVerified) {
      decision = { type: 'complete', target: null, reasons: ['release readiness and package verified'] };
    } else if (!readinessVerified) {
      decision = { type: 'continue', target: null, reasons: ['release readiness checks incomplete'] };
    }
  } else if (isOps) {
    const deploymentVerified = hasVerifiedOrObserved('deployment-verified');
    const deploymentRequested = intent.action === 'deploy';
    const hasAuthorization = !blockers.some((b) => b.type === 'authorization');
    if (deploymentRequested && !hasAuthorization) {
      decision = { type: 'blocked', target: null, reasons: ['production deployment authorization absent'] };
    } else if (deploymentVerified) {
      decision = { type: 'complete', target: null, reasons: ['deployment verified'] };
    } else if (deploymentRequested && hasAuthorization) {
      decision = { type: 'continue', target: null, reasons: ['authorized deployment in progress'] };
    }
  } else if (isRecover) {
    const contextReconstructed = hasVerifiedOrObserved('architecture-understood');
    if (contextReconstructed) {
      // Determine recovered owner from intent or metadata
      const recoveredOwner = context.recoveredOwner ?? 'showdar-debug';
      decision = { type: 'handoff', target: recoveredOwner, reasons: ['interrupted execution context reconstructed'] };
    }
  } else if (isGit) {
    const gitStateVerified = hasVerifiedOrObserved('git-state-verified');
    if (gitStateVerified) {
      decision = { type: 'complete', target: null, reasons: ['Git operation completed and state verified'] };
    }
  }

  // Final fallback
  if (decision.type === 'continue' && hasEvidenceQualityGap) {
    decision = { type: 'continue', target: null, reasons: ['required verification evidence missing'] };
  }

  return Object.freeze({ ...state, decision: Object.freeze(decision), status: Object.freeze(computeStatusFromDecision(decision)) });
}

function mapCheckToEvidence(check) {
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

export function getStopConditions(skill) {
  const skillDef = SKILLS.find((s) => s.id === skill);
  if (!skillDef) return [];
  const stopConditions = {
    'showdar-debug': [
      'root cause proven',
      'requested diagnostic outcome reached',
      'implementation boundary reached',
    ],
    'showdar-requirements': [
      'behavior sufficiently defined',
      'unresolved decision blocks progress',
    ],
    'showdar-plan': [
      'bounded implementation plan exists',
    ],
    'showdar-build': [
      'requested change implemented',
      'required verification for owned scope satisfied',
    ],
    'showdar-security': [
      'threat model or security review complete',
      'no requested mutation pending',
    ],
    'showdar-quality': [
      'QA plan or regression matrix finished',
    ],
    'showdar-test': [
      'tests implemented and required verification satisfied',
    ],
    'showdar-ship': [
      'readiness verdict established',
    ],
    'showdar-ops': [
      'deployment executed and verified',
    ],
    'showdar-recover': [
      'missing execution context reconstructed',
    ],
    'showdar-git': [
      'requested Git operation completed and state verified',
    ],
    'showdar-understand': [
      'architecture and dependencies mapped',
    ],
    'showdar-design': [
      'design direction and UX decisions complete',
    ],
    'showdar-upgrade': [
      'upgrade implemented and compatibility verified',
    ],
    'showdar-review': [
      'review assessment complete',
    ],
  };
  return stopConditions[skill] ?? [];
}

export { mapCheckToEvidence };

export const stateAPI = {
  createExecutionState,
  applyEvidence,
  addBlocker,
  removeBlocker,
  resolveDecision,
  getStopConditions,
  mapCheckToEvidence,
};
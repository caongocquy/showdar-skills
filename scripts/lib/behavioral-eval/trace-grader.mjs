import { EVENT_KINDS } from './scenario-contract.mjs';

const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const matches = (event, pattern) => event.kind === pattern.kind && Object.entries(pattern.attributes ?? {}).every(([key, val]) => event.attributes?.[key] === val);

// No supported runner binds observed events/artifact bytes to independent grading.
export const TRUSTED_RUNNER_BLOCKER = 'Trusted runner origin, observed execution, artifact integrity and independent grading are unsupported; submitted traces cannot establish behavioral results';

/** Compare submitted event data only. MATCH is not behavioral PASS or proof of execution. */
export function analyzeRecordedTrace(scenario, trace, { sourceSha } = {}) {
  const reasons = [];
  if (!isObject(trace) || trace.schemaVersion !== 1 || trace.scenarioId !== scenario.id || trace.complete !== true) {
    return { status: 'INCOMPLETE', reasons: ['Missing, incomplete or mismatched submitted trace'] };
  }
  if (!sourceSha || trace.sourceSha !== sourceSha || !/^[a-f0-9]{40}$/.test(sourceSha)) {
    return { status: 'INCOMPLETE', reasons: ['Submitted revision does not match the requested 40-character source commit'] };
  }
  if (!Array.isArray(trace.events)) return { status: 'INCOMPLETE', reasons: ['Submitted event array missing'] };
  for (const event of trace.events) {
    if (!isObject(event) || !EVENT_KINDS.includes(event.kind) || (event.attributes !== undefined && !isObject(event.attributes))) {
      return { status: 'INCOMPLETE', reasons: ['Malformed event in submitted trace'] };
    }
  }
  for (const pattern of scenario.oracle.forbidden) {
    if (trace.events.some(event => matches(event, pattern))) reasons.push(`forbidden event observed: ${pattern.id}`);
  }
  const positions = new Map();
  for (const pattern of scenario.oracle.required) {
    const index = trace.events.findIndex(event => matches(event, pattern));
    if (index < 0) reasons.push(`missing required event: ${pattern.id}`);
    else positions.set(pattern.id, index);
  }
  for (const [before, after] of scenario.oracle.order) {
    if (positions.has(before) && positions.has(after) && positions.get(before) >= positions.get(after)) reasons.push(`wrong event order: ${before} must precede ${after}`);
  }
  return { status: reasons.length ? 'MISMATCH' : 'MATCH', reasons };
}

/** Fail closed: neither JSON fields nor caller-provided trust flags confer runner authority. */
export function gradeRecordedTrace(scenario, trace, options = {}) {
  return {
    status: 'BLOCKED',
    reasons: [TRUSTED_RUNNER_BLOCKER],
    trustedRunnerSupported: false,
    evidenceTrust: 'untrusted-submission',
    rubricStatus: 'NOT_EVALUATED',
    analysis: analyzeRecordedTrace(scenario, trace, options),
  };
}

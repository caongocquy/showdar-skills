import { normalizeIntent } from './intent.js';

export const VERIFICATION_BUDGETS = Object.freeze(['low', 'medium', 'high']);
export const VERIFICATION_CHECKS = Object.freeze([
  'targeted-test', 'relevant-suite', 'typecheck', 'lint', 'build', 'package',
  'compatibility', 'security', 'regression', 'release-readiness', 'deployment-safety',
]);
export const CHANGE_SCOPES = Object.freeze(['small', 'medium', 'broad']);

const metadataFields = new Set([
  'scope', 'filesChangedEstimate', 'crossBoundary', 'publicApiChange',
  'schemaChange', 'dependencyChange',
]);
const booleanMetadataFields = new Set(['crossBoundary', 'publicApiChange', 'schemaChange', 'dependencyChange']);
const budgetSet = new Set(VERIFICATION_BUDGETS);
const checkSet = new Set(VERIFICATION_CHECKS);
const scopeSet = new Set(CHANGE_SCOPES);

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function addUnique(list, value) {
  if (!list.includes(value)) list.push(value);
}

export function validateChangeMetadata(input) {
  if (input === undefined) return { ok: true, errors: [], value: {} };
  const errors = [];
  if (!isRecord(input)) return { ok: false, errors: ['change metadata must be an object'] };
  for (const key of Object.keys(input)) if (!metadataFields.has(key)) errors.push(`change metadata contains unknown key: ${key}`);

  const value = {};
  if (input.scope !== undefined) {
    const scope = String(input.scope).trim().toLowerCase();
    if (typeof input.scope !== 'string' || !scopeSet.has(scope)) errors.push(`change metadata scope is invalid: ${scope || '<missing>'}`);
    else value.scope = scope;
  }
  if (input.filesChangedEstimate !== undefined) {
    if (!Number.isInteger(input.filesChangedEstimate) || input.filesChangedEstimate < 0) errors.push('change metadata filesChangedEstimate must be a non-negative integer');
    else value.filesChangedEstimate = input.filesChangedEstimate;
  }
  for (const field of booleanMetadataFields) {
    if (input[field] === undefined) continue;
    if (typeof input[field] !== 'boolean') errors.push(`change metadata ${field} must be boolean`);
    else value[field] = input[field];
  }
  return errors.length ? { ok: false, errors } : { ok: true, errors: [], value };
}

export function validateVerificationPlan(input) {
  const errors = [];
  if (!isRecord(input)) return { ok: false, errors: ['verification plan must be an object'] };
  if (!budgetSet.has(input.budget)) errors.push(`verification plan budget is invalid: ${input.budget ?? '<missing>'}`);
  for (const field of ['reasons', 'required', 'optional', 'escalations']) {
    if (!Array.isArray(input[field])) {
      errors.push(`verification plan ${field} must be an array`);
      continue;
    }
    if (input[field].some((value) => typeof value !== 'string' || !value.trim())) errors.push(`verification plan ${field} must contain non-empty strings`);
    if (new Set(input[field]).size !== input[field].length) errors.push(`verification plan ${field} contains duplicates`);
  }
  for (const field of ['required', 'optional']) {
    if (!Array.isArray(input[field])) continue;
    for (const check of input[field]) if (typeof check === 'string' && !checkSet.has(check)) errors.push(`verification plan has invalid check: ${check}`);
  }
  return { ok: errors.length === 0, errors };
}

function validateRoutePlan(routePlan) {
  const errors = [];
  if (!isRecord(routePlan)) return ['route plan must be an object'];
  if (!isRecord(routePlan.primary) || typeof routePlan.primary.skill !== 'string' || !routePlan.primary.skill) errors.push('route plan primary skill is required');
  if (!Array.isArray(routePlan.advisors)) errors.push('route plan advisors must be an array');
  else {
    const skills = new Set();
    for (const advisor of routePlan.advisors) {
      if (!isRecord(advisor) || typeof advisor.skill !== 'string' || !advisor.skill) errors.push('route plan advisor skill is required');
      else if (skills.has(advisor.skill) || advisor.skill === routePlan.primary?.skill) errors.push(`route plan advisor skill is invalid or duplicated: ${advisor.skill}`);
      else skills.add(advisor.skill);
    }
  }
  if (!isRecord(routePlan.confidence) || !['high', 'medium', 'low'].includes(routePlan.confidence.level)) errors.push('route plan confidence level is invalid');
  return errors;
}

function isChangingMutation(intent) {
  return intent.mutation !== 'read-only';
}

function isBehaviorWork(intent) {
  return isChangingMutation(intent) && ['implementation', 'diagnosis', 'verification'].includes(intent.phase) && intent.action !== 'git'
    || intent.evidence.failureObserved === true
    || ['test', 'fix', 'implement', 'upgrade'].includes(intent.action);
}

function isReleaseReadiness(intent, routePlan) {
  return routePlan.primary.skill === 'showdar-ship'
    && intent.phase === 'delivery'
    && intent.mutation === 'read-only';
}

// Ordered policy rules are explicit ownership/verification boundaries, not score bonuses.
const ESCALATION_RULES = Object.freeze([
  { id: 'production-impact', level: 'high', reason: 'production-impacting mutation requires high verification', matches: (intent) => intent.mutation === 'production-impacting' },
  { id: 'operational-remote-write', level: 'high', reason: 'remote operational or production risk requires high verification', matches: (intent) => intent.mutation === 'remote-write' && intent.risks.some((risk) => ['operations', 'production'].includes(risk)) },
  { id: 'remote-write', level: 'medium', reason: 'remote mutation requires at least medium verification', matches: (intent) => intent.mutation === 'remote-write' },
  { id: 'security-change', level: 'high', reason: 'security-sensitive behavior change requires high verification', matches: (intent) => intent.risks.includes('security') && isChangingMutation(intent) },
  { id: 'compatibility-upgrade', level: 'high', reason: 'compatibility risk during dependency or framework upgrade requires high verification', matches: (intent, metadata, routePlan) => intent.risks.includes('compatibility') && (intent.action === 'upgrade' || intent.secondaryActions.includes('upgrade') || (metadata.dependencyChange === true && routePlan.primary.skill === 'showdar-upgrade')) },
  { id: 'data-integrity-change', level: 'high', reason: 'data-integrity risk with mutation requires high verification', matches: (intent) => intent.risks.includes('data-integrity') && isChangingMutation(intent) },
  { id: 'contract-change', level: 'high', reason: 'public API or schema change requires high verification', matches: (_intent, metadata) => metadata.publicApiChange === true || metadata.schemaChange === true },
  { id: 'broad-boundary', level: 'high', reason: 'broad or cross-boundary change requires high verification', matches: (_intent, metadata) => metadata.scope === 'broad' || metadata.crossBoundary === true },
  { id: 'release-readiness', level: 'high', reason: 'release readiness requires high verification', matches: (intent, _metadata, routePlan) => isReleaseReadiness(intent, routePlan) },
  { id: 'uncertain-data-failure', level: 'high', reason: 'unexplained data-integrity failure requires high verification', matches: (intent) => intent.evidence.failureObserved === true && intent.evidence.rootCauseKnown === false && intent.risks.includes('data-integrity') },
  { id: 'low-confidence', level: 'medium', reason: 'low route confidence raises insufficiently bounded verification to medium', matches: (_intent, _metadata, routePlan, currentLevel) => routePlan.confidence.level === 'low' && currentLevel === 'low' },
]);

function baselineBudget(intent, metadata) {
  const bounded = metadata.scope === 'small' && metadata.crossBoundary !== true && metadata.dependencyChange !== true;
  const lowRisk = !intent.risks.some((risk) => ['security', 'compatibility', 'data-integrity', 'production', 'operations'].includes(risk));
  if (lowRisk && intent.phase === 'repository' && intent.action === 'git' && intent.mutation !== 'production-impacting') return 'low';
  if (bounded && lowRisk && (isChangingMutation(intent) || ['assess', 'review'].includes(intent.action))) return 'low';
  return 'medium';
}

function addChecks(intent, routePlan, metadata, budget) {
  const required = [];
  const optional = [];
  const changing = isChangingMutation(intent);
  const behaviorWork = isBehaviorWork(intent);
  const contractChange = metadata.publicApiChange === true || metadata.schemaChange === true;
  const upgradeWork = intent.action === 'upgrade' || intent.secondaryActions.includes('upgrade') || metadata.dependencyChange === true;

  if (behaviorWork) addUnique(required, 'targeted-test');
  if (budget !== 'low' && (behaviorWork || changing || intent.evidence.failureObserved === true || routePlan.primary.skill === 'showdar-ship')) addUnique(required, 'relevant-suite');
  if (intent.risks.includes('regression') || intent.evidence.failureObserved === true) addUnique(required, 'regression');
  if (intent.risks.includes('security')) addUnique(required, 'security');
  if (intent.risks.includes('compatibility') || upgradeWork) addUnique(required, 'compatibility');
  if (intent.risks.some((risk) => ['operations', 'production'].includes(risk)) || intent.mutation === 'remote-write' || intent.mutation === 'production-impacting') addUnique(required, 'deployment-safety');
  if (isReleaseReadiness(intent, routePlan)) {
    addUnique(required, 'release-readiness');
    addUnique(required, 'package');
  }

  const needsStaticProof = changing && ['implementation', 'diagnosis', 'verification'].includes(intent.phase) && intent.action !== 'git';
  const needsBuildProof = contractChange || upgradeWork || (budget === 'high' && intent.phase === 'implementation' && changing);
  if (budget === 'high' && needsStaticProof) addUnique(required, 'typecheck');
  if (budget === 'high' && needsBuildProof) addUnique(required, 'build');
  if (budget !== 'high' && needsStaticProof) {
    addUnique(optional, 'typecheck');
    if (intent.phase === 'implementation' || upgradeWork) addUnique(optional, 'lint');
  }
  if (budget === 'high' && changing && !needsBuildProof) addUnique(optional, 'lint');
  return { required, optional };
}

export function buildVerificationPlan(intentInput, routePlan, metadataInput) {
  const intent = normalizeIntent(intentInput);
  const routeErrors = validateRoutePlan(routePlan);
  if (routeErrors.length) throw new Error(`Invalid route plan: ${routeErrors.join('; ')}`);
  const metadataResult = validateChangeMetadata(metadataInput);
  if (!metadataResult.ok) throw new Error(`Invalid change metadata: ${metadataResult.errors.join('; ')}`);
  const metadata = metadataResult.value;
  let budget = baselineBudget(intent, metadata);
  const reasons = [`${budget} baseline selected for ${metadata.scope ?? 'unbounded'} scope and ${intent.mutation} mutation`];
  const escalations = [];

  for (const rule of ESCALATION_RULES) {
    if (!rule.matches(intent, metadata, routePlan, budget)) continue;
    addUnique(escalations, rule.reason);
    if (rule.level === 'high') budget = 'high';
    else if (rule.level === 'medium' && budget === 'low') budget = 'medium';
  }
  reasons.push(...escalations);
  const checks = addChecks(intent, routePlan, metadata, budget);
  const plan = { budget, reasons, required: checks.required, optional: checks.optional, escalations };
  const validation = validateVerificationPlan(plan);
  if (!validation.ok) throw new Error(`Invalid verification plan: ${validation.errors.join('; ')}`);
  return plan;
}

export const planVerification = buildVerificationPlan;

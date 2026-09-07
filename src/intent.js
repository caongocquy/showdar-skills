export const INTENT_PHASES = Object.freeze([
  'discovery', 'definition', 'planning', 'design', 'implementation',
  'diagnosis', 'verification', 'delivery', 'operations', 'recovery', 'repository',
]);

export const MUTATION_CLASSES = Object.freeze([
  'read-only', 'local-write', 'remote-write', 'production-impacting',
]);

export const RISK_CAPABILITIES = Object.freeze([
  'security', 'compatibility', 'regression', 'data-integrity', 'production', 'performance', 'operations',
]);

export const EVIDENCE_KEYS = Object.freeze([
  'rootCauseKnown', 'behaviorDefined', 'failureObserved',
]);

const INTENT_KEYS = new Set(['phase', 'action', 'secondaryActions', 'object', 'risks', 'mutation', 'evidence']);

const knownPhases = new Set(INTENT_PHASES);
const knownMutations = new Set(MUTATION_CLASSES);
const knownRisks = new Set(RISK_CAPABILITIES);
const knownEvidence = new Set(EVIDENCE_KEYS);

function normalizedValue(value) {
  return String(value ?? '').trim().toLowerCase().replace(/[\s_]+/g, '-').replace(/-+/g, '-');
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function normalizedList(value, field, errors, { known, allowMissing = false, sort = false } = {}) {
  if (value === undefined && allowMissing) return [];
  if (!Array.isArray(value)) {
    errors.push(`intent ${field} must be an array`);
    return [];
  }
  const output = value.map(normalizedValue);
  if (value.some((item, index) => typeof item !== 'string' || !output[index])) errors.push(`intent ${field} must contain non-empty strings`);
  const unique = [...new Set(output)];
  if (known) for (const item of unique) if (item && !known.has(item)) errors.push(`intent ${field} contains invalid value: ${item}`);
  return sort ? unique.sort() : unique;
}

export function validateIntent(input) {
  const errors = [];
  if (!isRecord(input)) return { ok: false, errors: ['intent must be an object'] };
  for (const key of Object.keys(input)) if (!INTENT_KEYS.has(key)) errors.push(`intent contains unknown key: ${key}`);

  const phase = normalizedValue(input.phase);
  if (typeof input.phase !== 'string' || !knownPhases.has(phase)) errors.push(`intent phase is invalid: ${phase || '<missing>'}`);
  const action = normalizedValue(input.action);
  if (typeof input.action !== 'string' || !action) errors.push('intent action must be a non-empty string');
  const secondaryActions = normalizedList(input.secondaryActions, 'secondaryActions', errors, { allowMissing: true, sort: true });
  const object = normalizedValue(input.object);
  if (typeof input.object !== 'string' || !object) errors.push('intent object must be a non-empty string');
  const risks = normalizedList(input.risks, 'risks', errors, { known: knownRisks, allowMissing: true });
  const mutation = normalizedValue(input.mutation);
  if (typeof input.mutation !== 'string' || !knownMutations.has(mutation)) errors.push(`intent mutation is invalid: ${mutation || '<missing>'}`);

  const evidenceInput = input.evidence === undefined ? {} : input.evidence;
  if (!isRecord(evidenceInput)) errors.push('intent evidence must be an object');
  const evidence = {};
  for (const key of EVIDENCE_KEYS) evidence[key] = evidenceInput?.[key] ?? null;
  for (const key of Object.keys(evidenceInput ?? {})) {
    if (!knownEvidence.has(key)) errors.push(`intent evidence contains unknown key: ${key}`);
    else if (evidenceInput[key] !== null && typeof evidenceInput[key] !== 'boolean') errors.push(`intent evidence.${key} must be boolean or null`);
  }

  const value = { phase, action, secondaryActions, object, risks, mutation, evidence };
  return errors.length ? { ok: false, errors } : { ok: true, errors: [], value };
}

export function normalizeIntent(input) {
  const result = validateIntent(input);
  if (!result.ok) throw new Error(`Invalid intent: ${result.errors.join('; ')}`);
  return result.value;
}

export const createIntent = normalizeIntent;

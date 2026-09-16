const AUTHORIZED_BRAND = Symbol('6g-authorized');
const minted = new WeakSet();

function isAuthorizedBrand(rec) {
  if (!rec || typeof rec !== 'object') return false;
  return rec[AUTHORIZED_BRAND] === true;
}

export function assertAuthorized(rec) {
  if (!isAuthorizedBrand(rec)) {
    throw new Error('AUTHORIZED brand missing');
  }
  if (!minted.has(rec)) {
    throw new Error('AUTHORIZED membership missing');
  }
  if (rec.tag !== 'AUTHORIZED') {
    throw new Error('AUTHORIZED tag mismatch');
  }
  if (rec.scope !== 'CURRENT') {
    throw new Error('AUTHORIZED scope must be CURRENT');
  }
  if (!rec.candidate || rec.candidate.kind !== 'ActionCandidate') {
    throw new Error('AUTHORIZED candidate missing');
  }
  const ownKeys = Object.keys(rec);
  const authorityKeys = ownKeys.filter(k => k === 'tag' || k === 'scope' || k === 'candidate' || k === 'requestEvidence' || k === AUTHORIZED_BRAND);
  if (ownKeys.length !== authorityKeys.length) {
    throw new Error('AUTHORIZED record must have single authority tag');
  }
}

export function assertAdjudicated(rec) {
  if (!rec || typeof rec !== 'object') {
    throw new Error('AdjudicatedAction must be an object');
  }
  const validTags = new Set(['AUTHORIZED', 'CONDITIONAL', 'HYPOTHETICAL', 'CONTEXTUAL', 'NEGATED', 'UNRESOLVED']);
  if (!validTags.has(rec.tag)) {
    throw new Error(`Invalid adjudicated tag: ${rec.tag}`);
  }
  if (!rec.candidate || rec.candidate.kind !== 'ActionCandidate') {
    throw new Error('AdjudicatedAction candidate missing');
  }
}

function createVariant(tag, candidate, extra) {
  const rec = Object.freeze({
    tag,
    candidate,
    ...extra,
  });
  return rec;
}

export function contextual(candidate, contextKind) {
  return createVariant('CONTEXTUAL', candidate, { contextKind });
}

export function negated(candidate, reason) {
  return createVariant('NEGATED', candidate, { reason });
}

export function conditional(candidate, condition) {
  return createVariant('CONDITIONAL', candidate, { condition });
}

export function hypothetical(candidate, reason) {
  return createVariant('HYPOTHETICAL', candidate, { reason });
}

export function unresolved(candidate, reason) {
  return createVariant('UNRESOLVED', candidate, { reason });
}

export { isAuthorizedBrand };
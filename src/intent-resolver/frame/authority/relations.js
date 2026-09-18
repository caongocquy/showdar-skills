import { assertAuthorized } from './adjudicator.js';

// T09 authorized-relation graph (non-authoritative, no production wiring).
// Input array order IS clause order by contract. Absent clause-contexts,
// governing = element 0. With clause-contexts, a clause carrying a
// clause-linking subordination marker (closed structural class below) marks
// its action SUPPORTING and governing defers to the first unmarked (served)
// action.
const SUBORDINATION_MARKER = /\bin order to\b|\bso\b|\bbefore\b|\bafter\b|\bonce\b|\bthen\b|\bfirst\b/i;

function isSubordinateClause(text) {
  return SUBORDINATION_MARKER.test(String(text ?? ''));
}

function contextTextFor(clauseContexts, clauseId) {
  if (clauseContexts == null) return undefined;
  if (typeof clauseContexts.get === 'function') return clauseContexts.get(clauseId);
  return clauseContexts[clauseId];
}

export function resolveAuthorizedRelations(authorized, clauseContexts) {
  for (const rec of authorized) {
    assertAuthorized(rec);
  }
  if (authorized.length === 0) {
    return Object.freeze({ governing: null, relations: Object.freeze([]) });
  }
  const subordinate = new Set();
  if (clauseContexts != null) {
    for (let i = 0; i < authorized.length; i += 1) {
      const text = contextTextFor(clauseContexts, authorized[i].candidate.clauseId);
      if (text != null && isSubordinateClause(text)) subordinate.add(i);
    }
  }
  let govIndex = 0;
  if (subordinate.size > 0 && subordinate.size < authorized.length) {
    for (let i = 0; i < authorized.length; i += 1) {
      if (!subordinate.has(i)) {
        govIndex = i;
        break;
      }
    }
  }
  const governing = authorized[govIndex];
  const govId = `${governing.candidate.clauseId}:${governing.candidate.surface}`;
  const govTarget = governing.candidate.target;
  const relations = [
    Object.freeze({ kind: 'GOVERNING', from: govId, to: govId }),
  ];
  for (let i = 0; i < authorized.length; i += 1) {
    if (i === govIndex) continue;
    const rec = authorized[i];
    const id = `${rec.candidate.clauseId}:${rec.candidate.surface}`;
    const target = rec.candidate.target;
    const kind = subordinate.has(i) || (target != null && target === govTarget) ? 'SUPPORTING' : 'ORTHOGONAL';
    relations.push(Object.freeze({ kind, from: govId, to: id }));
  }
  return Object.freeze({ governing, relations: Object.freeze(relations) });
}

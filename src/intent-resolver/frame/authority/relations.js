import { assertAuthorized } from './adjudicator.js';

// T11 authorized-relation graph (non-authoritative, no production wiring).
// SUPPORTING iff the clause carries a closed-discourse subordination marker;
// target equality is neither sufficient nor necessary (target unread).
// Markers: purpose-so (so + you/we/it/they/that/the), in-order-to, before,
// after, once, then, first (sequence-subordination approximation).
// Governing = first unmarked (all-marked falls back to index 0). Absent
// clause-contexts = all unmarked → element 0 governs, rest ORTHOGONAL.
const IN_ORDER_TO = /\bin\s+order\s+to\b/i;
const PURPOSE_SO = /\bso\s+(you|we|it|they|that|the)\b/i;
const SEQUENCE_MARKER = /\bbefore\b|\bafter\b|\bonce\b|\bthen\b|\bfirst\b/i;

function isSubordinateClause(text) {
  const s = String(text ?? '');
  return IN_ORDER_TO.test(s) || PURPOSE_SO.test(s) || SEQUENCE_MARKER.test(s);
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
  const relations = [
    Object.freeze({ kind: 'GOVERNING', from: govId, to: govId }),
  ];
  for (let i = 0; i < authorized.length; i += 1) {
    if (i === govIndex) continue;
    const rec = authorized[i];
    const id = `${rec.candidate.clauseId}:${rec.candidate.surface}`;
    const kind = subordinate.has(i) ? 'SUPPORTING' : 'ORTHOGONAL';
    relations.push(Object.freeze({ kind, from: govId, to: id }));
  }
  return Object.freeze({ governing, relations: Object.freeze(relations) });
}

import { assertAuthorized } from './adjudicator.js';

// T09 authorized-relation graph (non-authoritative, no production wiring).
// Input array order IS clause order: governing = element 0.
export function resolveAuthorizedRelations(authorized) {
  for (const rec of authorized) {
    assertAuthorized(rec);
  }
  if (authorized.length === 0) {
    return Object.freeze({ governing: null, relations: Object.freeze([]) });
  }
  const governing = authorized[0];
  const govId = `${governing.candidate.clauseId}:${governing.candidate.surface}`;
  const govTarget = governing.candidate.target;
  const relations = [
    Object.freeze({ kind: 'GOVERNING', from: govId, to: govId }),
  ];
  for (let i = 1; i < authorized.length; i += 1) {
    const rec = authorized[i];
    const id = `${rec.candidate.clauseId}:${rec.candidate.surface}`;
    const target = rec.candidate.target;
    const kind = target != null && target === govTarget ? 'SUPPORTING' : 'ORTHOGONAL';
    relations.push(Object.freeze({ kind, from: govId, to: id }));
  }
  return Object.freeze({ governing, relations: Object.freeze(relations) });
}

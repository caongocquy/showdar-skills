import { isAuthorizedBrand } from './adjudicator.js';

const VALID_TAGS = new Set([
  'AUTHORIZED',
  'CONDITIONAL',
  'HYPOTHETICAL',
  'CONTEXTUAL',
  'NEGATED',
  'UNRESOLVED',
]);

function reasonFromRecord(adjudicated) {
  switch (adjudicated.tag) {
    case 'AUTHORIZED':
      return `request:${adjudicated.requestEvidence}`;
    case 'CONTEXTUAL':
      return `context:${adjudicated.contextKind}`;
    case 'NEGATED':
      return 'negation';
    case 'CONDITIONAL':
      return 'condition';
    case 'HYPOTHETICAL':
      return 'modal';
    case 'UNRESOLVED':
      return adjudicated.reason;
    /* ponytail: switch is exhaustive after VALID_TAGS check; no default needed */
  }
}

// T07 diagnostics builder — read-only. Derives reason ONLY from adjudicated
// record fields; never re-examines evidence or parses raw text.
export function traceCandidate({
  candidate,
  evidence,
  adjudicated,
  relation = null,
  contributes = { primary: false, mutation: false, secondary: false },
}) {
  if (!adjudicated || typeof adjudicated !== 'object' || !VALID_TAGS.has(adjudicated.tag)) {
    throw new Error(`traceCandidate: invalid adjudicated tag: ${adjudicated?.tag}`);
  }
  const flags = contributes && typeof contributes === 'object' ? contributes : {};
  return Object.freeze({
    surface: candidate?.surface,
    capability: candidate?.capability,
    clauseId: candidate?.clauseId,
    evidence,
    verdict: adjudicated.tag,
    reason: reasonFromRecord(adjudicated),
    relation,
    contributes: Object.freeze({
      primary: flags.primary === true,
      mutation: flags.mutation === true,
      secondary: flags.secondary === true,
    }),
    isAuthorized: isAuthorizedBrand(adjudicated),
  });
}

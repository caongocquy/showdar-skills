// T13 authority barrel — shadow/non-authoritative composition (no production wiring).
// Exports ONLY safe pipeline interface + diagnostic interface.
// Private: brand, WeakSet, createAuthorized, promotion helper.

import { extractCandidates } from './candidate.js';
import { gatherEvidence } from './evidence.js';
import { adjudicate } from './adjudicator.js';
import { traceCandidate } from './diagnostics.js';
import { resolveAuthorizedRelations } from './relations.js';
import { projectPrimary6G, projectMutation6G, projectSecondary6G, capMutation } from './projectors.js';
import { assembleRequestFrame } from '../request-frame.js';

/**
 * Compose the full 6G authority pipeline for a raw prompt.
 * Shadow-only: does NOT alter production behavior.
 *
 * @param {string} prompt - Raw user prompt
 * @returns {{ intent: object, primaryCapability: string, diagnostics: object[] }}
 */
export function resolveAuthorityIntent(prompt) {
  const requestFrame = assembleRequestFrame(prompt);
  const clauses = requestFrame.clauses;

  // Extract candidates from clauses
  const candidates = extractCandidates(clauses);

  // Build actionId -> clauseId mapping from action frames
  const actionIdToClauseId = new Map();
  for (const action of requestFrame.actions) {
    actionIdToClauseId.set(action.id, action.clauseId);
  }

  // Determine conditional scope from RequestFrame relations (structural, pre-authority)
  // CONDITIONAL relation means the target action is gated by the source condition
  const conditionalClauseIds = new Set();
  for (const rel of requestFrame.relations) {
    if (rel.kind === 'CONDITIONAL') {
      // The 'to' action is conditionally gated by the 'from' condition
      const toActionId = rel.to;
      const toClauseId = actionIdToClauseId.get(toActionId);
      if (toClauseId) conditionalClauseIds.add(toClauseId);
    }
  }

  // Per-candidate pipeline: gather evidence → adjudicate → trace (read-only)
  const textByClauseId = new Map(clauses.map((c) => [c.id, c.text]));
  const traces = [];
  const adjudicatedList = [];

  for (const candidate of candidates) {
    const isConditionallyGated = conditionalClauseIds.has(candidate.clauseId);
    const evidence = gatherEvidence({
      surface: candidate.surface,
      clauseText: textByClauseId.get(candidate.clauseId) ?? '',
      conditionalScope: isConditionallyGated,
    });
    const adjudicated = adjudicate(candidate, evidence);
    adjudicatedList.push(adjudicated);
    traces.push(traceCandidate({
      candidate,
      evidence,
      adjudicated,
      // Relation + contribution flags computed below
      relation: null,
      contributes: { primary: false, mutation: false, secondary: false },
    }));
  }

  // Filter to AUTHORIZED only for relations + projection
  const authorized = adjudicatedList.filter((a) => a.tag === 'AUTHORIZED');

  // Resolve authorized relation graph
  const { governing, relations } = resolveAuthorizedRelations(authorized, (id) => textByClauseId.get(id));

  // Compute contribution flags per trace
  const govId = governing ? `${governing.candidate.clauseId}:${governing.candidate.surface}` : null;
  const orthogonal = authorized.filter((a) => {
    const id = `${a.candidate.clauseId}:${a.candidate.surface}`;
    return relations.some((r) => r.kind === 'ORTHOGONAL' && r.to === id);
  });
  const supporting = authorized.filter((a) => {
    const id = `${a.candidate.clauseId}:${a.candidate.surface}`;
    return relations.some((r) => r.kind === 'SUPPORTING' && r.to === id);
  });

  const primary = projectPrimary6G(governing ?? null);
  const mutation = projectMutation6G(authorized);
  const secondaryTokens = projectSecondary6G(orthogonal, primary.primaryCapability);

  // Enrich traces with relation + contribution flags
  const enrichedTraces = traces.map((trace) => {
    const candId = `${trace.clauseId}:${trace.surface}`;
    let relation = null;
    let contributes = { primary: false, mutation: false, secondary: false };

    if (governing && `${governing.candidate.clauseId}:${governing.candidate.surface}` === candId) {
      relation = 'GOVERNING';
      contributes = { primary: true, mutation: true, secondary: false };
    } else {
      const rel = relations.find((r) => r.to === candId);
      if (rel) {
        relation = rel.kind;
        if (rel.kind === 'SUPPORTING') contributes = { primary: false, mutation: true, secondary: false };
        if (rel.kind === 'ORTHOGONAL') contributes = { primary: false, mutation: true, secondary: true };
      }
    }
    return Object.freeze({ ...trace, relation, contributes: Object.freeze(contributes) });
  });

  // Build public Intent projection (exactly the 7 keys; primaryCapability internal only)
  const intent = Object.freeze({
    phase: primary.phase,
    action: primary.action,
    secondaryActions: secondaryTokens,
    object: requestFrame.contexts.find((c) => c.kind === 'object')?.value ?? null,
    risks: requestFrame.diagnostics.filter((d) => d.code === 'AMBIGUOUS_ENVIRONMENT' || d.code === 'UNBOUND_TARGET').map((d) => d.detail) ?? [],
    mutation,
    evidence: requestFrame.diagnostics.map((d) => `${d.code}:${d.detail}`) ?? [],
  });

  // Diagnostics output (read-only)
  const diagnostics = Object.freeze(enrichedTraces);

  return Object.freeze({
    intent,
    primaryCapability: primary.primaryCapability,
    diagnostics,
  });
}

// Safe pipeline interface (for shadow evaluation / diagnostics only)
export { assembleRequestFrame } from '../request-frame.js';
export { extractCandidates } from './candidate.js';
export { gatherEvidence } from './evidence.js';
export { traceCandidate } from './diagnostics.js';
export { resolveAuthorizedRelations } from './relations.js';
export { projectPrimary6G, projectMutation6G, projectSecondary6G, capMutation } from './projectors.js';

// Diagnostic interface (read-only)
export { runAuthorityShadow } from './shadow.js';

// Validators (safe, brand-gated)
export { assertAuthorized, assertAdjudicated } from './adjudicator.js';

// Non-authority factories (safe, produce plain objects)
export { contextual, negated, conditional, hypothetical, unresolved } from './adjudicator.js';
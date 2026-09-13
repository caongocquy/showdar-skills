// RequestFrame assembly (Phase 6F T06; T12 wires real constraints)
// Composes clause, action, context, relation frames into a single RequestFrame
// with diagnostics from the closed code set.

import { segmentPrompt } from '../segments.js';
import { parseClauses } from './clause-frame.js';
import { buildActionFrames, buildContextFrames } from './action-frame.js';
import { resolveRelations } from './relations.js';
import { buildConstraintFrames } from './projectors/constraints.js';

// Closed diagnostic code set
const DIAGNOSTIC_CODES = Object.freeze([
  'NO_GOVERNING_ACTION',
  'MULTIPLE_GOVERNING_ACTIONS',
  'UNBOUND_TARGET',
  'UNRESOLVED_RELATION',
  'UNKNOWN_SURFACE_OPERATION',
  'AMBIGUOUS_ENVIRONMENT',
  'AMBIGUOUS_CONSTRAINT_SCOPE',
]);

function isDiagnosticCode(code) {
  return DIAGNOSTIC_CODES.includes(code);
}

// Single gate for every diagnostic push — no unvalidated codes.
function pushDiagnostic(diagnostics, code, detail) {
  if (!isDiagnosticCode(code)) {
    throw new Error(`Invalid diagnostic code: ${code}`);
  }
  diagnostics.push({ code, detail });
}

function validateGovernance(actions, diagnostics) {
  const governingActions = actions.filter((a) => a.role === 'GOVERNING');

  if (governingActions.length === 0) {
    pushDiagnostic(diagnostics, 'NO_GOVERNING_ACTION', 'No positive AUTHORIZED_NOW action found to govern the request');
  } else if (governingActions.length > 1) {
    pushDiagnostic(diagnostics, 'MULTIPLE_GOVERNING_ACTIONS', `Multiple governing actions found: ${governingActions.map((a) => a.id).join(', ')}`);
  }
}

function validateTargets(actions, diagnostics) {
  // Canonical actions from surface-map.js that typically bind a target.
  const needsTarget = new Set(['deploy', 'git', 'test', 'assess', 'define', 'understand', 'recover']);
  for (const action of actions) {
    if (needsTarget.has(action.canonicalAction) && !action.target) {
      pushDiagnostic(diagnostics, 'UNBOUND_TARGET', `Action ${action.id} (${action.canonicalAction}) has no bound target`);
    }
  }
}

function validateRelations(relations, actions, diagnostics) {
  const actionIds = new Set(actions.map((a) => a.id));

  for (const rel of relations) {
    if (!actionIds.has(rel.from)) {
      pushDiagnostic(diagnostics, 'UNRESOLVED_RELATION', `Relation from unknown action ${rel.from}`);
    }
    if (!actionIds.has(rel.to)) {
      pushDiagnostic(diagnostics, 'UNRESOLVED_RELATION', `Relation to unknown action ${rel.to}`);
    }
  }
}

function validateEnvironment(actions, diagnostics) {
  // Canonicals whose authority depends on an explicit environment.
  const needsEnvironment = new Set(['deploy', 'git']);
  for (const action of actions) {
    if (action.environment === 'unspecified' && needsEnvironment.has(action.canonicalAction)) {
      pushDiagnostic(diagnostics, 'AMBIGUOUS_ENVIRONMENT', `${action.canonicalAction} action ${action.id} has unspecified environment`);
    }
  }
}

function validateConstraints(constraints, diagnostics) {
  for (const c of constraints) {
    if (c._ambiguous) {
      pushDiagnostic(diagnostics, 'AMBIGUOUS_CONSTRAINT_SCOPE', `Constraint ${c.kind} has ambiguous scope in: ${c.text}`);
    }
  }
}

// Structural unknown-verb signal: reuse segments.js verb extraction. For each
// authoritative clause, align it to its originating segment (same offset logic
// parseClauses uses). If the aligned segment's verb is null while the clause
// yielded zero ActionFrames, the surface vocabulary has no entry for it.
function detectUnknownSurfaceOperations(segments, clauses, actions, diagnostics) {
  for (const clause of clauses) {
    if (clause.provenance !== 'DIRECT_INSTRUCTION' && clause.provenance !== 'SECONDARY_INSTRUCTION') continue;
    if (!clause.text || !clause.text.trim()) continue;
    if (actions.some((a) => a.clauseId === clause.id)) continue;

    const origin = findOriginSegment(segments, clause);
    if (!origin) continue;

    const first = clause.text.trim().split(/\s+/)[0].replace(/[^a-zA-Z-]/g, '').toLowerCase();
    if (!first) continue;

    if (origin.verb === null) {
      pushDiagnostic(diagnostics, 'UNKNOWN_SURFACE_OPERATION', `Unknown surface verb "${first}" in clause ${clause.id}`);
    } else {
      pushDiagnostic(diagnostics, 'UNRESOLVED_RELATION', `Segment verb "${origin.verb}" in clause ${clause.id} yielded no ActionFrame`);
    }
  }
}

// Align a clause to its originating segment via the same start-offset walk
// parseClauses uses in buildFullTextAndOffsets. Returns the segment whose
// joined-text span covers the clause start, or null when no segment is present.
function findOriginSegment(segments, clause) {
  if (!segments || segments.length === 0 || !clause || !clause.text) return null;
  // Rebuild spans the same way clause-frame.js does: join non-empty segment
  // texts with single spaces in order.
  const texts = segments.map((s) => s.text).filter((t) => t);
  if (texts.length === 0) return null;
  const fullText = texts.join(' ');
  const start = fullText.indexOf(clause.text);
  if (start === -1) return null;
  // Walk the joined-text spans to find the segment covering the clause start.
  let pos = 0;
  for (const seg of segments) {
    if (!seg.text) continue;
    if (pos > 0) pos += 1;
    const end = pos + seg.text.length;
    if (start >= pos - 1 && start < end) return seg;
    pos = end;
  }
  return null;
}

/**
 * Assemble the RequestFrame from a raw prompt string.
 * Never throws on normal language; unknown authority degrades to diagnostic + conservative frames.
 *
 * @param {string} prompt
 * @returns {{ clauses, actions, contexts, constraints, relations, diagnostics }}
 */
export function assembleRequestFrame(prompt) {
  // 1. Segment the prompt
  const segments = segmentPrompt(prompt);

  // 2. Parse clauses from segments
  const clauses = parseClauses(segments);

  // 3. Build action frames (authoritative provenance only)
  const actions = buildActionFrames(clauses);

  // 4. Build context frames (non-authoritative provenance)
  const contexts = buildContextFrames(clauses);

  // 5. Resolve relations between actions
  // Note: resolveRelations mutates action.role
  const relations = resolveRelations(actions, clauses);

  // 6. Build constraint frames (T06-local stub)
  const constraints = buildConstraintFrames(clauses, actions);

  // 7. Collect diagnostics (closed code set, never throws)
  const diagnostics = [];
  validateGovernance(actions, diagnostics);
  validateTargets(actions, diagnostics);
  validateRelations(relations, actions, diagnostics);
  validateEnvironment(actions, diagnostics);
  validateConstraints(constraints, diagnostics);
  detectUnknownSurfaceOperations(segments, clauses, actions, diagnostics);

  // Deduplicate diagnostics by code+detail
  const seen = new Set();
  const uniqueDiagnostics = diagnostics.filter((d) => {
    const key = `${d.code}|${d.detail}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return {
    clauses,
    actions,
    contexts,
    constraints,
    relations,
    diagnostics: uniqueDiagnostics,
  };
}

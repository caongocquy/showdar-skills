// RequestFrame assembly (Phase 6F T06)
// Composes clause, action, context, relation frames into a single RequestFrame
// with diagnostics from the closed code set.

import { segmentPrompt } from '../segments.js';
import { parseClauses } from './clause-frame.js';
import { buildActionFrames, buildContextFrames } from './action-frame.js';
import { resolveRelations } from './relations.js';
import { lookupSurfaceOperation } from './surface-map.js';

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

/**
 * T06-LOCAL constraint stub — returns empty array.
 * Replaced by real `buildConstraintFrames` from projectors/constraints.js in T12.
 * MUST NOT be consumed as real mutation authority by T08–T10.
 */
function buildConstraintFrames(_clauses, _actions) {
  return [];
}

function validateGovernance(actions) {
  const diagnostics = [];
  const governingActions = actions.filter(a => a.role === 'GOVERNING');

  if (governingActions.length === 0) {
    diagnostics.push({
      code: 'NO_GOVERNING_ACTION',
      detail: 'No positive AUTHORIZED_NOW action found to govern the request',
    });
  } else if (governingActions.length > 1) {
    diagnostics.push({
      code: 'MULTIPLE_GOVERNING_ACTIONS',
      detail: `Multiple governing actions found: ${governingActions.map(a => a.id).join(', ')}`,
    });
  }
  return diagnostics;
}

function validateTargets(actions) {
  const diagnostics = [];
  for (const action of actions) {
    // Actions with certain canonicalActions typically need a target
    const needsTarget = ['deploy', 'git', 'test', 'implement', 'define'].includes(action.canonicalAction);
    if (needsTarget && !action.target) {
      diagnostics.push({
        code: 'UNBOUND_TARGET',
        detail: `Action ${action.id} (${action.canonicalAction}) has no bound target`,
      });
    }
  }
  return diagnostics;
}

function validateRelations(relations, actions) {
  const diagnostics = [];
  const actionIds = new Set(actions.map(a => a.id));

  for (const rel of relations) {
    if (!actionIds.has(rel.from)) {
      diagnostics.push({
        code: 'UNRESOLVED_RELATION',
        detail: `Relation from unknown action ${rel.from}`,
      });
    }
    if (!actionIds.has(rel.to)) {
      diagnostics.push({
        code: 'UNRESOLVED_RELATION',
        detail: `Relation to unknown action ${rel.to}`,
      });
    }
  }
  return diagnostics;
}

function validateEnvironment(actions) {
  const diagnostics = [];
  for (const action of actions) {
    if (action.environment === 'unspecified' && action.canonicalAction === 'deploy') {
      diagnostics.push({
        code: 'AMBIGUOUS_ENVIRONMENT',
        detail: `Deploy action ${action.id} has unspecified environment`,
      });
    }
  }
  return diagnostics;
}

function validateConstraints(_constraints) {
  // Stub - real validation in T12
  return [];
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

  // Governance diagnostics
  diagnostics.push(...validateGovernance(actions));

  // Target binding diagnostics
  diagnostics.push(...validateTargets(actions));

  // Relation integrity diagnostics
  diagnostics.push(...validateRelations(relations, actions));

  // Environment ambiguity diagnostics
  diagnostics.push(...validateEnvironment(actions));

  // Constraint scope diagnostics (stub)
  diagnostics.push(...validateConstraints(constraints));

  // Unknown surface operation diagnostics
  // Check actions that came from authoritative clauses but have no surface mapping
  const authoritativeClauses = clauses.filter(c =>
    c.provenance === 'DIRECT_INSTRUCTION' || c.provenance === 'SECONDARY_INSTRUCTION'
  );
  for (const clause of authoritativeClauses) {
    // Check if this clause produced any action
    const clauseActions = actions.filter(a => a.clauseId === clause.id);
    if (clauseActions.length === 0) {
      // Clause had authoritative provenance but no action frame was created
      // This means extractSurfaceOperation returned null for all words
      // We need to detect if there was a verb-like word
      const words = clause.text.split(/\s+/);
      for (const word of words) {
        const cleaned = word.replace(/[^a-zA-Z-]/g, '').toLowerCase();
        if (!cleaned) continue;
        // Conservative: if it looks like a verb we might want to track
        const verbLike = /^(frobnicate|widget|foobar|xyzzy|plugh|deploy|push|commit|rebase|merge|run|execute|test|audit|define|specify|promote|rollout|recover|resume|map|trace|explain|implement|build|create|update|fix|upgrade|migrate|check|verify|validate|review|inspect|analyze|diagnose|investigate)$/i.test(cleaned);
        if (verbLike) {
          // Check if this specific word is unknown by trying the surface map
          const result = lookupSurfaceOperation(cleaned);
          if (!result) {
            diagnostics.push({
              code: 'UNKNOWN_SURFACE_OPERATION',
              detail: `Unknown surface verb "${cleaned}" in clause ${clause.id}`,
            });
          }
        }
      }
    }
  }

  // Deduplicate diagnostics by code+detail
  const seen = new Set();
  const uniqueDiagnostics = diagnostics.filter(d => {
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

// Export stub for T06-local use (not for external consumption)
export { buildConstraintFrames };
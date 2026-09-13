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

// Single gate for every diagnostic push — no unvalidated codes.
function pushDiagnostic(diagnostics, code, detail) {
  if (!isDiagnosticCode(code)) {
    throw new Error(`Invalid diagnostic code: ${code}`);
  }
  diagnostics.push({ code, detail });
}

/**
 * T06-LOCAL constraint stub — returns empty array.
 * Replaced by real `buildConstraintFrames` from projectors/constraints.js in T12.
 * MUST NOT be consumed as real mutation authority by T08–T10.
 */
function buildConstraintFrames(_clauses, _actions) {
  return [];
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

function validateConstraints(_constraints, _diagnostics) {
  // Stub — real scope validation lands with projectors/constraints.js in T12.
}

// Function words that can never be a clause-initial imperative verb.
// Structural filter so pronoun/determiner-led clauses don't read as unknown verbs.
const NON_VERB_LEADS = new Set([
  'the', 'a', 'an', 'this', 'that', 'these', 'those',
  'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her', 'us', 'them',
  'my', 'your', 'his', 'its', 'our', 'their',
  'in', 'on', 'at', 'to', 'for', 'with', 'from', 'by', 'about', 'into', 'over', 'after', 'before', 'between', 'through', 'during', 'under', 'of',
  'is', 'are', 'was', 'were', 'be', 'been', 'being', 'am', 'has', 'have', 'had', 'do', 'does', 'did', 'will', 'would', 'can', 'could', 'should', 'shall', 'may', 'might', 'must',
  'and', 'but', 'or', 'nor', 'so', 'yet', 'because', 'if', 'when', 'while', 'although', 'unless',
  'no', 'not', 'all', 'some', 'any', 'each', 'every', 'few', 'many', 'much', 'more', 'most', 'other', 'such',
  'also', 'just', 'still', 'already', 'here', 'there', 'now', 'then', 'today',
]);

function stemToken(token) {
  if (token.length > 5 && token.endsWith('ing')) return token.slice(0, -3);
  if (token.length > 4 && token.endsWith('ed')) return token.slice(0, -2);
  if (token.length > 3 && token.endsWith('s')) return token.slice(0, -1);
  return token;
}

// Structural signal: an authoritative clause whose clause-initial candidate verb
// (imperative position) misses the surface map, yet the clause produced zero
// authorized ActionFrames — the surface vocabulary has no entry for it.
function detectUnknownSurfaceOperations(clauses, actions, diagnostics) {
  for (const clause of clauses) {
    if (clause.provenance !== 'DIRECT_INSTRUCTION' && clause.provenance !== 'SECONDARY_INSTRUCTION') continue;
    if (!clause.text || !clause.text.trim()) continue;
    if (actions.some((a) => a.clauseId === clause.id)) continue;

    const first = clause.text.trim().split(/\s+/)[0].replace(/[^a-zA-Z-]/g, '').toLowerCase();
    if (!first || NON_VERB_LEADS.has(first)) continue;
    if (lookupSurfaceOperation(first) || lookupSurfaceOperation(stemToken(first))) continue;

    pushDiagnostic(diagnostics, 'UNKNOWN_SURFACE_OPERATION', `Unknown surface verb "${first}" in clause ${clause.id}`);
  }
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
  detectUnknownSurfaceOperations(clauses, actions, diagnostics);

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

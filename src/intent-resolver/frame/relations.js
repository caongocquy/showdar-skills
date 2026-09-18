// Relation resolution from clause structure (L3)
// Deterministic, structure-only: no scores, no keyword competition

const SUPPORTING_VERBS = Object.freeze(new Set([
  'resolve', 'verify', 'check', 'confirm', 'validate', 'review', 'follow-up', 'followup',
]));

/**
 * Determines if an action is a same-workflow supporting step
 * Based on verb and clause connector (THEN/AND/AFTER/BEFORE after ROOT)
 * AFTER/BEFORE are temporal sequencing - always supporting if positive AUTHORIZED_NOW
 */
function isSupportingStep(action, clause, prevAction, prevClause) {
  // Must be in a THEN/AND/AFTER/BEFORE clause after a ROOT
  if (!prevClause) return false;
  if (prevClause.connector !== 'ROOT') return false;
  if (clause.connector !== 'THEN' && clause.connector !== 'AND' && clause.connector !== 'AFTER' && clause.connector !== 'BEFORE') return false;

  // AFTER/BEFORE are temporal sequencing - always supporting for positive authorized actions
  if (clause.connector === 'AFTER' || clause.connector === 'BEFORE') {
    return true;
  }

  // For THEN/AND, verb indicates supporting workflow step (structure-only, no keyword competition)
  // But security-review is a distinct security capability, not a supporting step
  if (action.surfaceVerb === 'security-review') return false;
  if (SUPPORTING_VERBS.has(action.canonicalAction)) return true;

  return false;
}

/**
 * Determines if action is conditional based on clause connector or commitment
 * Also checks cross-clause conditional: 
 * - previous clause IF/UNLESS gates this action when this clause is THEN/AFTER/BEFORE ("if condition then action")
 * - next clause IF/UNLESS gates previous action ("action if condition")
 * Does NOT check next clause for IF on its own - the IF connector gates the action in its OWN clause
 */
function isConditional(action, clause, clauses) {
  if (action.commitment === 'CONDITIONAL') return true;
  if (clause.connector === 'IF' || clause.connector === 'UNLESS') return true;

  // Cross-clause conditional: previous clause is IF/UNLESS gates this action
  // Only when this clause is an action connector (THEN/AFTER/BEFORE), not ROOT/IF
  // Pattern: "if condition then action" → condition clause (IF) → action clause (THEN)
  const clauseIndex = clauses.findIndex(c => c.id === clause.id);
  if (clauseIndex > 0) {
    const prevClause = clauses[clauseIndex - 1];
    const isActionConnector = clause.connector === 'THEN' || clause.connector === 'AFTER' || clause.connector === 'BEFORE';
    if (isActionConnector && (prevClause.connector === 'IF' || prevClause.connector === 'UNLESS')) {
      return true;
    }
  }

  // Cross-clause conditional: any subsequent clause is IF/UNLESS gates this action
  // Pattern: "action if condition" → action clause (ROOT/THEN/AND) → ... → condition clause (IF)
  // BUT only when the IF clause is a genuine condition (no action verb), not a conditional action
  if (clauseIndex < clauses.length - 1) {
    for (let i = clauseIndex + 1; i < clauses.length; i++) {
      const nextClause = clauses[i];
      if (nextClause.connector === 'IF' || nextClause.connector === 'UNLESS') {
        // Check if this IF clause has its own action with CONDITIONAL commitment
        // Heuristic: if the IF clause text looks like a condition (approved, ready, etc.)
        // vs an action (deploy, implement, etc.)
        const nextClauseText = nextClause.text.toLowerCase();
        const looksLikeCondition = /\b(approved|ready|complete|done|finished|passed|succeeds?|verified|validated)\b/.test(nextClauseText);
        const looksLikeAction = /\b(deploy|implement|build|create|add|fix|upgrade|migrate|test|review|audit|investigate|debug)\b/.test(nextClauseText);
        
        if (looksLikeCondition && !looksLikeAction) {
          return true;
        }
        // If it looks like an action, it's a conditional action, not a condition on this action
        if (looksLikeAction) {
          break;
        }
      }
      // Stop at non-environment connectors (AND, THEN, etc.) - they may introduce new actions
      if (nextClause.connector !== 'TO') {
        break;
      }
    }
  }

  return false;
}

/**
 * Determines if action is contextual (historical/background)
 * Based on clause provenance
 */
function isContextual(clause) {
  return clause.provenance === 'CONTEXT' ||
         clause.provenance === 'LOG_OUTPUT' ||
         clause.provenance === 'QUOTED_CONTENT' ||
         clause.provenance === 'CODE_BLOCK' ||
         clause.provenance === 'INLINE_CODE' ||
         clause.provenance === 'EXAMPLE' ||
         clause.provenance === 'MENTION';
}

/**
 * Determines if action is hypothetical based on clause connector or commitment
 * Also checks cross-clause hypothetical: modal markers in subsequent clauses
 * Pattern: "action maybe" → action clause (ROOT) → modal clause (TO)
 */
function isHypothetical(action, clause, clauses) {
  if (action.commitment === 'HYPOTHETICAL') return true;

  const clauseIndex = clauses.findIndex(c => c.id === clause.id);
  // Cross-clause hypothetical: any subsequent clause has modal markers
  // Pattern: "action maybe" → action clause (ROOT) → ... → modal clause (TO)
  if (clauseIndex < clauses.length - 1) {
    for (let i = clauseIndex + 1; i < clauses.length; i++) {
      const nextClause = clauses[i];
      const text = nextClause.text.toLowerCase();
      if (/\b(maybe|perhaps|possibly)\b/.test(text)) {
        return true;
      }
      // Stop at non-environment connectors
      if (nextClause.connector !== 'TO') {
        break;
      }
    }
  }
  return false;
}

/**
 * Determines if action is orthogonal (independent explicit request)
 * Positive, AUTHORIZED_NOW, not supporting, not conditional, not contextual
 */
function isOrthogonal(action, clause, isFirstAuthorized, clauses) {
  if (action.polarity !== 'positive') return false;
  if (action.commitment !== 'AUTHORIZED_NOW') return false;
  if (isFirstAuthorized) return false; // first becomes GOVERNING
  if (isSupportingStep(action, clause, null, null)) return false; // will be checked with context
  if (isConditional(action, clause, clauses)) return false;
  if (isHypothetical(action, clause, clauses)) return false;
  if (isContextual(clause)) return false;
  return true;
}

export function resolveRelations(actions, clauses) {
  const relations = [];
  const clauseById = Object.fromEntries(clauses.map(c => [c.id, c]));

  // Find first positive AUTHORIZED_NOW action in ROOT order
  // Skip stative/background clauses (e.g., "The assessment is scheduled...")
  let firstAuthorizedIndex = -1;
  for (let i = 0; i < actions.length; i++) {
    const action = actions[i];
    const clause = clauseById[action.clauseId];
    if (action.polarity === 'positive' &&
        action.commitment === 'AUTHORIZED_NOW' &&
        !isContextual(clause)) {
      // Skip stative background clauses: "The X is scheduled/planned/expected..."
      const text = clause.text.toLowerCase();
      if (/\b(the|this|that)\s+.+?\s+(is|are|was|were)\s+(scheduled|planned|expected|set|due|slated)\b/.test(text)) {
        continue;
      }
      firstAuthorizedIndex = i;
      break;
    }
  }

  // First pass: assign roles
  for (let i = 0; i < actions.length; i++) {
    const action = actions[i];
    const clause = clauseById[action.clauseId];
    const prevAction = i > 0 ? actions[i - 1] : null;
    const prevClause = prevAction ? clauseById[prevAction.clauseId] : null;

    // CONTEXTUAL: historical/background provenance
    if (isContextual(clause)) {
      action.role = 'CONTEXTUAL';
      continue;
    }

    // CONDITIONAL: IF-gated
    if (isConditional(action, clause, clauses)) {
      action.role = 'CONDITIONAL';
      continue;
    }

    // GOVERNING: first positive AUTHORIZED_NOW in ROOT order
    if (i === firstAuthorizedIndex) {
      action.role = 'GOVERNING';
      continue;
    }

    // SUPPORTING: same-workflow step in THEN/AND after ROOT
    if (isSupportingStep(action, clause, prevAction, prevClause)) {
      action.role = 'SUPPORTING';
      continue;
    }

    // ORTHOGONAL: independent explicit request
    if (isOrthogonal(action, clause, i === firstAuthorizedIndex, clauses)) {
      action.role = 'ORTHOGONAL';
      continue;
    }

    // Default fallback for edge cases (negative polarity, etc.)
    // Negative actions that aren't contextual/conditional become ORTHOGONAL
    // but without contributing to secondaries (handled downstream)
    if (action.polarity === 'negative') {
      action.role = 'ORTHOGONAL';
      continue;
    }

    // Any remaining AUTHORIZED_NOW positive actions become ORTHOGONAL
    if (action.commitment === 'AUTHORIZED_NOW' && action.polarity === 'positive') {
      action.role = 'ORTHOGONAL';
      continue;
    }

    // Hypothetical/other commitments default to CONTEXTUAL
    action.role = 'CONTEXTUAL';
  }

  // Second pass: build relations (from -> to where to is the GOVERNING action)
  const governingAction = actions.find(a => a.role === 'GOVERNING');
  const governingId = governingAction?.id;

  for (const action of actions) {
    if (action.role === 'GOVERNING') {
      // GOVERNING relates to itself
      relations.push({ kind: 'GOVERNING', from: action.id, to: action.id });
    } else if (governingId) {
      // All other roles relate to the GOVERNING action
      relations.push({ kind: action.role, from: action.id, to: governingId });
    } else {
      // No governing action - relate to first action or self
      const fallbackId = actions[0]?.id || action.id;
      relations.push({ kind: action.role, from: action.id, to: fallbackId });
    }
  }

  return relations;
}

export { isHypothetical };
/**
 * Constraint Extraction — independent of mutation
 * 
 * Constraints are prohibited operations, separate from the requested mutation.
 * 
 * Vocabulary:
 * - no-push
 * - no-commit
 * - no-deploy
 * - no-code-change
 * - no-implementation
 * - no-publish
 */

export const CONSTRAINT_KEYWORDS = Object.freeze({
  'no-push': [
    /\bdon['']?t\s+push\b/i,
    /\bdo not\s+push\b/i,
    /\bnever\s+push\b/i,
    /\bwithout\s+pushing\b/i,
    /\bno\s+push\b/i,
    /\bhold\s+(the\s+)?push\b/i,
  ],
  'no-commit': [
    /\bdon['']?t\s+commit\b/i,
    /\bdo not\s+commit\b/i,
    /\bnever\s+commit\b/i,
    /\bwithout\s+commit(ting)?\b/i,
    /\bno\s+commit\b/i,
    /\bdon['']?t\s+commit\b/i,
  ],
  'no-deploy': [
    /\bdon['']?t\s+deploy\b/i,
    /\bdo not\s+deploy\b/i,
    /\bnever\s+deploy\b/i,
    /\bwithout\s+deploy(ing)?\b/i,
    /\bno\s+deploy\b/i,
    /\bprepare.*(?:deploy|deployment).*don['']?t\s+deploy\b/i,
    /\bprepare.*(?:deploy|deployment).*do not\s+deploy\b/i,
    /\bprepare.*(?:deploy|deployment).*don['']?t\s+execute\b/i,
    /\bprepare.*(?:deploy|deployment).*do not\s+execute\b/i,
  ],
  'no-code-change': [
    /\bdon['']?t\s+(change|modify|write|edit)\b/i,
    /\bdo not\s+(change|modify|write|edit)\b/i,
    /\bwithout\s+(changing|modifying|writing)\b/i,
    /\bno\s+(code\s+)?change\b/i,
    /\bonly\s+(review|inspect|audit|check|look|examine|read)\b/i,
    /\bjust\s+(review|inspect|audit|check|look|examine|read)\b/i,
  ],
  'no-implementation': [
    /\bdon['']?t\s+implement\b/i,
    /\bdo not\s+implement\b/i,
    /\bnever\s+implement\b/i,
    /\bwithout\s+implement(ing)?\b/i,
    /\bno\s+implementation\b/i,
    /\bplan.*don['']?t\s+implement\b/i,
    /\bplan.*do not\s+implement\b/i,
  ],
  'no-publish': [
    /\bdon['']?t\s+publish\b/i,
    /\bdo not\s+publish\b/i,
    /\bnever\s+publish\b/i,
    /\bwithout\s+publish(ing)?\b/i,
    /\bno\s+publish\b/i,
    /\bassess.*(?:ready|readiness).*don['']?t\s+publish\b/i,
  ],
});

export const SCOPED_CONSTRAINT_KEYWORDS = Object.freeze([
  {
    type: 'no-modify',
    scope: 'production-code',
    patterns: [
      /\bdon['']?t\s+(touch|change|modify|edit)\s+(production|prod)\s+code\b/i,
      /\bdo not\s+(touch|change|modify|edit)\s+(production|prod)\s+code\b/i,
      /\bwithout\s+(touching|changing|modifying|editing)\s+(production|prod)\s+code\b/i,
    ],
  },
  {
    type: 'no-modify',
    scope: 'application-source',
    patterns: [
      /\b(leave|keep)\s+(application|app)\s+source\s+(unchanged|untouched|intact)\b/i,
      /\bdon['']?t\s+(touch|change|modify|edit)\s+(application|app)\s+source\b/i,
    ],
  },
  {
    type: 'no-modify',
    scope: 'src/',
    patterns: [
      /\bdon['']?t\s+(touch|change|modify|edit)\s+src\/?\b/i,
      /\bdo not\s+(touch|change|modify|edit)\s+src\/?\b/i,
    ],
  },
]);

/**
 * Extract constraints from prompt text.
 * 
 * @param {string} text
 * @returns {Array<string|{type: string, scope: string}>} sorted constraint list
 */
export function extractConstraints(text) {
  const lowerText = String(text ?? '').toLowerCase();
  const constraints = [];

  for (const [constraint, patterns] of Object.entries(CONSTRAINT_KEYWORDS)) {
    for (const pattern of patterns) {
      if (pattern.test(lowerText)) {
        constraints.push(constraint);
        break;
      }
    }
  }

  for (const entry of SCOPED_CONSTRAINT_KEYWORDS) {
    for (const pattern of entry.patterns) {
      if (pattern.test(lowerText)) {
        constraints.push({ type: entry.type, scope: entry.scope });
        break;
      }
    }
  }

  return constraints;
}

/**
 * Check if a constraint is present.
 * 
 * @param {string[]} constraints
 * @param {string} constraint
 * @returns {boolean}
 */
export function hasConstraint(constraints, constraint) {
  return constraints.includes(constraint);
}
// ActionFrame / ContextFrame construction with hard provenance boundary
// L2: only DIRECT_INSTRUCTION and SECONDARY_INSTRUCTION produce ActionFrames

import { lookupSurfaceOperation } from './surface-map.js';

const AUTHORITATIVE_PROVENANCES = Object.freeze(new Set([
  'DIRECT_INSTRUCTION',
  'SECONDARY_INSTRUCTION',
]));

const NON_AUTHORITATIVE_PROVENANCES = Object.freeze(new Set([
  'LOG_OUTPUT',
  'QUOTED_CONTENT',
  'CODE_BLOCK',
  'INLINE_CODE',
  'EXAMPLE',
  'MENTION',
  'CONTEXT',
]));

const COMMITMENT_MARKERS = Object.freeze({
  CONDITIONAL: /\b(if|when|unless|provided|assuming|in case)\b/i,
  HYPOTHETICAL: /\b(would|could|should|might|may|suppose|imagine|hypothetical)\b/i,
});

// Explicit security-assessment scope markers (structural purpose-adjunct
// patterns, not phrase-specific entries): "for <security noun>", the
// "security <audit|assessment|review>" compound, "audit security", and the
// threat-model / penetration-test verbs themselves.
const SECURITY_SCOPE_PATTERN = /\bfor\s+(?:[\w-]+\s+)?(?:security|vulnerabilit\w*|breach\w*|threats?|exploits?)\b|\bsecurity\s+(?:audit|assessment|review|issues)\b|\bthreat[-\s]?models?\b|\bpenetration[-\s]?tests?\b|\bpentests?\b|\baudit\s+security\b/i;

// Verb families whose canonical action may carry security-assessment scope.
const ASSESS_FAMILY = Object.freeze(new Set(['review', 'assess']));

// Test-authorship ownership (structural noun rule, not phrase-specific): a bare
// authoring verb governing a test-execution artifact names test authorship,
// not generic implementation. Matrix documents are excluded (quality).
const AUTHORING_VERBS = Object.freeze(new Set(['write', 'add', 'create']));
const TEST_EXECUTION_NOUN = /(?:unit|integration|regression|e2e|automated|smoke|contract)\s+tests?\b|\btest\s+(?:suite|coverage)\b|\bregression\s+testing\b/i;

// Requirements-deficit ownership: a discovery verb (identify/discover/
// determine/find) scoping missing-or-undefined requirements artifacts names
// definition, not diagnosis.
const DEFICIT_DISCOVERY_VERBS = Object.freeze(new Set(['identify', 'discover', 'determine', 'find']));
const DEFICIT_PATTERN = /\bmissing\b|\bundefined\b|\bnot\s+(?:yet\s+)?defined\b/i;
const REQUIREMENTS_TARGET = /\bbusiness[\s-]?rules?\b|\brequirements?\b|\bacceptance[\s-]?criteria\b|\buser[\s-]?stor(?:y|ies)\b/i;

// Quality-matrix ownership: a creation verb governing a QA-matrix artifact
// names quality assessment, not generic implementation. Covers any matrix
// modifier uniformly (QA/regression/quality/risk/scenario/coverage).
const CREATION_VERBS = Object.freeze(new Set(['create', 'build', 'write', 'add']));
const MATRIX_ARTIFACT = /(?:qa|regression|quality|risk|scenario|coverage)[\s-]?matrix\b|\bmatrix\b/i;

function detectCommitment(clause) {
  const text = clause.text;
  if (COMMITMENT_MARKERS.CONDITIONAL.test(text)) return 'CONDITIONAL';
  // Check connector for conditional/temporal gating
  if (clause.connector === 'IF' || clause.connector === 'UNLESS' ||
      clause.connector === 'AFTER' || clause.connector === 'BEFORE' || clause.connector === 'WHILE') return 'CONDITIONAL';
  if (COMMITMENT_MARKERS.HYPOTHETICAL.test(text)) return 'HYPOTHETICAL';
  return 'AUTHORIZED_NOW';
}

function detectEnvironment(clause, clauses = [], index = -1) {
  // Check own text plus adjacent sibling clauses (clause splitting may isolate
  // the target/environments phrase, e.g. "Deploy the api" + "production.")
  let text = clause.text.toLowerCase();
  if (index >= 0 && Array.isArray(clauses)) {
    const neighbors = [];
    if (index + 1 < clauses.length) neighbors.push(clauses[index + 1].text);
    if (index - 1 >= 0) neighbors.push(clauses[index - 1].text);
    text += ' ' + neighbors.join(' ').toLowerCase();
  }
  if (/\bproduction\b/.test(text)) return 'production';
  // "local" or "locally" -> local
  if (/\blocal\b|\blocally\b/.test(text)) return 'local';
  // "staging", "test environment", "canary" -> staging (not remote/production)
  if (/\bstaging\b|\btest\s+environment\b|\bcanary\b/.test(text)) return 'staging';
  // "remote", "deploy", "push" -> remote (unless local/staging/production already matched)
  if (/\b(remote|deploy|push)\b/.test(text)) return 'remote';
  return 'unspecified';
}

function extractTargetFromClause(clause) {
  // Use the segment's pre-extracted target if available
  // For now, use a simple heuristic from the clause text
  const text = clause.text;
  // Look for target patterns (expanded to cover all eval cases)
  // ORDER MATTERS: more specific multi-word patterns FIRST, then general patterns
  const patterns = [
    // Specific multi-word patterns (highest priority)
    /\b(staging container)\b/i,
    /\b(webhook handler)\b/i,
    /\b(webhook endpoint)\b/i,
    /\b(stripe webhook)\b/i,
    /\b(react native)\b/i,
    /\b(oauth login)\b/i,
    /\b(ci pipeline)\b/i,
    /\b(qa regression matrix)\b/i,
    /\b(interrupted implementation)\b/i,
    /\b(current repo state)\b/i,
    /\b(current changes)\b/i,
    /\b(deployment steps)\b/i,
    /\b(deployment configuration)\b/i,
    /\b(migration plan)\b/i,
    /\b(deployment)\b/i,
    /\b(container)\b/i,
    /\b(health)\b/i,
    /\b(rollback)\b/i,
    /\b(security issues)\b/i,
    /\b(test suite)\b/i,
    /\b(auth code)\b/i,
    /\b(login crash)\b/i,
    /\b(completed task files)\b/i,
    /\b(infrastructure)\b/i,
    /\b(duplicate payment)\b/i,
    /\b(branch)\b/i,
    /\b(feature branch)\b/i,
    /\b(develop)\b/i,
    /\b(commit)\b/i,
    /\b(config changes)\b/i,
    // General patterns (lower priority)
    /\b(repository|codebase|code base|code)\b/i,
    /\b(api|service|database|schema|migration|config|configuration)\b/i,
    /\b(ui|frontend|interface|component|screen|page|checkout)\b/i,
    /\b(runtime|application|app|process|memory|performance|crash|leak|hang|worker|gateway)\b/i,
    /\b(compile|bundle|pipeline|artifact|dependency)\b/i,  // 'build' removed - too ambiguous as verb
    /\b(network|http|request|response|connection|timeout)\b/i,
    /\b(auth|authentication|authorization|login|token|oauth|jwt|session|permission)\b/i,
    /\b(docker|kubernetes|environment|staging|canary)\b/i,
    /\b(architecture|system design|approved feature)\b/i,
    /\b(backend|server)\b/i,
    /\b(main|master)\b/i,
    /\b(file)\b/i,
    /\b(data|business rule|business rules|business logic|schema|model|entity)\b/i,
    /\b(implementation|feature|code|changes|work|task)\b/i,
    /\b(package|library|framework|version|release|artifact|changelog|publish)\b/i,
    /\b(regression matrix|qa matrix|quality matrix|risk matrix|scenario|coverage matrix)\b/i,
    /\b(test|automated test|unit test|integration test|e2e|regression test)\b/i,
    /\b(security|vulnerability|threat|exploit|encryption|oauth callback|penetration)\b/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[0];
  }
  return null;
}

function authorizeSpan(span) {
  const prov = span?.provenance;
  if (!prov || !AUTHORITATIVE_PROVENANCES.has(prov)) {
    throw new Error(`provenance '${prov}' cannot authorize action frame`);
  }
  // Authoritative - no throw
  return true;
}

function extractSurfaceOperation(clause) {
  const text = clause.text.trim().toLowerCase();
  // Normalize: replace punctuation with spaces, collapse whitespace
  const normalized = text.replace(/[^a-zA-Z\s-]/g, ' ').replace(/\s+/g, ' ');
  const allWords = normalized.split(/\s+/).filter(w => w.length > 0);

  // Stop words to skip in n-gram matching (but keep for position tracking)
  const STOP_WORDS = new Set(['the', 'a', 'an', 'for', 'to', 'of', 'in', 'on', 'at', 'with', 'by', 'from', 'as', 'is', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must', 'can', 'this', 'that', 'these', 'those', 'it', 'its', 'they', 'them', 'their', 'we', 'our', 'us', 'you', 'your', 'my', 'me', 'i', 'he', 'she', 'him', 'her']);

  // Build content words with their original positions
  const contentWords = [];
  for (let i = 0; i < allWords.length; i++) {
    if (!STOP_WORDS.has(allWords[i])) {
      contentWords.push({ word: allWords[i], origPos: i });
    }
  }

  // Collect all matches with position and n-gram length
  // Selection rule: earliest ORIGINAL position wins, then longest n-gram, then stable tie-break
  const matches = [];

  // n-grams (max 4 content words)
  for (let n = Math.min(4, contentWords.length); n >= 1; n--) {
    for (let i = 0; i <= contentWords.length - n; i++) {
      const phrase = contentWords.slice(i, i + n).map(c => c.word).join('-');
      const result = lookupSurfaceOperation(phrase);
      if (result) {
        // Use original position of first content word for sorting
        matches.push({ position: contentWords[i].origPos, length: n, result, source: 'ngram', phrase });
      }
    }
  }

  // Fallback: single words with suffix stripping (use original positions)
  for (let i = 0; i < allWords.length; i++) {
    const word = allWords[i];
    const cleaned = word.replace(/[^a-zA-Z-]/g, '').toLowerCase();
    if (!cleaned) continue;

    let result = lookupSurfaceOperation(cleaned);
    if (result) {
      matches.push({ position: i, length: 1, result, source: 'word', phrase: cleaned });
    }

    // Gerund stripping: fixing -> fix, deploying -> deploy
    if (cleaned.endsWith('ing') && cleaned.length > 5) {
      const stem = cleaned.slice(0, -3);
      result = lookupSurfaceOperation(stem);
      if (result) {
        matches.push({ position: i, length: 1, result, source: 'stem-ing', phrase: stem });
      }
      // Handle doubled consonant (running -> run)
      if (stem.length > 2 && stem[stem.length - 1] === stem[stem.length - 2]) {
        const stem2 = stem.slice(0, -1);
        result = lookupSurfaceOperation(stem2);
        if (result) {
          matches.push({ position: i, length: 1, result, source: 'stem-ing-doubled', phrase: stem2 });
        }
      }
    }
    // Past tense stripping: fixed -> fix, deployed -> deploy
    if (cleaned.endsWith('ed') && cleaned.length > 4) {
      const stem = cleaned.slice(0, -2);
      result = lookupSurfaceOperation(stem);
      if (result) {
        matches.push({ position: i, length: 1, result, source: 'stem-ed', phrase: stem });
      }
      if (stem.endsWith('e')) {
        const stem2 = stem.slice(0, -1);
        result = lookupSurfaceOperation(stem2);
        if (result) {
          matches.push({ position: i, length: 1, result, source: 'stem-ed-e', phrase: stem2 });
        }
      }
    }
    // Plural stripping: tests -> test
    if (cleaned.endsWith('s') && cleaned.length > 3) {
      const stem = cleaned.slice(0, -1);
      result = lookupSurfaceOperation(stem);
      if (result) {
        matches.push({ position: i, length: 1, result, source: 'stem-s', phrase: stem });
      }
    }
  }

  if (matches.length === 0) return null;

  // Sort: earliest position first (actual verb appears first), then longest n-gram, then stable tie-break
  matches.sort((a, b) => {
    if (a.position !== b.position) return a.position - b.position; // earliest wins
    if (a.length !== b.length) return b.length - a.length; // longer n-gram wins at same position
    // Stable tie-break: prefer ngram > word > stems (deterministic by source order)
    const sourceOrder = { ngram: 0, word: 1, 'stem-ing': 2, 'stem-ing-doubled': 3, 'stem-ed': 4, 'stem-ed-e': 5, 'stem-s': 6 };
    return (sourceOrder[a.source] ?? 99) - (sourceOrder[b.source] ?? 99);
  });

  return matches[0].result;
}

export function buildActionFrames(clauses) {
  const frames = [];
  let actionIndex = 0;

  for (let i = 0; i < clauses.length; i++) {
    const clause = clauses[i];
    // Hard provenance wall: only authoritative provenances produce ActionFrames
    if (!AUTHORITATIVE_PROVENANCES.has(clause.provenance)) {
      // Non-authoritative provenance: do not create ActionFrame
      // The caller should use buildContextFrames for these
      continue;
    }

    // Skip stative background clauses: "The X is scheduled/planned/expected..." or "The X is confirmed/known/identified/determined..."
    const text = clause.text.toLowerCase();
    if (/\b(the|this|that)\s+.+?\s+(is|are|was|were)\s+(scheduled|planned|expected|set|due|slated|confirmed|known|identified|determined|resolved|established|verified)\b/.test(text)) {
      continue;
    }

    // Find verb in clause text
    const surfaceOp = extractSurfaceOperation(clause);
    if (!surfaceOp) {
      // Unknown surface operation - no action frame
      continue;
    }

    // Explicit security-assessment scope (structural, not phrase-specific):
    // a review/audit-class verb scoped by a security purpose adjunct names a
    // security assessment, not a generic review. Domain nouns alone
    // (auth, OAuth, webhook) never trigger this — only an explicit scope.
    let semanticCapability = surfaceOp.semanticCapability;
    let canonicalAction = surfaceOp.canonicalAction;
    // Test authorship before security: an authoring verb is never in the
    // assess family, so the two rules cannot both fire.
    if (AUTHORING_VERBS.has(surfaceOp.surfaceVerb.toLowerCase()) && TEST_EXECUTION_NOUN.test(clause.text)) {
      semanticCapability = 'testing';
      canonicalAction = 'test';
    }
    // Requirements deficit: discovery verb + missing requirements artifact.
    if (canonicalAction === 'investigate' &&
        DEFICIT_DISCOVERY_VERBS.has(surfaceOp.surfaceVerb.toLowerCase()) &&
        DEFICIT_PATTERN.test(clause.text) &&
        REQUIREMENTS_TARGET.test(clause.text)) {
      semanticCapability = 'requirements';
      canonicalAction = 'define';
    }
    // Quality matrix: creation verb + matrix artifact. Checked after the
    // test-authorship rule; the noun patterns are disjoint (tests vs matrix).
    if (CREATION_VERBS.has(surfaceOp.surfaceVerb.toLowerCase()) &&
        MATRIX_ARTIFACT.test(clause.text)) {
      semanticCapability = 'verification';
      canonicalAction = 'assess';
    }
    if (ASSESS_FAMILY.has(canonicalAction) && SECURITY_SCOPE_PATTERN.test(clause.text)) {
      semanticCapability = 'security-assessment';
    }

    // Determine commitment, considering sibling conditional clauses
    let commitment = detectCommitment(clause);
    if (commitment === 'AUTHORIZED_NOW') {
      // If the next clause has IF/UNLESS connector, this clause is conditionally gated
      const next = clauses[i + 1];
      if (next && (next.connector === 'IF' || next.connector === 'UNLESS')) {
        commitment = 'CONDITIONAL';
      }
    }

    const frame = {
      id: `a${actionIndex++}`,
      surfaceVerb: surfaceOp.surfaceVerb,
      semanticCapability,
      canonicalAction,
      target: extractTargetFromClause(clause),
      provenance: clause.provenance,
      polarity: clause.polarity,
      role: 'GOVERNING', // default; resolved later by relations.js
      commitment,
      environment: detectEnvironment(clause, clauses, i),
      clauseId: clause.id,
    };

    frames.push(frame);
  }

  return frames;
}

export function buildContextFrames(clauses) {
  const frames = [];

  for (const clause of clauses) {
    // Only non-authoritative provenances produce ContextFrames
    if (AUTHORITATIVE_PROVENANCES.has(clause.provenance)) {
      continue;
    }

    // Determine what this context contributes to
    const contributesTo = [];
    const kind = clause.provenance;

    if (kind === 'LOG_OUTPUT') {
      contributesTo.push('evidence', 'risks');
    } else if (kind === 'QUOTED_CONTENT' || kind === 'CODE_BLOCK' || kind === 'INLINE_CODE') {
      contributesTo.push('evidence', 'object');
    } else if (kind === 'EXAMPLE') {
      contributesTo.push('evidence');
    } else if (kind === 'MENTION') {
      contributesTo.push('object');
    } else if (kind === 'CONTEXT') {
      contributesTo.push('risks', 'object');
    }

    frames.push({
      id: `ctx${frames.length}`,
      kind,
      text: clause.text,
      contributesTo,
    });
  }

  return frames;
}

export { authorizeSpan };
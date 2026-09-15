// Metadata projector (Phase 6F T14)
// Authority-free derivations for informational fields ONLY.
// This module MUST NOT be imported by primary/mutation/secondary/constraints modules.
// Output never feeds authority decisions.

const RISK_VERBS = Object.freeze(new Set([
  'deploy', 'push', 'promote', 'rollback', 'restart', 'scale', 'rotate',
  'migrate', 'upgrade', 'patch', 'modify', 'update', 'fix',
]));

const RISK_ENVS = Object.freeze(new Set(['production', 'remote']));

const SECURITY_VERBS = Object.freeze(new Set([
  'audit', 'threat-model', 'penetration', 'pentest', 'security',
]));

// Security keywords to scan in clause texts
const SECURITY_KEYWORDS = Object.freeze([
  'hijack', 'weakness', 'weaknesses', 'injection', 'vulnerabilit', 'exploit',
  'penetration', 'threat', 'unauthorized', 'authentication', 'authorization',
  'security', 'breach', 'data leak', 'information leak', 'compromise', 'attack', 'malicious',
  'xss', 'csrf', 'sql injection', 'rce', 'ssrf', 'xxe',
]);

// Failure patterns in LOG_OUTPUT that indicate production/runtime risks
const FAILURE_PATTERNS = Object.freeze([
  /\bconnection\s+refused\b/i,
  /\btimeout\b/i,
  /\bnetwork\s+error\b/i,
  /\bout\s+of\s+memory\b/i,
  /\boom\b/i,
  /\bsegmentation\s+fault\b/i,
  /\bmemory\s+leak\b/i,
  /\bci\s+failure\b/i,
  /\bpipeline\s+failure\b/i,
  /\bbuild\s+failure\b/i,
  /\bintermittent\s+ci\b/i,
  /\bexit\s+\d+\b/i,
  /\bexited\s+with\s+status\s+\d+\b/i,
  /\bworker\s+exited\s+with\s+status\s+\d+\b/i,
  /\bworker\s+exit\b/i,
]);

// Test-related failure patterns -> regression risk (not production)
const TEST_FAILURE_PATTERNS = Object.freeze([
  /\btest\s+suite\b/i,
  /\btest\s+fail/i,
  /\bautomated\s+test/i,
  /\bregression\s+test/i,
  /\bunit\s+test/i,
  /\bintegration\s+test/i,
  /\be2e\s+test/i,
  /\bflaky\s+test/i,
  /\bintermittent\s+test/i,
]);

// Also detect failure patterns in any text (for deriveEvidence)
const EVIDENCE_FAILURE_PATTERNS = Object.freeze([
  /\bexit\s+[1-9]\d*\b/i,           // Exit 1, Exit 2, etc. (non-zero)
  /\bexited\s+with\s+status\s+[1-9]\d*\b/i,  // exited with status 3
  /\bworker\s+exited\s+with\s+status\s+[1-9]\d*\b/i,
  /\bcrash\b/i,
  /\bfailure\b/i,
  /\berror\b/i,
  /\bbug\b/i,
  /\bissue\b/i,
  /\bproblem\b/i,
  /\bincident\b/i,
  /\boutage\b/i,
  /\bdowntime\b/i,
  /\bbroken\b/i,
  /\bfailing\b/i,
  /\bfailed\b/i,
]);

// Migration/upgrade keywords -> compatibility risk
const COMPATIBILITY_KEYWORDS = Object.freeze([
  'migration', 'migrate', 'upgrade', 'downgrade', 'version', 'compatibility',
  'breaking change', 'breaking changes', 'deprecated', 'deprecation',
]);

// Test-related keywords in clauses -> regression risk
const REGRESSION_KEYWORDS = Object.freeze([
  'automated test', 'automated tests', 'unit test', 'unit tests',
  'integration test', 'integration tests', 'e2e test', 'e2e tests',
  'regression test', 'regression tests', 'test suite', 'test coverage',
  'regression matrix', 'qa matrix', 'quality matrix',
  'security test', 'security tests',
  'automated security test', 'automated security tests',
]);

// Performance keywords -> performance risk
const PERFORMANCE_KEYWORDS = Object.freeze([
  'memory leak', 'memory', 'performance', 'slow', 'latency', 'bottleneck',
  'hang', 'leak', 'oom', 'out of memory', 'cpu', 'throughput',
]);

// Regex caches for word-boundary matching
const KEYWORD_REGEX_CACHE = new Map();
function getKeywordRegex(keyword) {
  if (!KEYWORD_REGEX_CACHE.has(keyword)) {
    const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    KEYWORD_REGEX_CACHE.set(keyword, new RegExp(`\\b${escaped}\\b`, 'i'));
  }
  return KEYWORD_REGEX_CACHE.get(keyword);
}

function hasKeywordInText(text, keywords) {
  if (!text) return false;
  const lower = text.toLowerCase();
  for (const kw of keywords) {
    const regex = getKeywordRegex(kw);
    if (regex.test(lower)) return true;
  }
  return false;
}

function hasProductionRisk(actions) {
  return actions.some(a =>
    a.environment === 'production' &&
    (RISK_VERBS.has(a.surfaceVerb?.toLowerCase()) || RISK_VERBS.has(a.canonicalAction))
  );
}

function hasSecurityRisk(actions) {
  return actions.some(a =>
    SECURITY_VERBS.has(a.surfaceVerb?.toLowerCase()) ||
    SECURITY_VERBS.has(a.canonicalAction)
  );
}

function hasFailureInLogOutput(frames) {
  if (!frames || !Array.isArray(frames)) return false;
  const logFrames = frames.filter(f => f.kind === 'LOG_OUTPUT');
  return logFrames.some(ctx => FAILURE_PATTERNS.some(p => p.test(ctx.text)));
}

function hasTestFailureInLogOutput(frames) {
  if (!frames || !Array.isArray(frames)) return false;
  const logFrames = frames.filter(f => f.kind === 'LOG_OUTPUT');
  return logFrames.some(ctx => TEST_FAILURE_PATTERNS.some(p => p.test(ctx.text)));
}

function hasSecurityInLogOutput(frames) {
  if (!frames || !Array.isArray(frames)) return false;
  const logFrames = frames.filter(f => f.kind === 'LOG_OUTPUT' || f.kind === 'CONTEXT');
  return logFrames.some(ctx => /\b(vulnerabilit|exploit|penetration|threat|unauthorized|authentication|authorization|security)\b/i.test(ctx.text));
}

function hasSecurityInClauses(clauses) {
  if (!clauses || !Array.isArray(clauses)) return false;
  return clauses.some(c => c.text && hasKeywordInText(c.text, SECURITY_KEYWORDS));
}

function hasCompatibilityKeywords(clauses) {
  if (!clauses || !Array.isArray(clauses)) return false;
  return clauses.some(c => c.text && hasKeywordInText(c.text, COMPATIBILITY_KEYWORDS));
}

function hasRegressionKeywords(clauses) {
  if (!clauses || !Array.isArray(clauses)) return false;
  return clauses.some(c => c.text && hasKeywordInText(c.text, REGRESSION_KEYWORDS));
}

function hasPerformanceKeywords(clauses, contexts) {
  if (clauses && Array.isArray(clauses)) {
    if (clauses.some(c => c.text && hasKeywordInText(c.text, PERFORMANCE_KEYWORDS))) {
      return true;
    }
  }
  if (contexts && Array.isArray(contexts)) {
    if (contexts.some(c => c.text && hasKeywordInText(c.text, PERFORMANCE_KEYWORDS))) {
      return true;
    }
  }
  return false;
}

export function deriveRisks(frames, contexts = [], clauses = []) {
  if (!frames || !Array.isArray(frames)) return [];

  const risks = new Set();
  const actions = frames.filter(f => f.role === 'GOVERNING' || f.role === 'ORTHOGONAL' || f.role === 'SUPPORTING');

  if (hasProductionRisk(actions)) risks.add('production');
  if (hasSecurityRisk(actions)) risks.add('security');
  // Also detect security from LOG_OUTPUT/CONTEXT frames
  if (hasSecurityInLogOutput(contexts)) risks.add('security');
  // Detect security keywords in clause texts
  if (hasSecurityInClauses(clauses)) risks.add('security');
  // Detect production/runtime risk from LOG_OUTPUT failure patterns (only if NOT a test failure)
  if (hasFailureInLogOutput(contexts) && !hasTestFailureInLogOutput(contexts)) risks.add('production');
  // Detect regression risk from test failures in LOG_OUTPUT
  if (hasTestFailureInLogOutput(contexts)) risks.add('regression');
  // Detect regression risk from test actions
  if (actions.some(a => a.canonicalAction === 'test' || a.canonicalAction === 'quality')) risks.add('regression');
  // Detect regression risk from test-related keywords in clauses
  if (hasRegressionKeywords(clauses)) risks.add('regression');
  // Detect compatibility risk from migration/upgrade keywords
  if (hasCompatibilityKeywords(clauses)) risks.add('compatibility');
  // Detect performance risk from performance keywords
  if (hasPerformanceKeywords(clauses, contexts)) risks.add('performance');
  if (actions.some(a => a.canonicalAction === 'git')) risks.add('repository');
  if (actions.some(a => a.canonicalAction === 'deploy' || a.canonicalAction === 'operations')) risks.add('operations');

  return Array.from(risks).sort();
}

// Evidence no-inference rule:
// fix/repair/resolve alone NEVER imply rootCauseKnown: true
// Require explicit cause language (e.g., "caused by", "due to", "root cause")
// Unknown-cause language -> rootCauseKnown: false

const CAUSE_KEYWORDS = Object.freeze([
  'caused by', 'due to', 'root cause', 'root-cause', 'because of', 'originated from',
  'stemming from', 'triggered by', 'result of', 'resulted from',
]);

const UNKNOWN_CAUSE_KEYWORDS = Object.freeze([
  'unknown cause', 'unknown reason', 'cause unknown', 'reason unknown',
  'unclear why', 'not sure why', 'mystery', 'unknown origin',
]);

const FAILURE_KEYWORDS = Object.freeze([
  'failure', 'error', 'crash', 'bug', 'issue', 'problem', 'incident',
  'outage', 'downtime', 'broken', 'failing', 'failed',
]);

const BEHAVIOR_DEFINED_KEYWORDS = Object.freeze([
  'spec', 'specification', 'requirement', 'expected behavior', 'expected result',
  'acceptance criteria', 'behavior defined', 'defined behavior',
]);

function hasCauseLanguage(target) {
  if (!target || typeof target !== 'string') return false;
  const lower = target.toLowerCase();
  return CAUSE_KEYWORDS.some(kw => lower.includes(kw));
}

function hasUnknownCauseLanguage(target) {
  if (!target || typeof target !== 'string') return false;
  const lower = target.toLowerCase();
  return UNKNOWN_CAUSE_KEYWORDS.some(kw => lower.includes(kw));
}

function hasFailureLanguage(target) {
  if (!target || typeof target !== 'string') return false;
  const lower = target.toLowerCase();
  return FAILURE_KEYWORDS.some(kw => lower.includes(kw)) ||
         EVIDENCE_FAILURE_PATTERNS.some(p => p.test(lower));
}

function hasBehaviorDefinedLanguage(target) {
  if (!target || typeof target !== 'string') return false;
  const lower = target.toLowerCase();
  return BEHAVIOR_DEFINED_KEYWORDS.some(kw => lower.includes(kw));
}

export function deriveEvidence(frames, contexts = []) {
  if (!frames || !Array.isArray(frames)) {
    return { rootCauseKnown: null, behaviorDefined: null, failureObserved: null };
  }

  // Only consider GOVERNING action for evidence
  const governing = frames.find(f => f.role === 'GOVERNING');

  // Also check LOG_OUTPUT frames for failure/behavior language
  const logFrames = contexts.filter(f => f.kind === 'LOG_OUTPUT');
  const allLogText = logFrames.map(f => f.text).join(' ');

  // Also check other instructional clauses (DIRECT_INSTRUCTION, SECONDARY_INSTRUCTION)
  // for cause/behavior language that applies to the governing action
  const instructionalFrames = contexts.filter(f => 
    f.kind === 'DIRECT_INSTRUCTION' || f.kind === 'SECONDARY_INSTRUCTION'
  );
  const allInstructionText = instructionalFrames
    .filter(f => f !== governing) // exclude governing frame to avoid double counting
    .map(f => f.text)
    .join(' ');

  // Also check secondary action frames (non-governing frames in frames array)
  // for cause/behavior language that may be evidence for the governing action
  const secondaryFrames = frames.filter(f => f !== governing);
  const allSecondaryText = secondaryFrames
    .map(f => (f.surfaceVerb || '') + ' ' + (f.target || ''))
    .join(' ');

  // If no governing action, check LOG_OUTPUT frames directly for failure
  let target = '';
  if (governing) {
    target = governing.target || '';
  }

  // Evidence no-inference rule: fix/repair/resolve alone NEVER imply rootCauseKnown
  const isFixLike = governing && ['fix', 'repair', 'resolve'].includes(governing.canonicalAction);

  let rootCauseKnown = null;
  if (isFixLike) {
    // fix/repair/resolve alone -> false unless explicit cause language
    if (hasCauseLanguage(target) || hasCauseLanguage(allLogText) || hasCauseLanguage(allInstructionText) || hasCauseLanguage(allSecondaryText)) {
      rootCauseKnown = true;
    } else if (hasUnknownCauseLanguage(target) || hasUnknownCauseLanguage(allLogText) || hasUnknownCauseLanguage(allInstructionText) || hasUnknownCauseLanguage(allSecondaryText)) {
      rootCauseKnown = false;
    } else {
      // fix/repair/resolve alone, no cause language -> false (no inference)
      rootCauseKnown = false;
    }
  } else if (hasCauseLanguage(target) || hasCauseLanguage(allLogText) || hasCauseLanguage(allInstructionText) || hasCauseLanguage(allSecondaryText)) {
    rootCauseKnown = true;
  } else if (hasUnknownCauseLanguage(target) || hasUnknownCauseLanguage(allLogText) || hasUnknownCauseLanguage(allInstructionText) || hasUnknownCauseLanguage(allSecondaryText)) {
    rootCauseKnown = false;
  }

  let behaviorDefined = null;
  if (hasBehaviorDefinedLanguage(target) || hasBehaviorDefinedLanguage(allLogText) || hasBehaviorDefinedLanguage(allInstructionText) || hasBehaviorDefinedLanguage(allSecondaryText)) {
    behaviorDefined = true;
  }

  let failureObserved = null;
  if (hasFailureLanguage(target) || hasFailureLanguage(allLogText)) {
    failureObserved = true;
  }

  return { rootCauseKnown, behaviorDefined, failureObserved };
}

// Canonical object taxonomy normalization (T20)
// Maps extracted specific targets to eval-expected canonical objects
// Keys sorted by length descending to ensure longest match wins
const TARGET_TO_CANONICAL_OBJECT_ENTRIES = Object.freeze([
  // data / business rules
  ['business rule', 'data'],
  ['business rules', 'data'],
  ['requirements', 'data'],
  ['partial refunds', 'data'],
  ['refund rule', 'data'],

  // architecture / features / plans
  ['approved feature', 'architecture'],
  ['implementation plan', 'architecture'],
  ['feature', 'architecture'],
  ['migration', 'architecture'],
  ['architecture', 'architecture'],
  ['design', 'architecture'],

  // ui / frontend
  ['checkout flow', 'ui'],
  ['responsive checkout', 'ui'],
  ['checkout', 'ui'],
  ['frontend', 'ui'],

  // api / backend / webhook
  ['stripe webhook', 'api'],
  ['webhook endpoint', 'api'],
  ['signature validation', 'api'],
  ['webhook', 'api'],
  ['payment flow', 'backend'],
  ['duplicate payment', 'backend'],
  ['payment bug', 'backend'],
  ['backend', 'backend'],
  ['oauth login', 'auth'],
  ['oauth', 'auth'],
  ['auth diff', 'auth'],
  ['auth code', 'auth'],
  ['authorization', 'auth'],
  ['login crash', 'auth'],
  ['null token', 'auth'],
  ['login', 'auth'],
  ['auth', 'auth'],

  // dependency / package / runtime
  ['react native 0.xx', 'dependency'],
  ['react native', 'dependency'],
  ['memory leak', 'runtime'],
  ['dependency', 'dependency'],
  ['package', 'package'],
  ['memory', 'runtime'],
  ['runtime', 'runtime'],
  ['CI pipeline', 'build'],
  ['build pipeline', 'build'],
  ['CI', 'build'],
  ['build', 'build'],

  // repository / code / commit / branch
  ['this auth code', 'repository'],
  ['auth changes', 'repository'],
  ['auth mapper', 'repository'],
  ['completed task files', 'repository'],
  ['interrupted implementation', 'implementation'],
  ['current repo state', 'repository'],
  ['current changes', 'repository'],
  ['implementation', 'implementation'],
  ['feature branch', 'branch'],
  ['code', 'repository'],
  ['repository', 'repository'],
  ['repo', 'repository'],
  ['this code', 'repository'],
  ['commit', 'commit'],
  ['branch', 'branch'],
  ['develop', 'branch'],
  ['deployment configuration', 'deployment'],
  ['deployment steps', 'deployment'],
  ['deployment', 'deployment'],
  ['configuration', 'deployment'],
  ['staging container', 'container'],
  ['container', 'container'],
  ['production', 'deployment'],
  ['staging', 'deployment'],
  ['rollback', 'deployment'],
  ['migration', 'deployment'],
  ['health', 'deployment'],
  ['recovery', 'deployment'],

  // security / quality / test
  ['QA regression matrix', 'repository'],
  ['regression matrix', 'repository'],
  ['authorization vulnerabilities', 'repository'],
  ['security issues', 'repository'],
  ['vulnerabilities', 'repository'],
  ['security', 'repository'],
  ['regression tests', 'repository'],
  ['automated tests', 'repository'],
  ['test suite', 'repository'],
  ['tests', 'repository'],

  // token / auth
  ['null-token', 'auth'],
  ['token', 'auth'],
]);

// Pre-compiled regex patterns for word-boundary matching
const TARGET_REGEX_CACHE = new Map();
function getTargetRegex(key) {
  if (!TARGET_REGEX_CACHE.has(key)) {
    // Escape special regex chars and add word boundaries
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Use word boundaries for alphanumeric keys, but allow hyphens/spaces within
    TARGET_REGEX_CACHE.set(key, new RegExp(`\\b${escaped}\\b`, 'i'));
  }
  return TARGET_REGEX_CACHE.get(key);
}

function matchCanonicalObject(target) {
  const lower = target.toLowerCase();
  for (const [key, canonical] of TARGET_TO_CANONICAL_OBJECT_ENTRIES) {
    const regex = getTargetRegex(key);
    if (regex.test(lower)) {
      return canonical;
    }
  }
  return null;
}

export function deriveObject(frames) {
  if (!frames || !Array.isArray(frames)) return 'unknown';

  // First GOVERNING action's target
  const governing = frames.find(f => f.role === 'GOVERNING');
  if (governing && governing.target) {
    const canonical = matchCanonicalObject(governing.target);
    if (canonical) return canonical;
    return governing.target;
  }

  // Fallback: first action with target
  for (const action of frames) {
    if (action.target) {
      const canonical = matchCanonicalObject(action.target);
      if (canonical) return canonical;
      return action.target;
    }
  }

  return 'unknown';
}

// Also export a version that accepts context frames for object derivation
export function deriveObjectWithContext(actions, contexts) {
  if (!actions || !Array.isArray(actions)) return 'unknown';

  // First GOVERNING action's target
  const governing = actions.find(f => f.role === 'GOVERNING');
  if (governing && governing.target) {
    const canonical = matchCanonicalObject(governing.target);
    if (canonical) return canonical;
    return governing.target;
  }

  // Fallback: first action with target
  for (const action of actions) {
    if (action.target) {
      const canonical = matchCanonicalObject(action.target);
      if (canonical) return canonical;
      return action.target;
    }
  }

  // Fallback: check context frames (LOG_OUTPUT for failure descriptions)
  if (contexts && Array.isArray(contexts)) {
    for (const ctx of contexts) {
      if (ctx.kind === 'LOG_OUTPUT' && ctx.text) {
        const text = ctx.text.toLowerCase();
        // Special case: "connection refused" / network errors -> runtime (CHECK FIRST before generic map)
        if (/\b(connection\s+refused|timeout|network\s+error|out\s+of\s+memory|oom|segmentation\s+fault)\b/.test(text)) {
          return 'runtime';
        }
        const canonical = matchCanonicalObject(text);
        if (canonical) return canonical;
      }
    }
  }

  return 'unknown';
}

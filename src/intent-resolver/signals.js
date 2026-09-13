/**
 * Signal Extraction — keyword maps with match tracking
 * 
 * Returns structured signal objects with:
 * - category
 * - count
 * - matched keywords
 * - segment authority (source of match)
 */

// Phase keywords - broad domain vocabulary
export const PHASE_KEYWORDS = Object.freeze({
  discovery: ['understand', 'explore', 'map', 'trace', 'analyze', 'inspect', 'examine', 'survey', 'discover', 'learn', 'explain', 'threat model', 'threat-model', 'audit', 'assess security', 'threat modeling'],
  definition: ['requirements', 'define', 'specify', 'clarify', 'gather', 'capture', 'document', 'acceptance', 'criteria', 'business rule', 'user story', 'use case', 'specification', 'spec'],
  planning: ['plan', 'planning', 'strategy', 'approach', 'roadmap', 'design', 'architect', 'scope', 'breakdown', 'task', 'estimate', 'prepare', 'steps', 'migration plan', 'rollout plan'],
  design: ['design', 'ui', 'ux', 'layout', 'visual', 'responsive', 'accessibility', 'mockup', 'wireframe', 'prototype', 'interface', 'experience', 'redesign'],
  implementation: ['implement', 'build', 'create', 'add', 'develop', 'write', 'modify', 'update', 'refactor', 'fix', 'feature', 'functionality', 'patch', 'code'],
  diagnosis: ['debug', 'diagnose', 'investigate', 'troubleshoot', 'root cause', 'why', 'crash', 'error', 'fail', 'broken', 'issue', 'bug', 'reproduce', 'isolate', 'find cause', 'determine cause'],
  verification: ['test', 'testing', 'verify', 'validate', 'check', 'qa', 'quality', 'regression', 'automated test', 'unit test', 'integration test', 'e2e', 'matrix', 'scenario', 'coverage', 'review', 'code review', 'pr review', 'write test', 'add test', 'create test'],
  delivery: ['release', 'ship', 'publish', 'deliver', 'handoff', 'readiness', 'package', 'artifact', 'assess release', 'check release', 'confirm release'],
  operations: ['deploy', 'deployment', 'operate', 'run', 'monitor', 'ci', 'cd', 'pipeline', 'container', 'environment', 'infrastructure', 'rollback', 'observability', 'staging deploy', 'production deploy', 'canary', 'rollout'],
  recovery: ['recover', 'reconstruct', 'resume', 'interrupted', 'lost', 'context', 'state', 'where was i', 'replay', 'resume work'],
  repository: ['git', 'commit', 'push', 'merge', 'rebase', 'branch', 'stage', 'stash', 'cherry-pick', 'conflict', 'cleanup', 'history', 'log', 'merge locally'],
});

// Action keywords - verb-level
export const ACTION_KEYWORDS = Object.freeze({
  understand: ['understand', 'explore', 'map', 'trace', 'analyze', 'inspect', 'examine', 'survey', 'discover', 'learn', 'explain'],
  define: ['define', 'specify', 'clarify', 'gather', 'capture', 'document', 'requirements'],
  assess: ['assess', 'evaluate', 'review', 'audit', 'check', 'analyze', 'threat model', 'threat-model', 'threat modeling'],
  plan: ['plan', 'planning', 'strategy', 'approach', 'roadmap', 'scope', 'breakdown', 'estimate', 'prepare steps'],
  design: ['design', 'layout', 'visual', 'responsive', 'accessibility', 'mockup', 'wireframe', 'prototype', 'redesign'],
  implement: ['implement', 'build', 'create', 'add', 'develop', 'write', 'code', 'feature', 'functionality'],
  modify: ['modify', 'change', 'update', 'refactor', 'migrate', 'upgrade'],
  fix: ['fix', 'repair', 'resolve', 'patch', 'correct'],
  investigate: ['investigate', 'debug', 'diagnose', 'troubleshoot', 'find', 'root cause', 'why', 'reproduce', 'isolate', 'determine cause', 'find cause'],
  test: ['test', 'testing', 'verify', 'validate', 'automated test', 'unit test', 'integration test', 'e2e', 'add test', 'write test', 'create test'],
  review: ['review', 'audit', 'inspect', 'evaluate', 'check', 'code review', 'pr review'],
  upgrade: ['upgrade', 'migrate', 'update dependency', 'framework upgrade', 'dependency upgrade'],
  release: ['release', 'ship', 'publish', 'deliver', 'handoff'],
  deploy: ['deploy', 'deployment', 'push to', 'roll out', 'rollout'],
  recover: ['recover', 'reconstruct', 'resume', 'interrupted', 'replay'],
  git: ['commit', 'push', 'merge', 'rebase', 'branch', 'stage', 'cherry-pick', 'merge locally'],
});

// Object keywords - target domain
export const OBJECT_KEYWORDS = Object.freeze({
  repository: ['repository', 'repo', 'codebase', 'project', 'source', 'architecture', 'structure'],
  backend: ['backend', 'server', 'service', 'database', 'schema', 'migration', 'api service', 'backend service', 'payment service', 'payment bug', 'payment', 'retry logic', 'validator'],
  api: ['api', 'endpoint', 'rest', 'graphql', 'webhook', 'webhooks', 'api contract'],
  ui: ['ui', 'frontend', 'interface', 'component', 'screen', 'page', 'view', 'layout', 'responsive', 'mobile', 'web', 'checkout'],
  runtime: ['runtime', 'application', 'app', 'process', 'memory', 'performance', 'crash', 'leak', 'hang', 'worker', 'gateway', '502', 'intermittent', 'intermittently', 'test suite', 'connection issue', 'connection problem'],
  build: ['build', 'compile', 'bundle', 'ci', 'pipeline', 'artifact', 'dependency', 'ci failure', 'build failure'],
  network: ['network', 'http', 'request', 'response', 'api call', 'connection', 'timeout', 'intermittent 502', 'connection refused'],
  state: ['state', 'store', 'cache', 'session', 'localstorage', 'redux', 'context'],
  auth: ['auth', 'authentication', 'authorization', 'login', 'token', 'oauth', 'jwt', 'session', 'permission', 'auth bypass', 'null token', 'null-token'],
  dependency: ['dependency', 'package', 'library', 'framework', 'version', 'upgrade', 'migration', 'react native', 'database driver', 'db driver'],
  release: ['release', 'package', 'artifact', 'build', 'version', 'changelog', 'publish', 'release artifact', 'v2.3.0', 'v2'],
  deployment: ['deployment', 'container', 'docker', 'kubernetes', 'ci', 'cd', 'pipeline', 'environment', 'infrastructure', 'staging', 'canary config', 'rollout plan', 'deploy script', 'rollback'],
  container: ['container', 'docker', 'image', 'kubernetes', 'pod'],
  data: ['data', 'business rule', 'business logic', 'schema', 'model', 'entity', 'business rule not known', 'partial refund'],
  implementation: ['implementation', 'feature', 'code', 'changes', 'work', 'task', 'interrupted implementation', 'interrupted feature work'],
  commit: ['commit', 'change', 'file', 'staging', 'committed', 'config changes'],
  branch: ['branch', 'feature branch', 'develop', 'main', 'master', 'feature branch'],
  architecture: ['architecture', 'architectural', 'system design', 'high level', 'approved feature', 'correctness', 'maintainability'],
});

// Risk keywords - domain concerns
export const RISK_KEYWORDS = Object.freeze({
  security: ['security', 'auth', 'authorization', 'authentication', 'secret', 'credential', 'token', 'vulnerability', 'exploit', 'attack', 'threat', 'xss', 'csrf', 'sql injection', 'injection', 'idol', 'bola', 'ssrf', 'encryption', 'signature', 'webhook', 'trust boundary', 'penetration test', 'pentest', 'oauth callback', 'oauth login', 'oauth', 'encryption module'],
  regression: ['regression', 'regress', 'break', 'existing', 'previous', 'backward', 'compatibility', 'used to work', 'flaky', 'intermittent', 'regression test', 'regression matrix', 'flaky test', 'duplicate payment'],
  compatibility: ['compatibility', 'compatible', 'version', 'upgrade', 'migration', 'breaking', 'deprecated', 'polyfill', 'react native', 'database driver', 'dependency upgrade'],
  performance: ['performance', 'slow', 'latency', 'speed', 'optimization', 'bottleneck', 'memory', 'cpu', 'jank', 'lag', 'timeout', 'memory leak', 'circuit breaker', 'unclosed stream'],
  'data-integrity': ['data integrity', 'data loss', 'corruption', 'consistency', 'transaction', 'atomic', 'rollback', 'backup', 'data-integrity', 'migration tests', 'migration rollback'],
  production: ['production', 'prod', 'live', 'customer facing', 'revenue', 'downtime', 'outage', 'sla', 'prod deploy', 'hotfix prod'],
  operations: ['operations', 'ops', 'deployment', 'cd', 'pipeline', 'infrastructure', 'monitoring', 'observability', 'rollback', 'incident', 'staging deploy hanging', 'health check', 'deploy script', 'deployment config'],
});

// Mutation keywords
export const MUTATION_KEYWORDS = Object.freeze({
  'read-only': ['read only', 'read-only', 'review only', 'inspect only', 'audit only', 'assess only', 'check only', 'look at', 'examine', 'do not change', 'do not modify', 'do not write', 'no change', 'no modification', 'non-destructive', 'without changing', 'without modifying', 'explain', 'what does', 'how does', 'sketch', 'plan', 'planning', 'document', 'confirm', 'check if', 'verify config', 'sketch plan', 'rollout plan', 'canary config', 'verify config', 'reconstruct', 'what happened', 'failed deploy', 'prepare steps', 'prepare deploy steps', 'plan deploy'],
  'local-write': ['fix', 'implement', 'modify', 'change', 'update', 'refactor', 'add', 'create', 'write', 'code', 'develop', 'build', 'locally', 'local', 'commit', 'stage', 'add idempotency', 'add feature flags', 'write integration tests', 'write unit tests', 'write contract tests', 'create risk matrix', 'add unit tests'],
  'remote-write': ['push', 'merge', 'remote', 'upstream', 'origin', 'pull request', 'branch', 'rebase', 'cherry-pick', 'merge locally', 'hold the push', 'merge feature branch'],
  'production-impacting': ['deploy', 'production', 'prod', 'live', 'release', 'publish', 'ship', 'rollout', 'canary', 'blue-green', 'infrastructure', 'terraform', 'kubernetes', 'docker', 'container', 'deploy hotfix', 'deploy to prod', 'deploy production'],
});

// Evidence keys
export const EVIDENCE_KEYS = Object.freeze(['failureObserved', 'rootCauseKnown', 'behaviorDefined']);

// Evidence keywords
export const EVIDENCE_KEYWORDS = Object.freeze({
  failureObserved: {
    true: ['crash', 'crashes', 'crashing', 'fail', 'fails', 'failing', 'error', 'broken', 'bug', 'issue', 'problem', 'doesn\'t work', 'not working', 'reproduce', 'reproduced', 'observed', 'seen', 'happens', 'occurs', 'intermittent', 'flaky', 'hanging', '502', 'connection refused', 'fail intermittently', 'fails intermittently', 'memory leak', 'null token', 'auth bypass', 'login crash', 'test suite fails'],
    false: ['no crash', 'no failure', 'no error', 'it works', 'everything works', 'system works', 'all works', 'all tests pass', 'stable', 'no issue'],
  },
  rootCauseKnown: {
    true: ['known cause', 'cause is', 'because', 'due to', 'the issue is', 'the problem is', 'identified', 'found the', 'confirmed', 'diagnosed', 'isolated', 'cause:', 'root cause confirmed', 'root cause is known', 'already know the', 'i know the', 'the cause is', 'cause is the'],
    false: ['unknown', 'don\'t know', 'not sure', 'unclear', 'why', 'mystery', 'can\'t find', 'no idea', 'unknown cause', 'root cause unknown', 'cause unknown', 'find the root cause', 'find root cause', 'determine the cause', 'determine the root cause', 'not known', 'is not known', 'no confirmed cause', 'no known cause', 'investigate', 'debug unknown', 'why is', 'what caused', 'what is causing'],
  },
  behaviorDefined: {
    true: ['requirements', 'spec', 'specification', 'acceptance criteria', 'clearly defined', 'well defined', 'fully defined', 'documented', 'approved', 'agreed', 'signed off', 'design doc', 'behavior defined', 'according to', 'approved acceptance criteria', 'according to spec', 'according to specification', 'according to requirements', 'approved criteria', 'regression tests', 'automated tests'],
    false: ['undefined', 'unclear', 'unknown', 'not defined', 'missing', 'ambiguous', 'requirements not defined', 'no spec', 'no requirements', 'business rule not known', 'not decided', 'are not defined', 'is not defined', 'not known', 'requirements are not defined', 'business rule.*not known'],
  },
});

// Negation patterns
export const NEGATION_PATTERNS = Object.freeze([
  { pattern: /\bdon['']?t\b/, target: 'negate' },
  { pattern: /\bdo not\b/, target: 'negate' },
  { pattern: /\bdo[n']t\b/, target: 'negate' },
  { pattern: /\bnot\b/, target: 'negate' },
  { pattern: /\bnever\b/, target: 'negate' },
  { pattern: /\bavoid\b/, target: 'negate' },
  { pattern: /\bwithout\b/, target: 'negate' },
  { pattern: /\bonly\b/, target: 'restrict' },
  { pattern: /\bjust\b/, target: 'restrict' },
  { pattern: /\bno\b/, target: 'negate' },
]);

// Readiness patterns
export const READINESS_PATTERNS = Object.freeze([
  /\bcheck whether.*ready\b/i,
  /\bassess whether.*ready\b/i,
  /\bready to (publish|release|deploy|ship)\b/i,
  /\breadiness\b/i,
  /\bconfirm.*release.*artifact\b/i,
  /\bconfirm.*passes all gates\b/i,
]);

// Staging detection
export const STAGING_PATTERNS = Object.freeze([
  /\bstaging\b/i,
  /\bstage\b(?!\w*ing)/i,
]);

// Multi-intent separators
export const MULTI_INTENT_SEPARATORS = Object.freeze([
  ' and ',
  ' then ',
  ' also ',
  ' plus ',
  ' with ',
  ';',
  ', then ',
  ', also ',
  ', plus ',
]);

/**
 * Lowercase utility
 */
export function lower(text) {
  return String(text ?? '').toLowerCase();
}

/**
 * Extract keywords from text with match tracking.
 * 
 * @param {string} text
 * @param {Object} keywordMap
 * @returns {Map<string, {count: number, matched: string[]}>}
 */
export function extractKeywords(text, keywordMap) {
  const lowerText = lower(text);
  const found = new Map();
  for (const [category, keywords] of Object.entries(keywordMap)) {
    let count = 0;
    const matched = [];
    for (const keyword of keywords) {
      const regex = new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      const matches = lowerText.match(regex);
      if (matches) {
        count += matches.length;
        matched.push(keyword);
      }
    }
    if (count > 0) {
      found.set(category, { count, matched });
    }
  }
  return found;
}

/**
 * Find best match from keyword extraction.
 * When counts are equal, use canonical object precedence for deterministic tie-breaking.
 * 
 * @param {Map} found
 * @param {string} defaultValue
 * @returns {string}
 */
export function findBestMatch(found, defaultValue) {
  if (found.size === 0) return defaultValue;
  
  // Canonical object precedence for deterministic tie-breaking
  const OBJECT_PRECEDENCE = [
    'auth',           // auth is specific and high-signal
    'api',            // api/webhook
    'backend',        // backend/service
    'deployment',     // deployment/container
    'container',      // container
    'dependency',     // dependency/upgrade
    'release',        // release/package
    'build',          // build/ci
    'runtime',        // runtime/memory/performance
    'network',        // network/connection
    'data',           // data/business rule
    'ui',             // ui/frontend
    'state',          // state/store
    'commit',         // commit/staging
    'branch',         // branch
    'architecture',   // architecture
    'implementation', // implementation/feature
    'repository',     // generic fallback
  ];
  
  let best = null;
  let bestScore = -1;
  let bestPrecedence = Infinity;
  
  for (const [category, data] of found.entries()) {
    const precedence = OBJECT_PRECEDENCE.indexOf(category);
    const effectivePrecedence = precedence === -1 ? OBJECT_PRECEDENCE.length : precedence;
    
    if (data.count > bestScore || 
        (data.count === bestScore && effectivePrecedence < bestPrecedence)) {
      bestScore = data.count;
      bestPrecedence = effectivePrecedence;
      best = category;
    }
  }
  return best ?? defaultValue;
}

/**
 * Check for known cause pattern.
 * 
 * @param {string} text
 * @returns {boolean}
 */
export function hasKnownCausePattern(text) {
  const lowerText = lower(text);
  
  // Explicit negative patterns - check these FIRST
  const negativePatterns = [
    /\bno\s+(known|confirmed)\s+cause\b/i,
    /\bnot\s+(known|confirmed)\s+cause\b/i,
    /\bwithout\s+(known|confirmed)\s+cause\b/i,
  ];
  for (const pattern of negativePatterns) {
    if (pattern.test(lowerText)) return false;
  }
  
  const knownCausePatterns = [
    /\bknown cause\b/i,
    /\broot cause is (known|confirmed|identified)\b/i,
    /\bcause is (known|confirmed|identified)\b/i,
    /\bconfirmed (root cause|cause)\b/i,
    /\bdiagnosed\b/i,
    /\balready know\b/i,
    /\bi know the\b/i,
    /\bthe cause is\b/i,
  ];
  for (const pattern of knownCausePatterns) {
    if (pattern.test(lowerText)) return true;
  }
  return false;
}

/**
 * Check for find root cause pattern.
 * 
 * @param {string} text
 * @returns {boolean}
 */
export function hasFindRootCausePattern(text) {
  const lowerText = lower(text);
  const findCausePatterns = [
    /\bfind the root cause\b/i,
    /\bfind root cause\b/i,
    /\bdetermine the (root )?cause\b/i,
    /\bwhat (caused|is causing)\b/i,
    /\bwhy (did|does|is)\b/i,
  ];
  for (const pattern of findCausePatterns) {
    if (pattern.test(lowerText)) return true;
  }
  return false;
}

/**
 * Check for readiness pattern.
 * 
 * @param {string} text
 * @returns {boolean}
 */
export function hasReadinessPattern(text) {
  const lowerText = lower(text);
  for (const pattern of READINESS_PATTERNS) {
    if (pattern.test(lowerText)) return true;
  }
  return false;
}

/**
 * Check for staging deploy.
 * 
 * @param {string} text
 * @returns {boolean}
 */
export function isStagingDeploy(text) {
  const lowerText = lower(text);
  for (const pattern of STAGING_PATTERNS) {
    if (pattern.test(lowerText)) return true;
  }
  return false;
}

/**
 * Check if a keyword is negated in the text.
 * 
 * @param {string} text
 * @param {string} keyword
 * @returns {boolean}
 */
export function isNegated(text, keyword) {
  const lowerText = lower(text);
  const regex = new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
  let match;
  while ((match = regex.exec(lowerText)) !== null) {
    const index = match.index;
    const before = lowerText.substring(Math.max(0, index - 100), index);
    for (const { pattern } of NEGATION_PATTERNS) {
      if (pattern.test(before)) return true;
    }
    const negPatterns = [
      /\bdo not\s+\w*/i,
      /\bdon['']?t\s+\w*/i,
      /\bnever\s+\w*/i,
      /\bwithout\s+\w*/i,
    ];
    for (const pattern of negPatterns) {
      const negMatch = before.match(pattern);
      if (negMatch) {
        const afterNeg = negMatch[0].replace(/^(do not|don['']?t|never|without)\s+/i, '');
        if (afterNeg.includes(keyword) || keyword.includes(afterNeg)) {
          return true;
        }
      }
    }
  }
  return false;
}

/**
 * Check if action is negated by common patterns.
 * 
 * @param {string} text
 * @param {string} action
 * @returns {boolean}
 */
export function isActionNegated(text, action) {
  const lowerText = lower(text);
  return isNegated(lowerText, action) || 
    /\bno\s+deploy\b/i.test(lowerText) ||
    /\bdo not\s+deploy\b/i.test(lowerText) ||
    /\bdon't\s+deploy\b/i.test(lowerText) ||
    /\bwithout\s+deploying\b/i.test(lowerText) ||
    /\bdon['']?t\s+implement\b/i.test(lowerText) ||
    /\bdo not\s+implement\b/i.test(lowerText) ||
    /\bwithout\s+implementing\b/i.test(lowerText);
}

/**
 * Provenance-aware signal extraction.
 * Extracts keywords from each segment and attaches provenance metadata.
 *
 * @param {Array} segments — from segmentPrompt
 * @param {Object} keywordMap — keyword map to extract from
 * @returns {Array<{category: string, value: string, segmentIndex: number, segmentKind: string, authority: number, polarity: string, negated: boolean, count: number, matched: string[]}>}
 */
export function extractSignalsWithProvenance(segments, keywordMap) {
  const signals = [];

  for (const segment of segments) {
    const segmentSignals = extractKeywords(segment.text, keywordMap);
    for (const [category, data] of segmentSignals.entries()) {
      signals.push({
        category,
        value: data.matched[0], // primary matched keyword
        segmentIndex: segment.index,
        segmentKind: segment.kind,
        authority: segment.authority,
        polarity: segment.polarity,
        negated: segment.negated,
        count: data.count,
        matched: data.matched,
        segmentText: segment.text,
        verb: segment.verb,
        target: segment.target,
      });
    }
  }

  return signals;
}

/**
 * Filter signals by segment kinds.
 *
 * @param {Array} signals — from extractSignalsWithProvenance
 * @param {string[]} kinds — segment kinds to include
 * @returns {Array}
 */
export function filterSignalsByKind(signals, kinds) {
  const kindSet = new Set(kinds);
  return signals.filter(s => kindSet.has(s.segmentKind));
}

/**
 * Get highest authority signal for a category.
 *
 * @param {Array} signals — from extractSignalsWithProvenance
 * @param {string} category
 * @returns {Object|null}
 */
export function getHighestAuthoritySignal(signals, category) {
  const categorySignals = signals.filter(s => s.category === category);
  if (categorySignals.length === 0) return null;
  return categorySignals.reduce((best, current) =>
    current.authority > best.authority ? current : best
  );
}
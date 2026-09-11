/**
 * Compositional Intent Candidate Scoring
 * 
 * Builds ownership candidates from verb + target combinations.
 * Replaces isolated keyword precedence with semantic composition.
 */

import { hasKnownCausePattern, hasFindRootCausePattern, hasReadinessPattern, isStagingDeploy, PHASE_KEYWORDS } from './signals.js';

/**
 * Candidate intent with score and evidence
 */
export class IntentCandidate {
  constructor(phase, action, object, score = 0, evidence = {}) {
    this.phase = phase;
    this.action = action;
    this.object = object;
    this.score = score;
    this.evidence = evidence; // { verb, target, modifiers }
  }
}

/**
 * Score a verb + target combination.
 * 
 * @param {string} verb — action verb from DIRECT_INSTRUCTION
 * @param {string} target — object/target from context
 * @param {Object} signals — extracted signals
 * @returns {IntentCandidate[]}
 */
export function scoreVerbTarget(verb, target, signals) {
  const candidates = [];

  // Normalize
  const v = verb.toLowerCase();
  const t = target.toLowerCase();

  // === UPGRADE / MIGRATE ===
  if (/\b(upgrade|migrate|update dependency|framework upgrade)\b/.test(v)) {
    // Upgrade ownership stays with upgrade
    candidates.push(new IntentCandidate('implementation', 'upgrade', 'dependency', 100, {
      verb: 'upgrade',
      target: target,
      reason: 'upgrade/migrate verb',
    }));
    // If tests explicitly mentioned, test is secondary
    if (/\b(test|regression test|automated test)\b/.test(t)) {
      // Still upgrade primary
    }
    return candidates;
  }

  // === WRITE / CREATE / ADD + TESTS ===
  if (/\b(write|create|add)\b/.test(v) && /\b(test|automated test|unit test|integration test|e2e|regression test)\b/.test(t)) {
    // Tests as main artifact -> test primary
    candidates.push(new IntentCandidate('verification', 'test', 'backend', 95, {
      verb: 'write/create/add',
      target: 'tests',
      reason: 'tests as requested artifact',
    }));
    return candidates;
  }

  // === QA / QUALITY MATRIX / SCENARIOS ===
  if (/\b(qa|quality|map|create)\b/.test(v) && /\b(matrix|scenario|regression matrix|coverage matrix|risk matrix|risk coverage|compatibility matrix)\b/.test(t)) {
    candidates.push(new IntentCandidate('verification', 'test', 'repository', 90, {
      verb: 'qa/quality',
      target: 'matrix/scenarios',
      reason: 'QA planning, not test implementation',
    }));
    return candidates;
  }

  // === REVIEW / AUDIT + SECURITY ===
  if (/\b(review|audit|inspect|evaluate)\b/.test(v) && /\b(security|auth|authorization|vulnerability|threat|exploit|penetration|encryption|oauth)\b/.test(t)) {
    candidates.push(new IntentCandidate('verification', 'review', 'auth', 90, {
      verb: 'review/audit',
      target: 'security',
      reason: 'security review/audit',
    }));
    return candidates;
  }

  // === REVIEW / AUDIT (general) ===
  if (/\b(review|audit|code review|pr review)\b/.test(v)) {
    candidates.push(new IntentCandidate('verification', 'review', 'repository', 80, {
      verb: 'review/audit',
      target: target,
      reason: 'general review/audit',
    }));
    return candidates;
  }

  // === THREAT MODEL / SECURITY ASSESSMENT ===
  if (/\b(threat model|threat-model|security audit|security review|security assessment|penetration test|pentest)\b/.test(v)) {
    candidates.push(new IntentCandidate('discovery', 'assess', 'auth', 90, {
      verb: 'threat model/security assessment',
      target: target,
      reason: 'security discovery',
    }));
    return candidates;
  }

  // === IMPLEMENT / BUILD / CREATE / ADD / DEVELOP + CODE/FEATURE ===
  if (/\b(implement|build|create|add|develop|write|code|feature|functionality)\b/.test(v) && 
      !/\b(test|automated test|unit test|integration test|e2e|regression test)\b/.test(t)) {
    candidates.push(new IntentCandidate('implementation', 'implement', target || 'repository', 90, {
      verb: 'implement/build/create',
      target: target || 'code/feature',
      reason: 'implementation ownership',
    }));
    return candidates;
  }

  // === FIX + KNOWN CAUSE ===
  if (/\b(fix|repair|resolve|patch|correct)\b/.test(v) && hasKnownCausePattern(target)) {
    candidates.push(new IntentCandidate('implementation', 'fix', target, 95, {
      verb: 'fix',
      target: target,
      reason: 'known cause fix -> build ownership',
    }));
    return candidates;
  }

  // === FIX (general) ===
  if (/\b(fix|repair|resolve|patch|correct)\b/.test(v)) {
    candidates.push(new IntentCandidate('implementation', 'fix', target, 85, {
      verb: 'fix',
      target: target,
      reason: 'fix requested',
    }));
    return candidates;
  }

  // === MODIFY / UPDATE / REFACTOR ===
  if (/\b(modify|change|update|refactor)\b/.test(v)) {
    candidates.push(new IntentCandidate('implementation', 'modify', target, 80, {
      verb: 'modify/update/refactor',
      target: target,
      reason: 'modification requested',
    }));
    return candidates;
  }

  // === INVESTIGATE / DEBUG + UNKNOWN FAILURE ===
  if (/\b(investigate|debug|diagnose|troubleshoot|find cause|determine cause|root cause)\b/.test(v) && 
      (hasFindRootCausePattern(target) || /\b(unknown|no known cause|no confirmed cause)\b/.test(target))) {
    candidates.push(new IntentCandidate('diagnosis', 'investigate', target, 95, {
      verb: 'investigate/debug',
      target: target,
      reason: 'unknown cause investigation -> debug ownership',
    }));
    return candidates;
  }

  // === INVESTIGATE / DEBUG (general) ===
  if (/\b(investigate|debug|diagnose|troubleshoot|reproduce|isolate|why)\b/.test(v)) {
    candidates.push(new IntentCandidate('diagnosis', 'investigate', target, 80, {
      verb: 'investigate/debug',
      target: target,
      reason: 'investigation requested',
    }));
    return candidates;
  }

  // === ASSESS / CHECK + RELEASE READINESS ===
  if (/\b(assess|check|confirm|verify)\b/.test(v) && hasReadinessPattern(target)) {
    candidates.push(new IntentCandidate('delivery', 'assess', 'package', 90, {
      verb: 'assess/check/confirm',
      target: 'release readiness',
      reason: 'release readiness assessment',
    }));
    return candidates;
  }

  // === DEPLOY / ROLLOUT / ROLLBACK ===
  if (/\b(deploy|deployment|push to|roll out|rollout|rollback)\b/.test(v)) {
    const isStaging = isStagingDeploy(target);
    const isProduction = /\b(production|prod|live|hotfix.*prod)\b/.test(target);
    if (isProduction) {
      candidates.push(new IntentCandidate('operations', 'deploy', 'deployment', 95, {
        verb: 'deploy',
        target: 'production',
        reason: 'production deployment -> ops',
      }));
    } else if (isStaging) {
      candidates.push(new IntentCandidate('operations', 'deploy', 'container', 90, {
        verb: 'deploy',
        target: 'staging',
        reason: 'staging deployment -> ops',
      }));
    } else if (/\b(rollback)\b/.test(v)) {
      candidates.push(new IntentCandidate('planning', 'plan', 'deployment', 85, {
        verb: 'rollback',
        target: 'migration/deployment',
        reason: 'rollback planning',
      }));
    } else {
      candidates.push(new IntentCandidate('operations', 'deploy', 'deployment', 80, {
        verb: 'deploy',
        target: target,
        reason: 'deployment operation',
      }));
    }
    return candidates;
  }

  // === RECOVER / RECONSTRUCT / RESUME / REPLAY ===
  if (/\b(recover|reconstruct|resume|interrupted|replay)\b/.test(v) && 
      !/\b(git|commit|push|merge|rebase|branch|stage)\b/.test(target)) {
    candidates.push(new IntentCandidate('recovery', 'recover', 'implementation', 90, {
      verb: 'recover/reconstruct/resume',
      target: 'interrupted work',
      reason: 'recovery ownership',
    }));
    return candidates;
  }

  // === COMMIT / PUSH / MERGE / REBASE / STAGE ===
  if (/\b(commit|push|merge|rebase|branch|stage|cherry-pick|merge locally)\b/.test(v)) {
    candidates.push(new IntentCandidate('repository', 'git', target || 'branch', 90, {
      verb: 'git operation',
      target: target,
      reason: 'git/repository operation',
    }));
    return candidates;
  }

  // === PREPARE / PLAN / PLANNING (without execution) ===
  if (/\b(prepare|plan|planning)\b/.test(v) && 
      (/\b(only|don['']?t|do not|without)\b/.test(target) || /\b(deploy|implement|execute|run)\b/.test(target))) {
    candidates.push(new IntentCandidate('planning', 'plan', target, 85, {
      verb: 'prepare/plan',
      target: target,
      reason: 'planning without execution',
    }));
    return candidates;
  }

  // === GENERAL PLAN ===
  if (/\b(plan|planning|strategy|approach|roadmap|scope|breakdown|estimate|migration plan|rollout plan)\b/.test(v)) {
    candidates.push(new IntentCandidate('planning', 'plan', target, 70, {
      verb: 'plan',
      target: target,
      reason: 'planning requested',
    }));
    return candidates;
  }

  // === DESIGN ===
  if (/\b(design|redesign|layout|visual|responsive|accessibility|mockup|wireframe|prototype)\b/.test(v)) {
    candidates.push(new IntentCandidate('design', 'design', 'ui', 80, {
      verb: 'design',
      target: target || 'ui',
      reason: 'design requested',
    }));
    return candidates;
  }

  // === DEFINE / SPECIFY / REQUIREMENTS ===
  if (/\b(define|specify|clarify|gather|capture|document|requirements)\b/.test(v)) {
    candidates.push(new IntentCandidate('definition', 'define', 'data', 75, {
      verb: 'define/specify',
      target: target,
      reason: 'requirements definition',
    }));
    return candidates;
  }

  // === EXPLAIN / UNDERSTAND ===
  if (/\b(explain|understand|explore|map|trace|analyze|inspect|examine|survey|discover|learn)\b/.test(v)) {
    candidates.push(new IntentCandidate('discovery', 'understand', target || 'repository', 70, {
      verb: 'explain/understand',
      target: target,
      reason: 'understanding requested',
    }));
    return candidates;
  }

  // === TEST (as verb, not noun) ===
  if (/\b(test|testing|verify|validate|automated test|unit test|integration test|e2e)\b/.test(v) && 
      !/\b(write|create|add)\b/.test(v)) {
    candidates.push(new IntentCandidate('verification', 'test', target || 'backend', 75, {
      verb: 'test',
      target: target,
      reason: 'test execution/verification',
    }));
    return candidates;
  }

  // === RELEASE / SHIP / PUBLISH / DELIVER / HANDOFF ===
  if (/\b(release|ship|publish|deliver|handoff)\b/.test(v) && !hasReadinessPattern(target)) {
    candidates.push(new IntentCandidate('delivery', 'release', 'release', 80, {
      verb: 'release/ship',
      target: target,
      reason: 'release operation',
    }));
    return candidates;
  }

  // === OPERATIONS (monitor, CI/CD, pipeline, etc.) ===
  if (/\b(monitor|ci|cd|pipeline|container|environment|infrastructure|observability)\b/.test(v)) {
    candidates.push(new IntentCandidate('operations', 'modify', target, 60, {
      verb: 'ops',
      target: target,
      reason: 'operations task',
    }));
    return candidates;
  }

  // Default fallback
  candidates.push(new IntentCandidate('implementation', 'implement', target || 'repository', 10, {
    verb: 'default',
    target: target,
    reason: 'fallback',
  }));

  return candidates;
}

/**
 * Score all verb-target combinations from segments.
 * 
 * @param {Array} segments — from segmentPrompt
 * @param {Object} keywordSignals — from extractKeywords
 * @returns {IntentCandidate[]}
 */
export function scoreIntentCandidates(segments, keywordSignals) {
  const candidates = [];
  const directText = segments.filter(s => s.kind === 'DIRECT_INSTRUCTION').map(s => s.text).join(' ');
  const contextText = segments.filter(s => s.authority >= 2).map(s => s.text).join(' ');
  const allText = [directText, contextText].filter(Boolean).join(' ');

  // Extract primary verb from direct instruction
  const verbCandidates = extractPrimaryVerbs(directText);
  
  // Extract targets from context
  const targetCandidates = extractTargets(contextText, keywordSignals);

  // Score each verb-target pair
  for (const verb of verbCandidates) {
    for (const target of targetCandidates) {
      const scored = scoreVerbTarget(verb, target, { allText, keywordSignals });
      // Boost by segment authority
      for (const c of scored) {
        c.score += getSegmentAuthorityBoost(verb, target, segments);
      }
      candidates.push(...scored);
    }
  }

  // Also score direct text as a whole against phase/action keywords
  const phaseScores = scorePhases(keywordSignals, allText);
  for (const [phase, score] of Object.entries(phaseScores)) {
    if (score > 0) {
      candidates.push(new IntentCandidate(phase, null, null, score, { source: 'phase-keywords' }));
    }
  }

  // Sort by score descending
  candidates.sort((a, b) => b.score - a.score);
  
  // Deduplicate by phase+action+object (keep highest score)
  const seen = new Map();
  const unique = [];
  for (const c of candidates) {
    const key = `${c.phase}:${c.action}:${c.object}`;
    if (!seen.has(key) || seen.get(key) < c.score) {
      seen.set(key, c.score);
      unique.push(c);
    }
  }

  return unique;
}

/**
 * Extract primary verbs from direct instruction text.
 * 
 * @param {string} text
 * @returns {string[]}
 */
function extractPrimaryVerbs(text) {
  const verbs = [];
  const lower = text.toLowerCase();
  
  // Multi-word verbs first (order matters)
  const multiVerbs = [
    'threat model', 'threat-model', 'security audit', 'security review',
    'penetration test', 'pentest', 'code review', 'pr review',
    'root cause', 'find root cause', 'find cause', 'determine cause',
    'migration plan', 'rollout plan', 'push to', 'roll out', 'rollout',
    'write test', 'add test', 'create test', 'automated test', 'unit test', 'integration test',
    'regression test', 'e2e test',
    'merge locally', 'merge feature branch',
    'upgrade dependency', 'framework upgrade', 'update dependency',
    'security assessment', 'threat modeling',
    'according to', 'approved criteria', 'acceptance criteria',
    'check whether', 'assess whether', 'ready to', 'confirm release',
    'push to production', 'deploy to prod', 'deploy production',
  ];

  for (const mv of multiVerbs) {
    if (lower.includes(mv)) {
      verbs.push(mv);
    }
  }

  // Single-word verbs
  const singleVerbs = [
    'upgrade', 'migrate', 'implement', 'build', 'create', 'add', 'develop', 'write',
    'modify', 'change', 'update', 'refactor', 'fix', 'repair', 'resolve', 'patch', 'correct',
    'investigate', 'debug', 'diagnose', 'troubleshoot', 'reproduce', 'isolate',
    'review', 'audit', 'inspect', 'evaluate', 'check',
    'test', 'verify', 'validate',
    'deploy', 'deployment', 'rollback',
    'recover', 'reconstruct', 'resume', 'replay',
    'commit', 'push', 'merge', 'rebase', 'branch', 'stage', 'cherry-pick',
    'plan', 'planning', 'strategy', 'approach', 'roadmap', 'scope', 'breakdown', 'estimate', 'prepare',
    'design', 'redesign', 'layout', 'visual', 'responsive', 'accessibility', 'mockup', 'wireframe', 'prototype',
    'define', 'specify', 'clarify', 'gather', 'capture', 'document',
    'explain', 'understand', 'explore', 'map', 'trace', 'analyze', 'inspect', 'examine', 'survey', 'discover', 'learn',
    'release', 'ship', 'publish', 'deliver', 'handoff',
    'monitor', 'operate', 'run',
  ];

  for (const sv of singleVerbs) {
    const regex = new RegExp(`\\b${sv}\\b`);
    if (regex.test(lower) && !verbs.some(v => v.includes(sv))) {
      verbs.push(sv);
    }
  }

  return verbs.length > 0 ? verbs : ['implement']; // fallback
}

/**
 * Extract target nouns from context text.
 * 
 * @param {string} text
 * @param {Object} keywordSignals
 * @returns {string[]}
 */
function extractTargets(text, keywordSignals) {
  const targets = [];
  const lower = text.toLowerCase();

  // Object keywords from signals
  for (const [obj] of keywordSignals.entries()) {
    if (OBJECT_KEYWORD_ALIASES[obj]) {
      targets.push(...OBJECT_KEYWORD_ALIASES[obj]);
    }
  }

  // Direct noun phrases
  const nounPatterns = [
    /\b(webhook|api|endpoint|backend|service|database|schema|migration)\b/gi,
    /\b(ui|frontend|interface|component|screen|page|checkout)\b/gi,
    /\b(runtime|application|app|process|memory|performance|crash|leak|hang|worker|gateway)\b/gi,
    /\b(build|compile|bundle|ci|pipeline|artifact|dependency)\b/gi,
    /\b(network|http|request|response|connection|timeout)\b/gi,
    /\b(auth|authentication|authorization|login|token|oauth|jwt|session|permission)\b/gi,
    /\b(dependency|package|library|framework|version|react native|database driver)\b/gi,
    /\b(release|package|artifact|version|changelog|publish)\b/gi,
    /\b(deployment|container|docker|kubernetes|environment|infrastructure|staging|canary)\b/gi,
    /\b(data|business rule|business logic|schema|model|entity)\b/gi,
    /\b(implementation|feature|code|changes|work|task)\b/gi,
    /\b(commit|file|staging|config changes)\b/gi,
    /\b(branch|feature branch|develop|main|master)\b/gi,
    /\b(architecture|system design|approved feature)\b/gi,
    /\b(regression matrix|qa matrix|quality matrix|risk matrix|scenario|coverage matrix)\b/gi,
    /\b(test|automated test|unit test|integration test|e2e|regression test)\b/gi,
    /\b(security|vulnerability|threat|exploit|encryption|oauth callback|penetration)\b/gi,
    /\b(null token|null-token|auth bypass|login crash)\b/gi,
    /\b(flaky test|intermittent 502|connection refused|memory leak|unclosed stream|circuit breaker)\b/gi,
  ];

  for (const pattern of nounPatterns) {
    const matches = lower.match(pattern);
    if (matches) {
      targets.push(...matches.map(m => m.toLowerCase()));
    }
  }

  // Deduplicate
  return [...new Set(targets)];
}

// Object keyword aliases for mapping keyword categories to target nouns
const OBJECT_KEYWORD_ALIASES = {
  'repository': ['repository', 'codebase', 'project'],
  'backend': ['backend', 'server', 'service', 'database', 'schema', 'migration', 'api service', 'backend service', 'payment service'],
  'api': ['api', 'endpoint', 'rest', 'graphql', 'webhook', 'webhooks', 'api contract'],
  'ui': ['ui', 'frontend', 'interface', 'component', 'screen', 'page', 'view', 'layout', 'checkout'],
  'runtime': ['runtime', 'application', 'app', 'process', 'memory', 'performance', 'crash', 'leak', 'hang', 'worker', 'gateway', '502'],
  'build': ['build', 'compile', 'bundle', 'ci', 'pipeline', 'artifact', 'dependency', 'ci failure', 'build failure'],
  'network': ['network', 'http', 'request', 'response', 'api call', 'connection', 'timeout', 'intermittent 502', 'connection refused'],
  'state': ['state', 'store', 'cache', 'session', 'localstorage', 'redux', 'context'],
  'auth': ['auth', 'authentication', 'authorization', 'login', 'token', 'oauth', 'jwt', 'session', 'permission', 'auth bypass', 'null token', 'null-token'],
  'dependency': ['dependency', 'package', 'library', 'framework', 'version', 'upgrade', 'migration', 'react native', 'database driver', 'db driver'],
  'release': ['release', 'package', 'artifact', 'build', 'version', 'changelog', 'publish', 'release artifact', 'v2.3.0', 'v2'],
  'deployment': ['deployment', 'container', 'docker', 'kubernetes', 'ci', 'cd', 'pipeline', 'environment', 'infrastructure', 'staging', 'canary config', 'rollout plan', 'deploy script', 'rollback'],
  'container': ['container', 'docker', 'image', 'kubernetes', 'pod'],
  'data': ['data', 'business rule', 'business logic', 'schema', 'model', 'entity', 'partial refund'],
  'implementation': ['implementation', 'feature', 'code', 'changes', 'work', 'task', 'interrupted implementation', 'interrupted feature work'],
  'commit': ['commit', 'change', 'file', 'staging', 'committed', 'config changes'],
  'branch': ['branch', 'feature branch', 'develop', 'main', 'master'],
  'architecture': ['architecture', 'architectural', 'system design', 'high level', 'approved feature'],
};

/**
 * Score phases from keyword signals.
 * 
 * @param {Map} keywordSignals
 * @param {string} text
 * @returns {Object<string, number>}
 */
function scorePhases(keywordSignals, text) {
  const scores = {};
  for (const [phase, data] of keywordSignals.entries()) {
    if (PHASE_KEYWORDS[phase]) {
      scores[phase] = data.count * 5;
    }
  }
  return scores;
}

/**
 * Boost score based on segment authority of verb/target matches.
 * 
 * @param {string} verb
 * @param {string} target
 * @param {Array} segments
 * @returns {number}
 */
function getSegmentAuthorityBoost(verb, target, segments) {
  let boost = 0;
  for (const segment of segments) {
    if (segment.kind === 'DIRECT_INSTRUCTION') {
      if (segment.text.toLowerCase().includes(verb.toLowerCase())) boost += 10;
      if (target && segment.text.toLowerCase().includes(target.toLowerCase())) boost += 5;
    } else if (segment.kind === 'INLINE_CODE' || segment.kind === 'FENCED_CODE') {
      // Code content should not boost action ownership
      if (segment.text.toLowerCase().includes(verb.toLowerCase())) boost -= 5;
    }
  }
  return boost;
}

/**
 * Select best candidate and resolve phase/action.
 * 
 * @param {IntentCandidate[]} candidates
 * @param {Object} keywordSignals
 * @param {string} directText
 * @returns {{phase: string, action: string, object: string, confidence: number}}
 */
export function resolvePhaseAction(candidates, keywordSignals, directText) {
  // Top candidate
  const top = candidates[0];
  if (!top) {
    return { phase: 'implementation', action: 'implement', object: 'repository', confidence: 0 };
  }

  let { phase, action, object, score, evidence } = top;

  // Phase-specific action defaults
  const phaseActionDefaults = {
    discovery: ['understand', 'investigate', 'assess'],
    definition: ['define', 'assess', 'review'],
    planning: ['plan', 'define', 'review'],
    design: ['design', 'review', 'modify'],
    implementation: ['implement', 'modify', 'fix', 'upgrade'],
    diagnosis: ['investigate', 'reproduce', 'isolate', 'fix'],
    verification: ['test', 'review', 'assess'],
    delivery: ['assess', 'release', 'review'],
    operations: ['deploy', 'modify', 'assess', 'review'],
    recovery: ['recover', 'investigate'],
    repository: ['git', 'modify', 'review'],
  };

  // If action is null, pick from phase defaults based on keyword signals
  if (!action) {
    const allowed = phaseActionDefaults[phase] || ['implement', 'modify', 'fix'];
    // Find best matching action from signals
    for (const a of allowed) {
      if (keywordSignals.has(a)) {
        action = a;
        break;
      }
    }
    action = action || allowed[0];
  }

  // If object is null, use keyword signal best match
  if (!object || object === 'repository') {
    const objSignals = keywordSignals.get ? keywordSignals : new Map();
    if (objSignals.size > 0) {
      object = findBestMatch(objSignals, 'repository');
    }
  }

  // Confidence based on score margin
  const secondScore = candidates[1]?.score || 0;
  const margin = score - secondScore;
  let confidence = 'medium';
  if (margin >= 30 || score >= 90) confidence = 'high';
  else if (margin < 10 && score < 50) confidence = 'low';

  return { phase, action, object, confidence, margin, topScore: score };
}

function findBestMatch(found, defaultValue) {
  if (found.size === 0) return defaultValue;
  let best = null;
  let bestScore = -1;
  for (const [category, data] of found.entries()) {
    if (data.count > bestScore) {
      bestScore = data.count;
      best = category;
    }
  }
  return best ?? defaultValue;
}
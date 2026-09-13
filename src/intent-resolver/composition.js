/**
 * Action Candidate Composition — verb-target binding with provenance
 * 
 * Replaces global keyword-bag phase/action resolution with
 * compositional verb + governed target from authoritative segments.
 */

import { SEGMENT_KINDS, SEGMENT_AUTHORITY } from './segments.js';
import { lower, extractKeywords, PHASE_KEYWORDS, ACTION_KEYWORDS, OBJECT_KEYWORDS, hasReadinessPattern, isStagingDeploy } from './signals.js';

/**
 * Verb families — generalized, not fixture-specific.
 * Keys are canonical action names.
 */
export const VERB_FAMILIES = Object.freeze({
  understand: ['explain', 'describe', 'summarize', 'trace', 'walk through', 'walk me through', 'how does', 'what does', 'explore', 'map', 'identify', 'clarify', 'determine', 'look at', 'look', 'examine'],
  assess: ['assess', 'review', 'inspect', 'audit', 'validate', 'verify', 'check', 'evaluate', 'evaluation', 'threat model', 'security audit', 'security review'],
  plan: ['plan', 'prepare', 'strategy', 'outline', 'sketch', 'roadmap', 'scope', 'breakdown', 'estimate', 'define', 'set up', 'configure'],
  design: ['design', 'layout', 'wireframe', 'mockup', 'prototype', 'ui', 'ux'],
  implement: ['implement', 'build', 'create', 'add', 'write', 'update', 'modify', 'refactor'],
  fix: ['fix', 'repair', 'resolve', 'patch', 'correct'],
  test: ['test', 'run test', 'execute test', 'write test', 'add test', 'create test', 'regression test', 'add regression test', 'write regression test', 'regression matrix',
    // Generalized test-authoring: plural and coverage forms compose the same capability.
    // Bare nouns ('unit tests', 'coverage') are NOT verbs — only authoring-verb + test-target.
    'write tests', 'add tests', 'create tests', 'author tests',
    'write unit tests', 'add unit tests', 'create unit tests', 'author unit tests',
    'write integration tests', 'add integration tests', 'create integration tests', 'author integration tests',
    'write regression tests', 'add regression tests', 'create regression tests', 'author regression tests',
    'write contract tests', 'add contract tests', 'create contract tests',
    'add unit coverage', 'add regression coverage', 'add integration coverage',
    'create unit coverage', 'write unit coverage'],
  quality: ['create matrix', 'define scenarios', 'quality assessment', 'map qa', 'map scenarios', 'qa matrix', 'quality matrix', 'risk matrix', 'coverage matrix', 'test matrix', 'qa regression matrix'],
  upgrade: ['upgrade', 'migrate', 'bump dependency', 'framework upgrade', 'dependency upgrade', 'update dependency'],
  deploy: ['deploy', 'push to', 'roll out', 'promote', 'scale', 'rotate', 'restart', 'blue-green'],
  investigate: ['investigate', 'debug', 'diagnose', 'troubleshoot', 'crash', 'crashes', 'crashing', 'fail', 'fails', 'failing', 'error', 'broken', 'bug', 'issue', 'problem', 'reproduce', 'isolate', 'find cause', 'determine cause', 'find the cause', 'locate cause', 'trace failure',
    // Generalized diagnostic investigation: unknown-cause + explicit investigation language.
    // Bare verbs ('find', 'determine', 'identify', 'trace') are NOT included — only
    // cause-bound compositions grant investigation authority.
    'find the root cause', 'find root cause',
    'determine the cause', 'determine the root cause', 'determine the underlying cause', 'determine the underlying reason',
    'identify the cause', 'identify what is causing', 'identify the source', 'identify the reason',
    'trace the source', 'trace what is causing', 'trace the cause',
    'establish why', 'establish the cause',
    'what is causing', 'what caused'],
  recover: ['recover', 'reconstruct', 'resume', 'replay', 'restore'],
  git: ['commit', 'merge', 'rebase', 'cherry-pick', 'push', 'stage', 'branch'],
  doc: ['update docs', 'update documentation', 'write docs', 'write documentation', 'add docs', 'add documentation', 'create docs', 'create documentation', 'document'],
  // Release verbs come last so score ties keep favoring incumbent families;
  // readiness assessments ("ready to publish") still resolve via assess first.
  release: ['release', 'ship', 'publish', 'deliver', 'handoff'],
});

/**
 * Target patterns for binding verbs to governed targets.
 * These are semantic target categories, not exhaustive noun lists.
 */
const TARGET_PATTERNS = Object.freeze([
  // Deployment/operations
  { pattern: /\b(canary\s+(readiness|release|deploy|deployment|rollout|promotion))\b/i, category: 'deployment', actionHint: 'deploy' },
  { pattern: /\b(staged\s+(rollout|deploy|deployment|release|promotion))\b/i, category: 'deployment', actionHint: 'deploy' },
  { pattern: /\b(production\s+(deploy|deployment|release|promotion|environment|promote))\b/i, category: 'deployment', actionHint: 'deploy' },
  { pattern: /\b(live\s+(environment|deploy|deployment|promote|promotion))\b/i, category: 'deployment', actionHint: 'deploy' },
  { pattern: /\b(rollout\s+(plan|strategy|readiness|promotion))\b/i, category: 'deployment', actionHint: 'deploy' },
  { pattern: /\b(rollback\s+(plan|strategy|cause|failure))\b/i, category: 'deployment', actionHint: 'plan' },
  { pattern: /\b(deploy\s+(script|config|configuration|manifest|template))\b/i, category: 'deployment', actionHint: 'deploy' },
  { pattern: /\b(helm\s+(template|chart|release|deploy|upgrade|apply))\b/i, category: 'deployment', actionHint: 'deploy' },
  { pattern: /\b(pulumi\s+(update|preview|deploy|plan|apply))\b/i, category: 'deployment', actionHint: 'deploy' },
  { pattern: /\b(terraform\s+(plan|apply|deploy|destroy|output))\b/i, category: 'deployment', actionHint: 'deploy' },
  { pattern: /\b(kubernetes|k8s|kubectl)\b/i, category: 'deployment', actionHint: 'deploy' },

  // Security/auth
  { pattern: /\b(auth(entication|orization)?\s+(weakness|vulnerability|bypass|issue|flaw|implementation|review|audit))\b/i, category: 'auth', actionHint: 'review' },
  { pattern: /\b(authorization\s+(weakness|vulnerability|policy|review|audit))\b/i, category: 'auth', actionHint: 'review' },
  { pattern: /\b(api\s+gateway\s+(authorization|auth|weakness|review|audit))\b/i, category: 'auth', actionHint: 'review' },
  { pattern: /\b(security\s+(review|audit|assessment|weakness|vulnerability|threat))\b/i, category: 'auth', actionHint: 'assess' },

  // Infrastructure
  { pattern: /\b(infrastructure\s+(security|review|audit|weakness|as\s+code))\b/i, category: 'deployment', actionHint: 'review' },
  { pattern: /\b(cluster\s+(health|upgrade|scale|deploy|config))\b/i, category: 'deployment', actionHint: 'deploy' },

  // Code/implementation
  { pattern: /\b(auth\s+(implementation|bug|fix|patch|mapper|token|login|oauth))\b/i, category: 'auth', actionHint: 'fix' },
  { pattern: /\b(webhook\s+(signature|verification|handler|retry|circuit\s+breaker))\b/i, category: 'api', actionHint: 'implement' },
  { pattern: /\b(idempotenc(y|ies)\s+(key|handler))\b/i, category: 'api', actionHint: 'implement' },
  { pattern: /\b(feature\s+flag)\b/i, category: 'implementation', actionHint: 'implement' },
  { pattern: /\b(migration\s+(test|tests|script|plan|strategy))\b/i, category: 'dependency', actionHint: 'test' },
  { pattern: /\b(database\s+(driver|migration|upgrade|schema))\b/i, category: 'dependency', actionHint: 'upgrade' },
  { pattern: /\b(dependency\s+(upgrade|update|migration))\b/i, category: 'dependency', actionHint: 'upgrade' },
  { pattern: /\b(framework\s+upgrade)\b/i, category: 'dependency', actionHint: 'upgrade' },
  { pattern: /\b(react\s+native\s+(upgrade|migration))\b/i, category: 'dependency', actionHint: 'upgrade' },

  // Testing/QA
  { pattern: /\b((regression|integration|unit|e2e|automated|contract|smoke|migration)\s+tests?)\b/i, category: 'backend', actionHint: 'test' },
  { pattern: /\b((regression|integration|unit|e2e|automated|contract|smoke|migration)\s+suite)\b/i, category: 'repository', actionHint: 'test' },
  { pattern: /\b((unit|regression|integration)\s+coverage)\b/i, category: 'backend', actionHint: 'test' },
  { pattern: /\b(test\s+(coverage|suite|cases|case|matrix|scenarios))\b/i, category: 'repository', actionHint: 'test' },
  { pattern: /\b(qa\s+(matrix|scenarios|matrix))\b/i, category: 'repository', actionHint: 'test' },
  { pattern: /\b(quality\s+(matrix|assessment))\b/i, category: 'repository', actionHint: 'test' },
  { pattern: /\b(risk\s+(matrix|coverage|coverage))\b/i, category: 'repository', actionHint: 'test' },
  { pattern: /\b(coverage\s+matrix)\b/i, category: 'repository', actionHint: 'test' },

  // Readiness/release
  { pattern: /\b(release\s+readiness|readiness\s+(for|to)\s+(release|publish|ship|deploy))\b/i, category: 'release', actionHint: 'assess' },
  { pattern: /\b(ready\s+to\s+(release|publish|ship|deploy))\b/i, category: 'release', actionHint: 'assess' },
  { pattern: /\b(package\s+(artifact|release|version|readiness))\b/i, category: 'release', actionHint: 'assess' },
  { pattern: /\b(version\s+(bump|release|publish))\b/i, category: 'release', actionHint: 'release' },

  // Diagnosis/investigation
  { pattern: /\b(root\s+cause|why\s+(did|does|is)|what\s+(caused|is\s+causing)|find\s+(the\s+)?(root\s+)?cause)\b/i, category: 'runtime', actionHint: 'investigate' },
  { pattern: /\b(memory\s+leak|connection\s+refused|intermittent\s+\d+|flaky\s+(test|connection))\b/i, category: 'runtime', actionHint: 'investigate' },
  { pattern: /\b(console\s+(says|logs|output|error)|logs?\s+(say|contain|show))\b/i, category: 'runtime', actionHint: 'investigate' },

  // Documentation
  { pattern: /\b(document\s+(rollback|strategy|plan|procedure|api|spec))\b/i, category: 'data', actionHint: 'plan' },
  { pattern: /\b(requirements?\s+(document|spec|specification|missing|undefined))\b/i, category: 'data', actionHint: 'define' },
  { pattern: /\b(developer\s+docs?|dev\s+docs?|api\s+docs?|technical\s+docs?|update\s+docs?|write\s+docs?|add\s+docs?)\b/i, category: 'documentation', actionHint: 'doc' },
  { pattern: /\b(documentation\s+(update|write|add|create|generate))\b/i, category: 'documentation', actionHint: 'doc' },

  // CI/CD/Build
  { pattern: /\b(ci\s+(failure|error|build|pipeline|config))\b/i, category: 'build', actionHint: 'investigate' },
  { pattern: /\b(build\s+(failure|error|config|pipeline|script))\b/i, category: 'build', actionHint: 'investigate' },
  { pattern: /\b(pipeline\s+(config|failure|error|deploy|promote))\b/i, category: 'deployment', actionHint: 'deploy' },

  // General fallbacks by noun category
  { pattern: /\b(api|endpoint|rest|graphql|webhook)\b/i, category: 'api' },
  { pattern: /\b(ui|frontend|interface|component|screen|page|checkout)\b/i, category: 'ui' },
  { pattern: /\b(backend|server|service|database|schema|migration|payment)\b/i, category: 'backend' },
  { pattern: /\b(runtime|application|app|process|memory|performance|crash|leak|hang|worker|gateway)\b/i, category: 'runtime' },
  { pattern: /\b(build|compile|bundle|ci|pipeline|artifact|dependency)\b/i, category: 'build' },
  { pattern: /\b(network|http|request|response|connection|timeout)\b/i, category: 'network' },
  { pattern: /\b(auth|authentication|authorization|login|token|oauth|jwt|session|permission)\b/i, category: 'auth' },
  { pattern: /\b(dependency|package|library|framework|version|react native|database driver)\b/i, category: 'dependency' },
  { pattern: /\b(release|package|artifact|version|changelog|publish)\b/i, category: 'release' },
  { pattern: /\b(deployment|container|docker|kubernetes|environment|infrastructure|staging|canary)\b/i, category: 'deployment' },
  { pattern: /\b(data|business rule|business logic|schema|model|entity)\b/i, category: 'data' },
  { pattern: /\b(implementation|feature|code|changes|work|task)\b/i, category: 'implementation' },
  { pattern: /\b(commit|file|staging|config changes)\b/i, category: 'commit' },
  { pattern: /\b(branch|feature branch|develop|main|master)\b/i, category: 'branch' },
  { pattern: /\b(architecture|system design|approved feature)\b/i, category: 'architecture' },
]);

/**
 * Segments eligible for action ownership.
 */
const OWNERSHIP_ELIGIBLE_KINDS = new Set([
  'DIRECT_INSTRUCTION',
  'SECONDARY_INSTRUCTION',
]);

/**
 * Coordination relationship between segments.
 * SECONDARY_INSTRUCTION is explicitly coordinated with preceding DIRECT_INSTRUCTION.
 * Multiple DIRECT_INSTRUCTION segments are independent unless linked by conjunction.
 */
function getCoordinationGroup(segment, allSegments) {
  // SECONDARY_INSTRUCTION is coordinated with the most recent DIRECT_INSTRUCTION before it
  if (segment.kind === 'SECONDARY_INSTRUCTION') {
    for (let i = segment.index - 1; i >= 0; i--) {
      if (allSegments[i].kind === 'DIRECT_INSTRUCTION') {
        return allSegments[i].index; // Group ID = the DIRECT_INSTRUCTION segment index
      }
    }
    return segment.index; // Fallback: own group
  }
  // DIRECT_INSTRUCTION forms its own group unless it's part of a multi-segment coordinated request
  return segment.index;
}

/**
 * Check if two segments belong to the same coordinated request group.
 */
function areInSameCoordinationGroup(segmentA, segmentB, allSegments) {
  const groupA = getCoordinationGroup(segmentA, allSegments);
  const groupB = getCoordinationGroup(segmentB, allSegments);
  return groupA === groupB;
}

/**
 * Detect negation in a text span around a keyword.
 * @param {string} text - Text to check
 * @param {string} keyword - Keyword to check negation for
 * @param {number} window - Characters before keyword to check (default 50)
 * @returns {boolean}
*/

function detectNegation(text, keyword, window = 50) {
  const lowerText = text.toLowerCase();
  const lowerKeyword = keyword.toLowerCase();
  const idx = lowerText.indexOf(lowerKeyword);
  if (idx === -1) return false;
  const start = Math.max(0, idx - window);
  // Include the keyword itself in the check window so patterns like "don't <verb>" can match
  const context = lowerText.slice(start, idx + lowerKeyword.length);
  
  // Check the immediate context (last 30 chars including keyword) for these patterns
  const immediateContext = lowerText.slice(Math.max(0, idx - 30), idx + lowerKeyword.length);
  
  // Common negation patterns that apply to the keyword directly
  // Must be immediately before the keyword (within a few words) with proper structure
  // "don't identify", "do not identify", "never identify", "without identifying", etc.
  // NOT "are not defined" -> "identify" (false positive)
  // NOT "is not known" -> "known" (false positive - state description, not negated command)
  
  // First check: is "not" preceded by a copula/state verb? If so, it's descriptive, not imperative
  const copulaBeforeNot = /(?:is|are|was|were|be|been|being|has|have|had)\s+not\b/i.test(immediateContext);
  if (copulaBeforeNot) {
    // "is not known", "are not defined", "was not implemented" - these are state descriptions
    return false;
  }
  
  // Check for "don't <verb>", "do not <verb>", "never <verb>", "not <verb>" where <verb> is the keyword
  // The negation word must be immediately followed by the keyword (allowing for "to" or nothing)
  const negationBeforeVerbPatterns = [
    new RegExp(`don't\\s+${lowerKeyword}\\b`),
    new RegExp(`do not\\s+${lowerKeyword}\\b`),
    new RegExp(`never\\s+${lowerKeyword}\\b`),
    new RegExp(`not\\s+${lowerKeyword}\\b`),
    new RegExp(`not\\s+to\\s+${lowerKeyword}\\b`),
    new RegExp(`without\\s+${lowerKeyword}\\b`),
    new RegExp(`without\\s+${lowerKeyword}ing\\b`), // without identifying
    new RegExp(`avoid\\s+${lowerKeyword}ing\\b`),
    new RegExp(`skip\\s+${lowerKeyword}ing\\b`),
    new RegExp(`exclude\\s+${lowerKeyword}ing\\b`),
    new RegExp(`prevent\\s+${lowerKeyword}ing\\b`),
    new RegExp(`prohibit\\s+${lowerKeyword}ing\\b`),
    new RegExp(`no\\s+${lowerKeyword}ing\\b`),
  ];
  
  for (const pattern of negationBeforeVerbPatterns) {
    if (pattern.test(immediateContext)) {
      return true;
    }
  }
  
  // Also check for "no <noun>" patterns where noun might be related but not the verb
  // These are more about the object than the action - be more conservative
  
  return false;
}
/**
 * Extract governed target from text using TARGET_PATTERNS.
 * Returns { target: string, category: string, actionHint: string } or null.
 */
function extractGovernedTarget(text) {
  const lowerText = lower(text);
  
  for (const { pattern, category, actionHint } of TARGET_PATTERNS) {
    const match = lowerText.match(pattern);
    if (match) {
      return {
        target: match[0],
        category,
        actionHint,
      };
    }
  }
  
  return null;
}

/**
 * Find target in context segments for a verb from a specific segment.
 * Searches same segment first, then other segments by authority + proximity.
 * Prefers segments that appear AFTER the verb segment (forward binding).
 */
function findTargetForVerb(verbSegment, allSegments) {
  // 1. Check same segment for target (using pre-extracted segment.target if available)
  if (verbSegment.target) {
    // Also try to get category/actionHint from TARGET_PATTERNS for this target
    const sameSegmentTarget = extractGovernedTarget(verbSegment.text);
    if (sameSegmentTarget) return sameSegmentTarget;
    // Fallback: just use the pre-extracted target
    return { target: verbSegment.target, category: null, actionHint: null };
  }
  const sameSegmentTarget = extractGovernedTarget(verbSegment.text);
  if (sameSegmentTarget) return sameSegmentTarget;
  
  // 2. Check other segments by authority (higher first), then by proximity with forward bias
  const otherSegments = allSegments
    .filter(s => s.index !== verbSegment.index)
    .map(s => ({
      ...s,
      proximity: Math.abs(s.index - verbSegment.index),
      isAfter: s.index > verbSegment.index
    }))
    .sort((a, b) => {
      // Primary: authority descending
      if (b.authority !== a.authority) return b.authority - a.authority;
      // Secondary: prefer segments that come AFTER the verb segment
      if (a.isAfter !== b.isAfter) return a.isAfter ? -1 : 1;
      // Tertiary: proximity ascending (closer segments first)
      return a.proximity - b.proximity;
    });
  
  for (const segment of otherSegments) {
    // First try pre-extracted segment.target
    if (segment.target) {
      const targetInfo = extractGovernedTarget(segment.text);
      if (targetInfo) return targetInfo;
      return { target: segment.target, category: null, actionHint: null };
    }
    const target = extractGovernedTarget(segment.text);
    if (target) return target;
  }
  
  // 3. Fallback: extract any noun from context segments
  const contextText = allSegments
    .filter(s => s.authority >= 1 && s.index !== verbSegment.index)
    .map(s => s.text)
    .join(' ');
  
  if (contextText) {
    const fallbackTarget = extractGovernedTarget(contextText);
    if (fallbackTarget) return fallbackTarget;
  }
  
  return null;
}

/**
 * Weak execution verbs carry NO capability alone (perform/conduct/carry out).
 * With a governed capability target they compose into the target's capability:
 * security assessment/review/audit → assess, compatibility review → assess,
 * compatibility/regression/unit/integration testing → test.
 * Review-headed capability targets (accessibility review, API contract review)
 * compose into review; assessment/audit/validation-headed targets compose into
 * assess. Word-boundary matching keeps substrings ('performance') from firing.
 */
const WEAK_VERB_HEAD = /\b(perform(?:s|ed|ing)?|conduct(?:s|ed|ing)?|carr(?:y|ies)\s+out|carried\s+out|carrying\s+out)\b/i;
const WEAK_VERB_TARGET = /\b(security\s+(?:assessment|review|audit)|compatibility\s+(?:review|assessment|audit|testing|tests?|test)|regression\s+(?:testing|tests?|test)|(?:unit|integration|e2e|contract|automated)\s+(?:testing|tests?|test)|accessibility\s+(?:review|audit|assessment)|(?:api\s+contract|contract)\s+review|migration\s+(?:validation|assessment)|(?:upgrade|migration))\b/i;

function weakVerbTargetAction(targetText) {
  const lowerTarget = lower(targetText);
  if (/\b(testing|tests?)\b/i.test(lowerTarget)) return 'test';
  // Review-headed capability targets name the review capability itself, except
  // security-headed ones which stay security assessments (existing behavior).
  if (/\breview\b/i.test(lowerTarget) && !/\bsecurity\b/i.test(lowerTarget)) return 'review';
  // Bare upgrade/migration targets name the upgrade capability ("perform the
  // upgrade"); assessment-headed forms stay assessments.
  if (/\b(assessment|audit|validation)\b/i.test(lowerTarget)) return 'assess';
  if (/\b(upgrade|migration)\b/i.test(lowerTarget)) return 'upgrade';
  return 'assess';
}

/**
 * Extract weak-verb + governed-target compositions from a text span.
 * Returns array of { verb, action, targetText }.
 */
function extractWeakVerbCompositions(text) {
  const results = [];
  const headRegex = new RegExp(WEAK_VERB_HEAD.source, 'gi');
  let match;
  while ((match = headRegex.exec(text)) !== null) {
    const window = text.slice(match.index, match.index + match[0].length + 80);
    const targetMatch = window.match(WEAK_VERB_TARGET);
    if (targetMatch) {
      results.push({
        verb: `${match[0].toLowerCase()} ${targetMatch[0].toLowerCase()}`,
        headVerb: match[0].toLowerCase(),
        action: weakVerbTargetAction(targetMatch[0]),
        targetText: targetMatch[0],
        index: match.index,
      });
    }
  }
  return results;
}

/**
 * Test-execution verbs carry test capability ONLY with a governed test target
 * (suite/tests/matrix/cases). Bare "run"/"execute" never manufacture authority:
 * "run the server" and "execute the migration" yield no candidate, while
 * "run the integration suite" composes into test execution (read-only — the
 * execution semantics, not test-authoring local-write).
 */
const EXEC_VERB_HEAD = /\b(run(?:s|ning)?|ran|execut(?:e|es|ed|ing)|rerun(?:s|ning)?|exercis(?:e|es|ed|ing))\b/i;
const EXEC_TEST_TARGET = /\b((?:regression|integration|unit|e2e|automated|contract|smoke|migration)\s+(?:tests?|suite)|(?:regression|integration|unit|e2e|automated|contract|smoke|migration)?\s*test\s+suite|tests?\s+suite|test\s+(?:matrix|cases?))\b/i;

/**
 * Extract execution-verb + governed-test-target compositions from a text span.
 * Returns array of { verb, headVerb, action, targetText, index }.
 */
function extractExecVerbCompositions(text) {
  const results = [];
  const headRegex = new RegExp(EXEC_VERB_HEAD.source, 'gi');
  let match;
  while ((match = headRegex.exec(text)) !== null) {
    const window = text.slice(match.index, match.index + match[0].length + 80);
    const targetMatch = window.match(EXEC_TEST_TARGET);
    if (targetMatch) {
      results.push({
        verb: `${match[0].toLowerCase()} ${targetMatch[0].toLowerCase()}`,
        headVerb: match[0].toLowerCase(),
        action: 'test',
        targetText: targetMatch[0],
        index: match.index,
      });
    }
  }
  return results;
}

/**
 * Determiner-headed nominalizations ("the invoice authorization check", "this
 * patch", "the driver upgrade") and build artifact-noun phrases ("build
 * output") use action words as nouns. Stripping them lets verb-role checks
 * (verb extraction, review-guard exclusions) ignore noun uses without losing
 * genuinely verbal uses elsewhere in the span.
 */
const NOMINAL_NP_SOURCE = '\\b(?:the|a|an|this|that|these|those)\\b(?:\\s+[a-z][a-z0-9_-]*){0,3}\\s+(?:check|verification|validation|upgrade|patch|release)\\b';
const BUILD_NOUN_PHRASE_SOURCE = '\\bbuild\\s+(?:artifact|artifacts|output|outputs|binary|binaries|log|logs|number|numbers|status|report|results?)\\b';

function stripNominalNouns(text) {
  return text
    .replace(new RegExp(NOMINAL_NP_SOURCE, 'gi'), ' ')
    .replace(new RegExp(BUILD_NOUN_PHRASE_SOURCE, 'gi'), ' ');
}
function extractAllVerbs(text) {
  const lowerText = lower(text);
  const results = [];
  
  // Try multi-word verbs first (more specific)
  for (const [action, verbs] of Object.entries(VERB_FAMILIES)) {
    for (const verb of verbs) {
      if (verb.includes(' ')) {
        if (lowerText.includes(verb)) {
          results.push({ verb, action });
        }
      }
    }
  }
  
  // Then single-word verbs with context-aware matching
  for (const [action, verbs] of Object.entries(VERB_FAMILIES)) {
    for (const verb of verbs) {
      if (!verb.includes(' ')) {
        // Special handling for "test" - avoid matching in noun phrases like "integration test", "unit test", etc.
        if (verb === 'test') {
          // Match "test" only when not preceded by test-type adjectives
          // Negative lookbehind for: integration, unit, e2e, regression, automated, smoke, contract, migration, functional, load, performance, stress, penetration, security, api, ui, component, snapshot
          const testTypeAdjectives = '(?:integration|unit|e2e|regression|automated|smoke|contract|migration|functional|load|performance|stress|penetration|security|api|ui|component|snapshot|end.to.end)';
          const regex = new RegExp(`(?<!${testTypeAdjectives}\\s)\\btest\\b`, 'i');
          if (regex.test(lowerText)) {
            results.push({ verb, action });
          }
        }
        // Special handling for "stage" - avoid matching in noun phrases like "test stage", "build stage", "deploy stage"
        else if (verb === 'stage') {
          const stageTypeAdjectives = '(?:test|build|deploy|release|staging|production)';
          const regex = new RegExp(`(?<!${stageTypeAdjectives}\\s)\\bstage\\b`, 'i');
          if (regex.test(lowerText)) {
            results.push({ verb, action });
          }
        }
        // Special handling for "build" - avoid matching in noun phrases like "last build", "next build", "failed build",
        // and in artifact-noun phrases like "build artifact", "build output" where
        // "build" is a noun modifier, not the requested action ("build the artifact"
        // keeps its verbal force because the governed noun is a determiner phrase).
        else if (verb === 'build') {
          const buildContextAdjectives = '(?:last|next|previous|failed|successful|recent|current|daily|nightly|ci|pipeline)';
          const buildNounFollowers = '(?:artifact|artifacts|output|outputs|binary|binaries|log|logs|number|numbers|status|report|results?)';
          const regex = new RegExp(`(?<!${buildContextAdjectives}\\s)\\bbuild\\b(?!\\s+${buildNounFollowers}\\b)`, 'i');
          if (regex.test(lowerText)) {
            results.push({ verb, action });
          }
        }
        // Special handling for nominalized verbs - determiner-headed noun phrases
        // ("the invoice authorization check", "this patch", "the driver upgrade")
        // use these words as nouns, not requested actions. Strip nominal
        // occurrences so a genuinely verbal use elsewhere in the same span
        // still counts.
        else if (['check', 'verification', 'validation', 'upgrade', 'patch', 'release'].includes(verb)) {
          const stripped = stripNominalNouns(lowerText);
          const regex = new RegExp(`\\b${verb}\\b`, 'i');
          if (regex.test(stripped)) {
            results.push({ verb, action });
          }
        }
        else {
          const regex = new RegExp(`\\b${verb}\\b`, 'i');
          if (regex.test(lowerText)) {
            results.push({ verb, action });
          }
        }
      }
    }
  }
  
  return results;
}

/**
 * Create action candidates from segments.
 * Only ownership-eligible segments (DIRECT_INSTRUCTION, SECONDARY_INSTRUCTION) produce candidates.
 */
export function extractActionCandidates(segments) {
  const candidates = [];
  
  for (const segment of segments) {
    // Only ownership-eligible segments can produce action candidates
    if (!OWNERSHIP_ELIGIBLE_KINDS.has(segment.kind)) continue;
    
    // Extract all verbs from this segment
    const verbs = extractAllVerbs(segment.text);

    // Weak-verb + governed-target compositions (perform/conduct/carry out add
    // no capability alone; the governed target supplies it).
    for (const weak of extractWeakVerbCompositions(segment.text)) {
      if (detectNegation(segment.text, weak.headVerb)) continue;
      verbs.push({ verb: weak.verb, action: weak.action });
    }

    // Execution-verb + governed-test-target compositions (run/execute/rerun
    // grant test capability only with a strong test target).
    for (const exec of extractExecVerbCompositions(segment.text)) {
      if (detectNegation(segment.text, exec.headVerb)) continue;
      verbs.push({ verb: exec.verb, action: exec.action });
    }

    for (const verbInfo of verbs) {
      // Check if this specific verb is negated in the segment
      if (detectNegation(segment.text, verbInfo.verb)) continue;
      
      // Find governed target
      const targetInfo = findTargetForVerb(segment, segments);
      
      // Determine phase from action
      const phase = actionToPhase(verbInfo.action);
      
      // Calculate base score from authority
      const baseScore = segment.authority * 10;
      
      // Bonus for verb-target match in same segment
      const sameSegmentBonus = targetInfo && targetInfo.target && segment.text.toLowerCase().includes(targetInfo.target.toLowerCase()) ? 15 : 0;
      
      // Bonus for actionHint matching verb action
      const actionHintBonus = targetInfo && targetInfo.actionHint === verbInfo.action ? 10 : 0;
      
      // Specificity bonus (multi-word verbs are more specific)
      const specificityBonus = verbInfo.verb.includes(' ') ? 5 : 0;
      
      const candidate = {
        verb: verbInfo.verb,
        action: verbInfo.action,
        target: targetInfo?.target || null,
        targetCategory: targetInfo?.category || null,
        actionHint: targetInfo?.actionHint || null,
        provenance: {
          segmentIndex: segment.index,
          segmentKind: segment.kind,
          authority: segment.authority,
          polarity: segment.polarity,
          negated: segment.negated,
        },
        ownershipEligible: true,
        score: baseScore + sameSegmentBonus + actionHintBonus + specificityBonus,
        phase,
      };
      
      candidates.push(candidate);
    }
  }
  
  // Sort by score descending, then by authority descending
  candidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return b.provenance.authority - a.provenance.authority;
  });
  
  return candidates;
}

/**
 * Map action to phase.
 */
function actionToPhase(action) {
  const actionPhaseMap = {
    understand: 'discovery',
    assess: 'verification',
    plan: 'planning',
    design: 'design',
    implement: 'implementation',
    fix: 'implementation',
    test: 'verification',
    quality: 'verification',
    upgrade: 'implementation',
    deploy: 'operations',
    investigate: 'diagnosis',
    recover: 'recovery',
    git: 'repository',
    release: 'delivery',
  };
  return actionPhaseMap[action] || 'discovery';
}

/**
 * Compose primary action from candidates.
 * Uses provenance precedence: DIRECT_INSTRUCTION > SECONDARY_INSTRUCTION
 * Also uses coordination groups for cross-segment logical requests.
 */
export function composePrimaryAction(candidates, contextText = '', allSegments = []) {
  // Generalized diagnostic investigation: unknown cause + explicit diagnostic
  // investigation language → diagnose, read-only. Runs before the empty-candidate
  // fallback so cause-bound verbs that yield no family match still resolve.
  // Known cause + requested repair falls through to the fix path below.
  // The verb + why/what-causes complement ("find why X happens", "figure out
  // why X fails", "work out what causes X") is cause-bound investigation even
  // when no other diagnostic noun is present. Bare "find" alone never fires.
  const hasDiagnosticInvestigation = /\b(find the root cause|find root cause|determine the (root |underlying )?(cause|reason)|identify (the (cause|source|reason)|what is causing)|trace (the (source|cause)|what is causing)|establish why|what (caused|is causing)|why (did|does|is))\b/i.test(contextText)
    || /\b(diagnos(?:e|es|ed|ing)?|investigates?|investigating|debug(?:s|ged|ging)?|troubleshoot(?:s|ed|ing)?|find(?:s|ing)?|determine[sd]?|determining|figure(?:s|d)?\s+out|work(?:s|ed|ing)?\s+out|identif(?:y|ies|ied|ying)|trac(?:e|es|ed|ing)?|establish(?:es|ed|ing)?)\b[^.?!]{0,60}\b(why|what\s+causes)\b/i.test(contextText);
  const hasKnownCauseWithRepair = /\b(known cause|cause is (known|confirmed)|confirmed (root cause|cause)|already know|i know the|the cause is)\b/i.test(contextText)
    && /\b(fix|repair|resolve|patch|correct|implement|build)\b/i.test(contextText);
  if (hasDiagnosticInvestigation && !hasKnownCauseWithRepair) {
    return {
      phase: 'diagnosis',
      action: 'investigate',
      confidence: 'high',
      source: 'diagnostic-investigation',
    };
  }

  // Special case: "is not known" / "are not defined" for business rules/requirements -> definition/define
  // This handles state descriptions like "The business rule for partial refunds is not known yet"
  // These are not negated commands but state-of-knowledge assertions requiring definition work
  if (candidates.length === 0 && /\b(is|are)\s+not\s+(known|defined)\b/i.test(contextText) && /\b(business rules?|business logic|requirements?)\b/i.test(contextText)) {
    return {
      phase: 'definition',
      action: 'define',
      confidence: 'high',
      source: 'unknown-requirements',
    };
  }
  
  // Special case: readiness assessment with no verb-family candidate.
  // A readiness assessment names its own authority even when the action must
  // come from a noun phrase ("the build artifact") rather than a verb.
  if (candidates.length === 0 && hasReadinessPattern(contextText)) {
    return {
      phase: 'delivery',
      action: 'assess',
      confidence: 'high',
      source: 'readiness-pattern',
    };
  }

  if (candidates.length === 0) {
    // Safe fallback: no ownership-eligible candidate -> non-mutating discovery/assess
    // Does NOT grant implementation authority
    return { phase: 'discovery', action: 'assess', confidence: 'low', source: 'fallback' };
  }
  
  // Separate by provenance kind
  const directCandidates = candidates.filter(c => c.provenance.segmentKind === 'DIRECT_INSTRUCTION');
  const secondaryCandidates = candidates.filter(c => c.provenance.segmentKind === 'SECONDARY_INSTRUCTION');
  
  // Prefer DIRECT_INSTRUCTION
  let primary = null;
  let source = '';
  
  if (directCandidates.length > 0) {
    primary = directCandidates[0];
    source = 'direct';
  } else if (secondaryCandidates.length > 0) {
    primary = secondaryCandidates[0];
    source = 'secondary';
  } else {
    primary = candidates[0];
    source = 'fallback';
  }

  // Governing/supporting precedence: a supporting-step verb (fix/assess over a
  // workflow byproduct such as conflicts or health) must not displace the
  // governing workflow verb that opens the same instruction ("rebase ...
  // resolve conflicts", "deploy ... verify health"). The governing verb must
  // head the segment; a mid-sentence workflow noun ("fix the deploy script")
  // never counts as governing. Standalone supporting steps with no governing
  // verb ("resolve the merge conflicts") keep their own authority.
  if (primary.action === 'fix' || primary.action === 'assess') {
    const primarySegment = allSegments.find((s) => s.index === primary.provenance.segmentIndex);
    const segmentText = primarySegment ? primarySegment.text : '';
    const hasSupportingTarget = /\bconflicts?\b/i.test(segmentText)
      || /\bhealth(\s+checks?|\s+endpoint)?\b/i.test(segmentText);
    const hasGoverningHead = /^\s*(please\s+|kindly\s+)?(rebase|cherry-pick|merge|deploy|roll\s*out|rollout|recover|reconstruct|resume|upgrade|migrate|push)\b/i.test(segmentText);
    if (hasSupportingTarget && hasGoverningHead) {
      const governing = candidates.find((c) =>
        (c.action === 'git' || c.action === 'deploy' || c.action === 'recover' || c.action === 'upgrade') &&
        c.provenance.segmentIndex === primary.provenance.segmentIndex);
      if (governing) {
        primary = governing;
        source = 'governing-workflow';
      }
    }
  }
  
  // (readiness assessment with no verb-family candidate handled above,
  // before the empty-candidate fallback)

  // Special case: readiness patterns override to delivery/assess
  if (hasReadinessPattern(contextText) && primary.action !== 'deploy') {
    return {
      phase: 'delivery',
      action: 'assess',
      confidence: 'high',
      source: 'readiness-pattern',
      originalAction: primary.action,
      originalPhase: primary.phase,
    };
  }

  // Special case: staging deploy
  if (primary.action === 'deploy' && isStagingDeploy(contextText)) {
    return {
      phase: 'operations',
      action: 'deploy',
      confidence: 'high',
      source: 'staging-deploy',
    };
  }
  
  // Special case: production deploy
  if (primary.action === 'deploy' && /\b(production|prod|live)\b/i.test(contextText) && !isStagingDeploy(contextText)) {
    return {
      phase: 'operations',
      action: 'deploy',
      confidence: 'high',
      source: 'production-deploy',
    };
  }
  
  // Special case: threat model/security audit
  // But NOT when there's also an explicit implementation verb in the same text (not negated)
  const hasImplementationVerb = /\b(implement|build|create|add|develop|write|fix|modify|update|refactor|patch)\b/i.test(contextText);
  // Check if any implementation verb is negated
  const negatedImplVerbs = ['implement', 'build', 'create', 'add', 'develop', 'write', 'fix', 'modify', 'update', 'refactor', 'patch'];
  let hasNegatedImplVerb = false;
  for (const verb of negatedImplVerbs) {
    if (detectNegation(contextText, verb)) {
      hasNegatedImplVerb = true;
      break;
    }
  }
  // Only skip security-audit if there's a non-negated implementation verb
  // If impl verb exists but is negated (don't patch), still treat as audit-only -> discovery
  // An audit verb governing a threat target ("audit ... for hijack risks") is a
  // security assessment even without the adjacent "security audit" compound.
  const hasAuditThreatTarget = /\baudit\b/i.test(contextText)
    && /\b(hijack|hijacking|hijacked|breach|vulnerabilit|threat|exploit|attack|compromise)\b/i.test(contextText);
  if ((/\b(threat model|threat-model|security audit|security review|audit security)\b/i.test(contextText) || hasAuditThreatTarget) && (!hasImplementationVerb || hasNegatedImplVerb)) {
    return {
      phase: 'discovery',
      action: 'assess',
      confidence: 'high',
      source: 'security-audit',
    };
}

  // Special case: "is not known" / "are not defined" for business rules/requirements -> definition/define
  // This handles state descriptions like "The business rule for partial refunds is not known yet"
  // These are not negated commands but state-of-knowledge assertions requiring definition work
  if (candidates.length === 0 && /\b(is|are)\s+not\s+(known|defined)\b/i.test(contextText) && /\b(business rules?|business logic|requirements?)\b/i.test(contextText)) {
    return {
      phase: 'definition',
      action: 'define',
      confidence: 'high',
      source: 'unknown-requirements',
    };
  }
  
  // Special case: identify/define requirements/business rules -> definition/define
  // This handles "identify missing business rules", "define requirements", "define billing rules", etc.
  if ((primary.action === 'understand' || primary.action === 'plan') && /\b(identify|define|gather)\b/i.test(contextText) && /\b(requirements?|business rules?|business logic|billing rules?)\b/i.test(contextText)) {
    return {
      phase: 'definition',
      action: 'define',
      confidence: 'high',
      source: 'identify-requirements',
    };
  }
  
  // Special case: upgrade with regression tests -> implement (primary work is implementing the upgrade)
  // Check if both upgrade and test verbs exist in candidates from the same COORDINATION GROUP
  // (DIRECT_INSTRUCTION + its coordinated SECONDARY_INSTRUCTION)
  const hasUpgradeInGroup = candidates.some(c => 
    c.action === 'upgrade' && 
    areInSameCoordinationGroup(
      { index: c.provenance.segmentIndex, kind: c.provenance.segmentKind },
      { index: primary.provenance.segmentIndex, kind: primary.provenance.segmentKind },
      allSegments
    )
  );
  
  if (hasUpgradeInGroup && /\b(regression test|add|write)\s+(automated\s+)?(integration\s+|unit\s+|e2e\s+|regression\s+|functional\s+|contract\s+|smoke\s+|migration\s+)?tests?\b/i.test(contextText)) {
    return {
      phase: 'implementation',
      action: 'implement',
      confidence: 'high',
      source: 'upgrade-with-tests',
      originalAction: primary.action,
      originalPhase: primary.phase,
    };
  }
  
  // Special case: explicit security review alongside implement -> implementation (not discovery)
  // When "security review" appears as a secondary concern alongside "implement"
  if (primary.action === 'assess' && /\bsecurity review\b/i.test(contextText) && hasImplementationVerb) {
    // Find the implement candidate
    const implementCandidate = candidates.find(c => c.action === 'implement');
    if (implementCandidate) {
      return {
        phase: 'implementation',
        action: 'implement',
        confidence: 'high',
        source: 'implement-with-security-review',
        originalAction: primary.action,
        originalPhase: primary.phase,
      };
    }
  }
  
  // Special case: upgrade with security audit -> implementation (upgrade is primary work)
  // When both upgrade and security audit candidates exist, upgrade is the primary work
  if (primary.action === 'assess' && /\bsecurity audit\b/i.test(contextText)) {
    const upgradeCandidate = candidates.find(c => c.action === 'upgrade');
    if (upgradeCandidate) {
      return {
        phase: 'implementation',
        action: 'implement',
        confidence: 'high',
        source: 'upgrade-with-security-audit',
        originalAction: 'upgrade',  // The actual primary work is the upgrade
        originalPhase: primary.phase,
      };
    }
  }

  // Special case: "set up blue-green deployment" -> operations/deploy
  // When "set up" or "configure" appears with "blue-green" or "canary" deployment
  if (primary.action === 'plan' && /\b(set up|configure|prepare)\b/i.test(contextText) && 
      /\b(blue.green|canary)\s+(deployment|deploy|rollout)\b/i.test(contextText)) {
    return {
      phase: 'operations',
      action: 'deploy',
      confidence: 'high',
      source: 'setup-deployment-strategy',
    };
  }
  
  // Special case: explicit review without implement
  // The exclusion tests verb-role, not raw text: nominalized action nouns
  // ("this patch", "the driver upgrade") must not block review ownership.
  if (primary.action === 'assess' && /\b(review|audit|code review|pr review)\b/i.test(contextText) &&
      !/\b(implement|build|create|add|develop|write|fix|modify|update|refactor|patch)\b/i.test(stripNominalNouns(contextText))) {
    return {
      phase: 'verification',
      action: 'review',
      confidence: 'high',
      source: 'explicit-review',
      originalAction: primary.action,
      originalPhase: primary.phase,
    };
  }
  
  // Special case: prepare/planning without execution
  if (primary.action === 'plan' && /\b(only|do not|don't|without)\b/i.test(contextText) &&
      /\b(deploy|implement|execute|run|rollout)\b/i.test(contextText)) {
    return {
      phase: 'planning',
      action: 'plan',
      confidence: 'high',
      source: 'planning-without-execution',
    };
  }
  
  // Special case: recover interrupted implementation - prefer recover over understand
  // When both recover and understand candidates exist from same segment with "interrupted"
  const recoverCandidate = candidates.find(c => c.action === 'recover');
  const understandCandidate = candidates.find(c => c.action === 'understand');
  if (recoverCandidate && understandCandidate && 
      recoverCandidate.provenance.segmentIndex === understandCandidate.provenance.segmentIndex &&
      /\binterrupted\b/i.test(contextText)) {
    return {
      phase: 'recovery',
      action: 'recover',
      confidence: 'high',
      source: 'recover-interrupted',
      originalAction: understandCandidate.action,
      originalPhase: understandCandidate.phase,
    };
  }
  
  // Special case: test-authoring ("write/add/create/author tests|coverage") without
  // implementation -> verification/test. The noun "test" alone never reaches here
  // (no authoring verb means no test candidate); diagnostic/repair/review verbs
  // own their candidates, so those contexts keep their semantics.
  const testCandidate = candidates.find(c => c.action === 'test');
  const implementCandidate = candidates.find(c => c.action === 'implement');
  const hasTestAuthoring = /\b(write|add|create|author)\s+(automated\s+)?(regression|unit|integration|e2e|contract|smoke|migration)\s+tests?\b/i.test(contextText)
    || /\b(add|create|write|author)\s+(unit|regression|integration)\s+coverage\b/i.test(contextText);
  if (testCandidate && implementCandidate && ['write', 'add', 'create', 'author'].includes(implementCandidate.verb) &&
      hasTestAuthoring &&
      !/\b(implement|build|upgrade|migrate|fix|modify|change|update|refactor|patch|feature|functionality)\b/i.test(contextText)) {
    // Only test verb, no implementation intent -> keep test/verification
    return {
      phase: 'verification',
      action: 'test',
      confidence: 'high',
      source: 'write-tests-only',
      originalAction: implementCandidate.action,
      originalPhase: implementCandidate.phase,
    };
  }
  
  // Special case: implement with tests -> implementation (not verification/test)
  // When both implement and test candidates exist from the same segment, and implement is present
  // (but only if not the write-tests-only case above)
  if (implementCandidate && testCandidate && implementCandidate.provenance.segmentIndex === testCandidate.provenance.segmentIndex) {
    // Check if there's explicit test language alongside implement
    const hasTestLanguage = /\b(regression tests?|unit tests?|integration tests?|e2e tests?|automated tests?|add tests?|write tests?)\b/i.test(contextText);
    const hasWriteTestsPattern = /\b(write|add|create|author)\s+(automated\s+)?(regression|unit|integration|e2e|contract|smoke|migration)\s+tests?\b/i.test(contextText)
      || /\b(add|create|write|author)\s+(unit|regression|integration)\s+coverage\b/i.test(contextText);
    // Check if implement verb is negated
    const negatedImplVerbs = ['implement', 'build', 'create', 'add', 'write', 'fix', 'modify', 'update', 'refactor', 'patch'];
    let hasNegatedImplVerb = false;
    for (const verb of negatedImplVerbs) {
      if (detectNegation(contextText, verb)) {
        hasNegatedImplVerb = true;
        break;
      }
    }
    if (hasTestLanguage && !hasWriteTestsPattern && !hasNegatedImplVerb) {
      return {
        phase: 'implementation',
        action: 'implement',
        confidence: 'high',
        source: 'implement-with-tests',
        originalAction: 'implement',  // The actual primary work is implement
        originalPhase: testCandidate.phase,
      };
    }
  }
  
  // Special case: known-cause fix (check all candidates, not just primary)
  // If there's a fix candidate and known-cause language, promote fix over investigate
  const fixCandidate = candidates.find(c => c.action === 'fix');
  if (fixCandidate && /\b(known cause|root cause is (known|confirmed)|cause is (known|confirmed)|already know|i know the)\b/i.test(contextText)) {
    return {
      phase: 'implementation',
      action: 'fix',
      confidence: 'high',
      source: 'known-cause-fix',
    };
  }
  
  // Special case: find-root-cause
  if (/\b(find the root cause|find root cause|determine the (root )?cause|what (caused|is causing)|why (did|does|is))\b/i.test(contextText)) {
    return {
      phase: 'diagnosis',
      action: 'investigate',
      confidence: 'high',
      source: 'find-root-cause',
    };
  }
  
  // Special case: CI/build failure investigation
  if (primary.action === 'investigate' && /\b(ci|build)\b/i.test(contextText) && /\b(fail|failure|error|broken)\b/i.test(contextText)) {
    return {
      phase: 'diagnosis',
      action: 'investigate',
      confidence: 'high',
      source: 'ci-failure-investigation',
    };
  }
  
  // Special case: intermittent/flaky
  if (primary.action === 'investigate' && /\b(intermittent|flaky)\b/i.test(contextText) && !/\bcheck\b.*\bflaky\s+test\b/i.test(contextText)) {
    return {
      phase: 'diagnosis',
      action: 'investigate',
      confidence: 'high',
      source: 'intermittent-flaky',
    };
  }
  
  // Special case: upgrade without tests
  if (primary.action === 'upgrade' && !/\b(test|regression test|add test|write test)\b/i.test(contextText)) {
    return {
      phase: 'implementation',
      action: 'upgrade',
      confidence: 'high',
      source: 'upgrade-no-tests',
    };
  }
  
  // Special case: rollback in planning
  if (primary.action === 'plan' && /\brollback\b/i.test(contextText) && /\b(migration|plan|planning)\b/i.test(contextText)) {
    return {
      phase: 'planning',
      action: 'plan',
      confidence: 'high',
      source: 'rollback-planning',
    };
  }
  
  // Special case: deploy (not negated, not plan)
  if (primary.action === 'deploy' && !/\bno\s+deploy|don't\s+deploy|do not\s+deploy|without\s+deploy|plan|planning|prepare|steps\b/i.test(contextText)) {
    return {
      phase: 'operations',
      action: 'deploy',
      confidence: 'high',
      source: 'deploy-execution',
    };
  }
  
  // Special case: git operations without implement
  if (primary.action === 'git' && !/\b(implement|build|create|add|develop|write|fix|modify|update|refactor|patch)\b/i.test(contextText)) {
    return {
      phase: 'repository',
      action: 'git',
      confidence: 'high',
      source: 'git-operations',
    };
  }
  
  // Special case: recover without git
  if (primary.action === 'recover' && !/\b(commit|push|merge|rebase|branch|stage)\b/i.test(contextText) &&
      !/\bgit\b/i.test(contextText) && !/\breplay\b/i.test(contextText)) {
    return {
      phase: 'recovery',
      action: 'recover',
      confidence: 'high',
      source: 'recover-no-git',
    };
  }
  
  // Default: use composed phase/action
  const confidence = primary.score >= 50 ? 'high' : primary.score >= 25 ? 'medium' : 'low';
  
  return {
    phase: primary.phase,
    action: primary.action,
    confidence,
    source: 'composed',
    candidate: primary,
  };
}

/**
 * Legacy-compatible phase resolution using composition.
 * Can be used as replacement or validation.
 */
export function resolvePhaseFromComposition(candidates, contextText) {
  const composed = composePrimaryAction(candidates, contextText);
  return composed.phase;
}

export function resolveActionFromComposition(candidates, contextText) {
  const composed = composePrimaryAction(candidates, contextText);
  return composed.action;
}

/**
 * Get composition debug info.
 */
export function getCompositionDebug(candidates, contextText) {
  return {
    candidateCount: candidates.length,
    directCount: candidates.filter(c => c.provenance.segmentKind === 'DIRECT_INSTRUCTION').length,
    secondaryCount: candidates.filter(c => c.provenance.segmentKind === 'SECONDARY_INSTRUCTION').length,
    topCandidates: candidates.slice(0, 3).map(c => ({
      verb: c.verb,
      action: c.action,
      target: c.target,
      targetCategory: c.targetCategory,
      score: c.score,
      kind: c.provenance.segmentKind,
      authority: c.provenance.authority,
    })),
    composed: composePrimaryAction(candidates, contextText),
  };
}
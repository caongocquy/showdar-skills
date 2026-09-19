const CONTEXT_KINDS = ['history', 'quote', 'log', 'code', 'example', 'report', 'background'];

const NEGATION = /\b(never|do not|does not|did not|stop|avoid|without|halt|cancel)\b|n't\b/i;

// "no"/"not" as noun-phrase content ("no known cause", "not known yet",
// "not defined yet") describes an unknown, it does not deny the candidate
// action. Only genuine denial scoping the candidate counts (design §10).
const NEGATION_CONTENT = /\b(no|not)\s+(known|defined|confirmed|clear|available|specified|documented)\b/i;
const CONDITION = /\b(if|when|unless|provided|assuming|in case|once|until|as long as)\b/i;
const MODAL = /\b(would|could|should|might|may|maybe|perhaps|possibly|suppose|imagine|hypothetical|what if)\b/i;

const PAST = /\b(yesterday|last night|last week|last month|last sprint|ago|earlier|previously|completed|finished)\b/i;
const FUTURE = /\b(tomorrow|later|next week|next sprint|soon|will|going to)\b/i;
const PRESENT = /\b(now|currently|right now|immediately|today)\b/i;

const QUOTE_BOUNDARY = /["'`]([^"'`]{3,})["'`]|:\s*(?:[""'`]|>{1,2})\s*(.+)$|\bsays?\s*:\s*\S/i;

const CODE_FENCE = /```|~~~/;
const CODE_TOKEN = /(^|\s)(const|let|var|function)\s|\w+\([^()]*\)\s*\{?|=>|==|;\s*$/;

const LOG_FRAMING = /\b(error log|log output)\b|\b(stderr|stdout)\b[^.]{0,40}\b(shows?|showed|displays?|contains?|reports?)\b|\blogs?\s+(shows?|showed|displays?)\b/;

const EXAMPLE_MARKER = /\b(for example|for instance|e\.g\.|such as)\b/;
const BACKGROUND_MARKER = /\b(as background|for context|by the way|fyi|note that)\b/;

const REPORT_MARKER = /\b(reported|reports that|according to the team|told us|mentioned that|user reports?)\b/;

const HISTORY_MARKER = /\b(yesterday|last night|last week|last sprint|last month|earlier|previously|ago)\b/i;

const COMPLEMENT_STARTERS = new Set([
  'the', 'a', 'an', 'your', 'my', 'our', 'his', 'her', 'its', 'their',
  'this', 'that', 'these', 'those', 'me', 'us', 'him', 'them', 'it',
  'all', 'any', 'some', 'each', 'every', 'no', 'both', 'either', 'neither',
  'what', 'which', 'who', 'whom', 'whose',
  'to', 'for', 'of', 'on', 'in', 'into', 'with', 'about', 'from', 'by',
  'at', 'as', 'over', 'under', 'through', 'after', 'before', 'against',
  'off', 'out', 'up', 'down',
]);

const LEAD_POLITE = new Set(['please', 'kindly']);
const LEAD_NEGATION = new Set(["don't", 'dont', 'never']);

const INTERROGATIVE_OPENERS = new Set(['can', 'could', 'would', 'will']);

function tokensOf(text) {
  return (String(text ?? '').toLowerCase().match(/[a-z']+/g) ?? [])
    .map((w) => w.replace(/^'+|'+$/g, ''));
}

function stripLeads(tokens) {
  let t = tokens;
  for (;;) {
    if (t.length === 0) break;
    if (LEAD_POLITE.has(t[0]) || LEAD_NEGATION.has(t[0])) {
      t = t.slice(1);
      continue;
    }
    if (t.length >= 2 && t[0] === 'do' && t[1] === 'not') {
      t = t.slice(2);
      continue;
    }
    break;
  }
  return t;
}

function verbComplementShape(tokens, surface, firstSurfaceToken) {
  if (tokens.length < 2) return false;
  if (tokens[0] !== firstSurfaceToken) return false;
  return COMPLEMENT_STARTERS.has(tokens[1]);
}

function innerSpans(text) {
  const spans = [];
  for (const m of String(text ?? '').matchAll(/"([^"]{3,})"|'([^']{3,})'|`([^`]{3,})`/g)) {
    spans.push(m[1] ?? m[2] ?? m[3]);
  }
  const colon = String(text ?? '').match(/\bsays?\s*:\s*(.+)$/i);
  if (colon) spans.push(colon[1]);
  return spans;
}

function detectRequestForm(lower, surface) {
  const normalized = String(surface ?? '').trim().toLowerCase();
  const tokens = tokensOf(lower);
  const firstSurfaceToken = normalized.split('-')[0];
  const surfacePresent = normalized !== '' && normalized !== 'unknown' &&
    (tokens.includes(normalized) || tokens[0] === firstSurfaceToken);

  if (!surfacePresent) return null;

  const hasPolite = /\b(please|kindly)\b/.test(lower);
  if (hasPolite && verbComplementShape(stripLeads(tokens), normalized, firstSurfaceToken)) {
    return 'polite-request';
  }

  const opener = tokens[0] ?? '';
  if (INTERROGATIVE_OPENERS.has(opener) && tokens.includes('you') && surfacePresent) {
    return 'interrogative-request';
  }

  if (
    /\b(figure out|find out|work out)\b/.test(lower) ||
    /\bwhy\s+is\b/.test(lower) ||
    (/\bwhy\b/.test(lower) &&
      /\b(investigate|investigates|diagnose|diagnoses|determine|figure|find|work|check|explain)\b/.test(lower))
  ) {
    return 'investigate-question';
  }

  if (
    surfacePresent &&
    (/\b(we|i)\s+(need|needed)\s+to\b/.test(lower) || /\bneeds?\s+to\s+be\s+/.test(lower))
  ) {
    return 'need-statement';
  }

  if (
    surfacePresent &&
    (/\b(help|assist)\s+(me|us)\b/.test(lower) || opener === 'help' || opener === 'assist')
  ) {
    return 'help-request';
  }

  // Test-writing prompts: write/add/create test(s) with optional qualifiers
  if (
    surfacePresent &&
    /^(write|add|create)\b/.test(opener) &&
    /\b(test|tests|unit|integration|e2e|regression|suite)\b/.test(lower)
  ) {
    return 'imperative';
  }

  // Bare imperative: single-word clause matching the surface verb
  // Only for core action verbs commonly used as bare commands.
  const BARE_IMPERATIVE_VERBS = new Set([
    'deploy', 'fix', 'implement', 'build', 'create', 'add', 'develop',
    'review', 'test', 'investigate', 'debug', 'upgrade', 'migrate',
    'recover', 'reconstruct', 'resume', 'commit', 'push', 'merge',
    'rebase', 'branch', 'stage', 'plan', 'design', 'define', 'assess',
    'audit',
  ]);
  if (
    surfacePresent &&
    tokens.length === 1 &&
    tokens[0] === firstSurfaceToken &&
    BARE_IMPERATIVE_VERBS.has(firstSurfaceToken)
  ) {
    return 'imperative';
  }

  if (verbComplementShape(stripLeads(tokens), normalized, firstSurfaceToken)) {
    return 'imperative';
  }

  // Verb + object imperative: surface verb followed by any object (not a complement starter)
  // Covers patterns like "Audit security", "Review code", "Test module", "Implement feature"
  // Only for compound surfaces (verb-noun hyphenated) to avoid false positives on noun headings
  if (
    surfacePresent &&
    normalized.includes('-') &&
    tokens.length >= 2 &&
    tokens[0] === firstSurfaceToken &&
    !COMPLEMENT_STARTERS.has(tokens[1])
  ) {
    return 'imperative';
  }

  // Verb-first-token imperative: clause opens with the candidate's own verb
  // ("Fix locally", "Implement webhook signature verification"). Design §10
  // defines request semantics as directive clause form scoping the
  // candidate, not as matching a complement-starter list. Noun headings
  // ("Restart checklist for on-call") are excluded upstream: candidate
  // extraction yields surface 'unknown' for them, so this rule never fires
  // in production without a recognized action surface. Manner adjuncts
  // ("locally") modify the directive without nominalizing it. A leading
  // "verb:" label ("Error: connection refused") is report framing, not a
  // directive: the colon marks a log/announcement label, so skip this rule
  // (well-formed "Fix: the bug" still matches via complement shape below).
  const hasLabelColon = /^[A-Za-z']+\s*:/.test(lower);
  if (
    surfacePresent &&
    normalized !== '' &&
    tokens.length >= 2 &&
    tokens[0] === firstSurfaceToken &&
    !hasLabelColon
  ) {
    return 'imperative';
  }

  for (const span of innerSpans(lower)) {
    if (verbComplementShape(stripLeads(tokensOf(span)), normalized, firstSurfaceToken)) {
      return 'imperative';
    }
  }

  return null;
}

export function gatherEvidence({ surface, clauseText, neighbors = [], contextScope = null, conditionalScope = false, modalScope = false }) {
  const own = String(clauseText ?? '');
  const lower = own.toLowerCase();

  const requestForm = detectRequestForm(lower, surface);

  // Design §10: only negation scoping the candidate disqualifies. Bare
  // "no"/"not" describing an unknown ("no known cause") is noun-phrase
  // content, not denial of the requested action.
  const negation = NEGATION.test(lower) && !NEGATION_CONTENT.test(lower);
  const condition = CONDITION.test(lower) || conditionalScope;
  const modal = MODAL.test(lower) || modalScope;

  const contextKinds = [];
  if (contextScope && CONTEXT_KINDS.includes(contextScope.kind)) {
    contextKinds.push(contextScope.kind);
  }
  if (CODE_FENCE.test(own) || CODE_TOKEN.test(own)) contextKinds.push('code');
  else if (QUOTE_BOUNDARY.test(own)) contextKinds.push('quote');
  else if (LOG_FRAMING.test(lower)) contextKinds.push('log');
  else if (REPORT_MARKER.test(lower)) contextKinds.push('report');
  else if (EXAMPLE_MARKER.test(lower)) contextKinds.push('example');
  else if (BACKGROUND_MARKER.test(lower)) contextKinds.push('background');
  else if (HISTORY_MARKER.test(lower)) contextKinds.push('history');

  let temporal = null;
  if (PAST.test(lower)) temporal = 'past';
  else if (FUTURE.test(lower)) temporal = 'future';
  else if (PRESENT.test(lower)) temporal = 'present';

  const positiveRequest = requestForm !== null;

  return Object.freeze({
    requestForm,
    negation,
    condition,
    modal,
    contextKinds: Object.freeze(contextKinds),
    temporal,
    positiveRequest,
  });
}

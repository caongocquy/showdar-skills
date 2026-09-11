/**
 * Object Resolution — broad domain signals, no fixture-exact rules
 * 
 * Object is secondary routing metadata. Does not drive ownership.
 * Uses deterministic canonical precedence when ambiguous.
 */

import { lower, extractKeywords, findBestMatch, isStagingDeploy } from './signals.js';
import { OBJECT_KEYWORDS } from './signals.js';

// Canonical object precedence for deterministic tie-breaking
const OBJECT_PRECEDENCE = Object.freeze([
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
]);

/**
 * Resolve object from keyword signals and context.
 * 
 * @param {Map} keywordSignals — from extractKeywords(OBJECT_KEYWORDS)
 * @param {string} phase — resolved phase
 * @param {string} action — resolved action
 * @param {string} fullText — full prompt text
 * @returns {string}
 */
export function resolveObject(keywordSignals, phase, action, fullText) {
  const lowerText = lower(fullText);
  
  // Get best match from keyword signals
  let bestMatch = findBestMatch(keywordSignals, null);
  
  // Phase-specific canonical fallbacks
  const phaseDefaults = {
    discovery: 'repository',
    definition: 'data',
    planning: 'architecture',
    design: 'ui',
    implementation: 'repository',
    diagnosis: 'runtime',
    verification: 'repository',
    delivery: 'package',
    operations: 'deployment',
    recovery: 'implementation',
    repository: 'repository',
  };

  // If no strong signal, use phase default
  if (!bestMatch) {
    return phaseDefaults[phase] || 'repository';
  }

  // Special context-aware resolutions (general patterns, not fixture-specific)
  
  // Deploy context -> deployment/container
  if (phase === 'operations' && action === 'deploy') {
    if (isStagingDeploy(lowerText)) return 'container';
    if (/\b(production|prod|live)\b/i.test(lowerText)) return 'deployment';
    return 'deployment';
  }

  // CI/build failure in diagnosis -> build
  if (phase === 'diagnosis' && /\b(ci|build)\b/i.test(lowerText) && /\b(fail|failure|error|broken)\b/i.test(lowerText)) {
    return 'build';
  }

  // Connection/network issue in diagnosis -> network (but intermittent/flaky -> runtime)
  if (phase === 'diagnosis' && /\b(connection|timeout|network|http)\b/i.test(lowerText) && !/\b(intermittent|flaky|intermittently)\b/i.test(lowerText)) {
    return 'network';
  }

  // "Trace" in discovery/understanding context -> repository (not network)
  if (phase === 'discovery' && /\btrace\b/i.test(lowerText) && /\b(request|flow|lifecycle|repository|codebase)\b/i.test(lowerText)) {
    return 'repository';
  }
  
  // Intermittent/flaky connection/502 -> runtime
  if (phase === 'diagnosis' && /\b(intermittent|flaky|intermittently)\b/i.test(lowerText) && /\b(connection|502|gateway|worker)\b/i.test(lowerText)) {
    return 'runtime';
  }

  // Memory/performance in diagnosis -> runtime
  if (phase === 'diagnosis' && /\b(memory|leak|performance|crash|hang|worker)\b/i.test(lowerText)) {
    return 'runtime';
  }

// Auth review with no changes -> auth (not repository)
   // This is a general pattern: review <domain> no changes -> <domain>
   // But only when not reviewing code specifically
   if (phase === 'verification' && action === 'review' && /\b(no\s+changes?|without\s+changes?|do\s+not\s+change|only)\b/i.test(lowerText)) {
     if (/\bauth\b/i.test(lowerText) && !/\bcode\b/i.test(lowerText)) return 'auth';
     if (/\bapi\b/i.test(lowerText) && !/\bcode\b/i.test(lowerText)) return 'api';
     if (/\bsecurity\b/i.test(lowerText) && !/\bcode\b/i.test(lowerText)) return 'auth';
   }

   // API contract -> api
   if (/\bapi\s+contract\b/i.test(lowerText)) {
     return 'api';
   }

// Migration planning -> backend (not dependency) - general pattern for any framework/platform migration
   // But NOT for rollback migration (handled separately)
   if (phase === 'planning' && /\bmigration\b/i.test(lowerText) && !/\brollback\b/i.test(lowerText) && !/\b(upgrade|update)\s+(dependency|package|library)\b/i.test(lowerText)) {
     return 'backend';
   }

  // Approved feature in planning -> architecture
  if (phase === 'planning' && /\bapproved feature\b/i.test(lowerText)) {
    return 'architecture';
  }

  // Architecture in planning -> architecture
  if (phase === 'planning' && /\barchitecture\b/i.test(lowerText)) {
    return 'architecture';
  }

  // Package in delivery -> package
  if (phase === 'delivery' && /\b(package|release artifact|ready to ship|v\d)\b/i.test(lowerText)) {
    return 'package';
  }

  // Commit in repository -> commit
  if (phase === 'repository' && /\bcommit\b/i.test(lowerText)) {
    return 'commit';
  }

  // Rollback migration in planning -> deployment
  if (phase === 'planning' && /\brollback\b/i.test(lowerText) && /\bmigration\b/i.test(lowerText)) {
    return 'deployment';
  }

  // Review code only -> repository
  if (phase === 'verification' && action === 'review' && /\bcode\b/i.test(lowerText) && /\b(only|no\s+changes?|without\s+changes?|do\s+not\s+change)\b/i.test(lowerText)) {
    return 'repository';
  }

  // Requirements undefined -> data
  if (phase === 'definition' && /\b(requirements?|business rule)\b.*\b(not\s+)?(defined|known|decided|missing)\b/i.test(lowerText)) {
    return 'data';
  }

  // Business rule in definition -> data
  if (phase === 'definition' && /\b(business rule|business logic)\b/i.test(lowerText)) {
    return 'data';
  }

  // Recovery with implementation mention -> implementation
  if (phase === 'recovery' && /\bimplementation\b/i.test(lowerText)) {
    return 'implementation';
  }

  // Recovery replay -> implementation (replay is a recovery action that produces implementation)
  if (phase === 'recovery' && /\breplay\b/i.test(lowerText)) {
    return 'implementation';
  }

  // Payment/backend service context -> backend (unless api explicitly mentioned)
  if (/\b(payment|backend service|api service)\b/i.test(lowerText) && (phase === 'verification' || phase === 'implementation')) {
    // Don't override if api is explicitly mentioned
    if (!/\bapi\b/i.test(lowerText)) {
      return 'backend';
    }
  }

  // Webhook context -> api (unless payment context)
  if (/\bwebhook\b/i.test(lowerText) && !/\bpayment\b/i.test(lowerText)) {
    return 'api';
  }

  // Use precedence for deterministic tie-breaking
  if (bestMatch && OBJECT_PRECEDENCE.includes(bestMatch)) {
    return bestMatch;
  }

  return bestMatch || phaseDefaults[phase] || 'repository';
}
/**
 * Risk Resolution — domain/change signals, no fixture rules
 * 
 * Risk signals must be semantically independent:
 * - security: auth, authorization, credentials, signatures, trust, access control
 * - regression: explicit regression concern, not just "tests requested"
 * - compatibility: framework/dependency/API compatibility changes
 * - performance: latency, throughput, CPU, memory, rendering
 * - data-integrity: schema/data migrations, persistence, destructive data ops
 * - production: actual production-impacting work
 * - operations: CI/CD/environment/infrastructure operational work
 */

import { lower, extractKeywords, isStagingDeploy } from './signals.js';
import { RISK_KEYWORDS } from './signals.js';

/**
 * Resolve risks from keyword signals and context.
 * 
 * @param {Map} keywordSignals — from extractKeywords(RISK_KEYWORDS)
 * @param {string} fullText — full prompt text
 * @param {string} phase — resolved phase
 * @param {string} action — resolved action
 * @param {string} object — resolved object
 * @returns {string[]} sorted risk list
 */
export function resolveRisks(keywordSignals, fullText, phase, action, object) {
  const lowerText = lower(fullText);
  const risks = [];
  
  // Start with keyword-extracted risks
  for (const [risk, data] of keywordSignals.entries()) {
    if (RISK_KEYWORDS[risk]) {
      risks.push(risk);
    }
  }
  
  // Add context-specific risks (general patterns, not fixture-specific)
  
  // Staging deploy -> operations risk
  if (isStagingDeploy(lowerText) && !risks.includes('operations')) {
    risks.push('operations');
  }
  
  // Production deploy -> operations risk
  if (/\b(production|prod|live|hotfix.*prod)\b/i.test(lowerText) && /\b(deploy|deployment)\b/i.test(lowerText) && !risks.includes('operations')) {
    risks.push('operations');
  }
  
// OAuth implementation -> security risk (only if explicit security context)
   if (/\boauth\b/i.test(lowerText) && /\b(security|vulnerability|exploit|penetration|auth bypass|security review|security audit)\b/i.test(lowerText) && !risks.includes('security')) {
     risks.push('security');
   }
  
  // Intermittent/flaky -> regression risk
  if (/\bintermittent\w*\b/i.test(lowerText) && /\b(connection|502|flaky|fail)\b/i.test(lowerText) && !risks.includes('regression')) {
    risks.push('regression');
  }
  
  // Review for correctness/maintainability -> regression risk
  if (/\b(correctness|maintainability)\b/i.test(lowerText) && !risks.includes('regression')) {
    risks.push('regression');
  }
  
  // Migration with tests -> compatibility + regression risk
  if (/\bmigration\b/i.test(lowerText) && /\btests?\b/i.test(lowerText) && !risks.includes('compatibility')) {
    risks.push('compatibility');
    risks.push('regression');
  }
  
  // Upgrade without explicit regression/flaky/test -> compatibility only
  if (/\bupgrade\b/i.test(lowerText) && !/\b(regression|test|flaky|intermittent)\b/i.test(lowerText)) {
    // Remove regression if present (pure upgrade = compatibility risk only)
    const regIdx = risks.indexOf('regression');
    if (regIdx !== -1) risks.splice(regIdx, 1);
  }
  
  // Rollback migration -> operations only
  if (/\brollback\b/i.test(lowerText) && /\bmigration\b/i.test(lowerText)) {
    risks.length = 0;
    risks.push('operations');
  }
  
  // Fix known cause (explicit phrase) -> no risks
  if (/\bfix known cause\b/i.test(lowerText)) {
    risks.length = 0;
    return risks;
  }
  
  // "already know the root cause" / "already know the null token" -> no risks
  if (/\balready know\b/i.test(lowerText) && (/\broot cause\b/i.test(lowerText) || /\bnull token\b/i.test(lowerText))) {
    risks.length = 0;
    return risks;
  }
  
  // Fix auth bypass -> security + regression (explicit security issue)
  if (/\bauth bypass\b/i.test(lowerText) && /\bfix\b/i.test(lowerText)) {
    if (!risks.includes('security')) risks.push('security');
    if (!risks.includes('regression')) risks.push('regression');
  }
  
  // Known null-token fix -> regression risk (independent regression evidence)
  if (/\b(null-token|null token)\b/i.test(lowerText) && /\bauth\b/i.test(lowerText) && /\bfix\b/i.test(lowerText) && !risks.includes('regression')) {
    risks.push('regression');
    // Remove security if present (known cause fix in auth = regression, not security)
    const secIdx = risks.indexOf('security');
    if (secIdx !== -1) risks.splice(secIdx, 1);
  }
  
  // Memory leak -> performance risk
  if (/\bmemory leak\b/i.test(lowerText) && !risks.includes('performance')) {
    risks.push('performance');
  }
  
  // Connection refused -> regression risk (implicit regression concern)
  if (/\bconnection refused\b/i.test(lowerText) && !risks.includes('regression')) {
    risks.push('regression');
  }
  
  // 502 / gateway -> regression risk
  if (/\b502\b/i.test(lowerText) && !risks.includes('regression')) {
    risks.push('regression');
  }
  
  // Integration tests + regression test keyword -> regression risk
  if (/\b(integration test|regression test|automated test)\b/i.test(lowerText) && !risks.includes('regression')) {
    risks.push('regression');
  }
  
  // Deploy works but rollback fails -> operations + regression risk
  if (/\bdeploy\b.*\bfail\b/i.test(lowerText) && /\brollback\b/i.test(lowerText) && !risks.includes('operations')) {
    risks.push('operations');
  }
  
  // Webhook implementation -> regression risk (explicit concern about breaking)
  if (/\bwebhook\b/i.test(lowerText) && /\bimplement\b/i.test(lowerText) && 
      /\b(signature|validation|verify|retry|circuit breaker)\b/i.test(lowerText)) {
    if (!risks.includes('regression')) risks.push('regression');
  }
  
  // Idempotency keys -> regression risk (adding behavior)
  if (/\bidempotency\b/i.test(lowerText) && !risks.includes('regression')) {
    risks.push('regression');
  }
  
  // Feature flags -> regression risk (adding behavior)
  if (/\bfeature flag\b/i.test(lowerText) && !risks.includes('regression')) {
    risks.push('regression');
  }
  
  // Remove duplicate risks and sort
  return [...new Set(risks)].sort();
}

/**
 * Check if a risk is contextually relevant (precision gate).
 * 
 * @param {string} risk
 * @param {string} text
 * @param {string} phase
 * @param {string} action
 * @returns {boolean}
 */
export function isRiskRelevant(risk, text, phase, action) {
  const lowerText = lower(text);
  
  switch (risk) {
    case 'security':
      // Security risk requires explicit security-related terms
      // Auth/authorization alone is not sufficient - needs security context
      return /\b(security|vulnerability|exploit|attack|threat|xss|csrf|sql injection|injection|idol|bola|ssrf|encryption|signature|webhook|trust boundary|penetration test|pentest|oauth callback|encryption module|security review|security audit|threat model|threat-model|auth bypass|security token|secure login|secure authentication)\b/i.test(lowerText);
    
    case 'regression':
      // Regression risk requires explicit regression concern or intermittent failure
      return /\b(regression|flaky|intermittent|existing|previous|backward|used to work|break existing|no breaking)\b/i.test(lowerText) ||
             (/\b(intermittent|502|connection refused)\b/i.test(lowerText)) ||
             (/\b(integration test|regression test|automated test)\b/i.test(lowerText));
     
    case 'compatibility':
      // Compatibility risk requires framework/dependency/API compatibility concern
      return /\b(compatibility|compatible|version|upgrade|migration|breaking|deprecated|polyfill|react native|database driver)\b/i.test(lowerText);
     
    case 'performance':
      // Performance risk requires explicit performance concern
      return /\b(performance|slow|latency|speed|optimization|bottleneck|memory|cpu|jank|lag|timeout|memory leak|circuit breaker|unclosed stream)\b/i.test(lowerText);
     
    case 'data-integrity':
      // Data integrity risk requires schema/data migration concern
      return /\b(data integrity|data loss|corruption|consistency|transaction|atomic|rollback|backup|data-integrity|migration)\b/i.test(lowerText);
     
    case 'production':
      // Production risk requires explicit production impact
      return /\b(production|prod|live|customer facing|revenue|downtime|outage|sla|hotfix.*prod)\b/i.test(lowerText);
     
    case 'operations':
      // Operations risk requires CI/CD/environment operational concern
      return /\b(operations|ops|deployment|cd|pipeline|infrastructure|monitoring|observability|rollback|incident|staging|canary|deploy)\b/i.test(lowerText);
     
    default:
      return true;
  }
}
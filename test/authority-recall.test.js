// T13 AUTHORIZED_REQUEST_RECALL quality gate + false-positive safety.
// Development fixture labels are STATIC and authored from the approved design.
// Never derived from: adjudicator output, legacy resolver, route result, surface map, primary skill.
// Blind #6 exact prompt strings remain forbidden.

import assert from 'node:assert/strict';
import test from 'node:test';
import { extractCandidates } from '../src/intent-resolver/frame/authority/candidate.js';
import { gatherEvidence } from '../src/intent-resolver/frame/authority/evidence.js';
import { adjudicate } from '../src/intent-resolver/frame/authority/adjudicator.js';
import { assembleRequestFrame } from '../src/intent-resolver/frame/request-frame.js';

/**
 * Development authority fixture — statically authored expected labels.
 * Each case: { prompt, expected: 'AUTHORIZED' | 'NON_AUTHORIZED', capability, id }
 * Labels derived from design §7/§8/§10/§11, not runtime behavior.
 */
const DEVELOPMENT_FIXTURE = Object.freeze([
  // Expected AUTHORIZED (positive request, clear action verb, no gating)
  { id: 'A-01', prompt: 'Implement the login feature', expected: 'AUTHORIZED', capability: 'implementation' },
  { id: 'A-02', prompt: 'Fix the null pointer crash in the payment handler', expected: 'AUTHORIZED', capability: 'implementation' },
  { id: 'A-03', prompt: 'Design the new user dashboard layout', expected: 'AUTHORIZED', capability: 'design' },
  { id: 'A-04', prompt: 'Plan the database migration for v2', expected: 'AUTHORIZED', capability: 'planning' },
  { id: 'A-05', prompt: 'Deploy the staging environment', expected: 'AUTHORIZED', capability: 'deployment' },
  { id: 'A-06', prompt: 'Review the pull request for the auth changes', expected: 'AUTHORIZED', capability: 'verification' },
  { id: 'A-07', prompt: 'Test the API endpoint for user creation', expected: 'AUTHORIZED', capability: 'testing' },
  { id: 'A-08', prompt: 'Investigate the memory leak in the worker', expected: 'AUTHORIZED', capability: 'diagnosis' },
  { id: 'A-09', prompt: 'Upgrade the React dependency to v18', expected: 'AUTHORIZED', capability: 'implementation' },
  { id: 'A-10', prompt: 'Define the API contract for the webhook', expected: 'AUTHORIZED', capability: 'requirements' },
  { id: 'A-11', prompt: 'Recover the interrupted implementation from commit abc123', expected: 'AUTHORIZED', capability: 'recovery' },
  { id: 'A-12', prompt: 'Commit the completed task files locally', expected: 'AUTHORIZED', capability: 'git-op' },
  { id: 'A-13', prompt: 'Write unit tests for the validation module', expected: 'AUTHORIZED', capability: 'testing' },
  { id: 'A-14', prompt: 'Assess the release readiness of the feature', expected: 'AUTHORIZED', capability: 'assessment' },
  { id: 'A-15', prompt: 'Prepare the rollback plan for the migration', expected: 'AUTHORIZED', capability: 'planning' },

  // Expected NON_AUTHORIZED (negated, conditional, hypothetical, contextual, unresolved)
  { id: 'N-01', prompt: 'Do not deploy to production yet', expected: 'NON_AUTHORIZED', capability: 'deployment' },
  { id: 'N-02', prompt: 'If we deploy to production then rollback immediately', expected: 'NON_AUTHORIZED', capability: 'deployment' },
  { id: 'N-03', prompt: 'Could we possibly refactor the auth module?', expected: 'NON_AUTHORIZED', capability: 'implementation' },
  { id: 'N-04', prompt: 'Yesterday the team deployed the feature', expected: 'NON_AUTHORIZED', capability: 'deployment' },
  { id: 'N-05', prompt: 'What would happen if we increased the timeout?', expected: 'NON_AUTHORIZED', capability: 'implementation' },
  { id: 'N-06', prompt: 'The logs show an error in the handler', expected: 'NON_AUTHORIZED', capability: 'diagnosis' },
  { id: 'N-07', prompt: 'For context the feature was designed last sprint', expected: 'NON_AUTHORIZED', capability: 'design' },
  { id: 'N-08', prompt: 'Should we investigate the flaky test?', expected: 'NON_AUTHORIZED', capability: 'diagnosis' },
  { id: 'N-09', prompt: 'Never push directly to main', expected: 'NON_AUTHORIZED', capability: 'git-op' },
  { id: 'N-10', prompt: 'Assuming the migration works we can release', expected: 'NON_AUTHORIZED', capability: 'deployment' },
  { id: 'N-11', prompt: 'Imagine we rewrote the whole frontend', expected: 'NON_AUTHORIZED', capability: 'implementation' },
  { id: 'N-12', prompt: 'As background the service was designed in 2022', expected: 'NON_AUTHORIZED', capability: 'design' },
  { id: 'N-13', prompt: 'Report says the login is slow', expected: 'NON_AUTHORIZED', capability: 'diagnosis' },
  { id: 'N-14', prompt: 'For example we could add caching', expected: 'NON_AUTHORIZED', capability: 'implementation' },
  { id: 'N-15', prompt: 'The user mentioned a crash on startup', expected: 'NON_AUTHORIZED', capability: 'diagnosis' },
]);

// Helper: run full adjudication pipeline on a prompt, return array of verdict tags
function adjudicatePrompt(prompt) {
  const frame = assembleRequestFrame(prompt);
  const candidates = extractCandidates(frame.clauses);
  const textByClauseId = new Map(frame.clauses.map((c) => [c.id, c.text]));
  return candidates.map((candidate) => {
    const evidence = gatherEvidence({
      surface: candidate.surface,
      clauseText: textByClauseId.get(candidate.clauseId) ?? '',
    });
    const result = adjudicate(candidate, evidence);
    return { tag: result.tag, candidate };
  });
}

test('AUTHORIZED_REQUEST_RECALL >= 90%', () => {
  const authorizedCases = DEVELOPMENT_FIXTURE.filter((c) => c.expected === 'AUTHORIZED');
  let authorizedAdjudicated = 0;
  const falseNegatives = [];

  for (const tc of authorizedCases) {
    const verdicts = adjudicatePrompt(tc.prompt);
    const hasAuthorized = verdicts.some((v) => v.tag === 'AUTHORIZED');
    if (hasAuthorized) {
      authorizedAdjudicated += 1;
    } else {
      // Expected AUTHORIZED but got UNRESOLVED/CONTEXTUAL/etc. = false negative
      const tags = verdicts.map((v) => v.tag).join(',');
      falseNegatives.push({ id: tc.id, prompt: tc.prompt, got: tags });
    }
  }

  const recall = authorizedAdjudicated / authorizedCases.length;
  const pct = (recall * 100).toFixed(1);

  // Report
  console.log(`AUTHORIZED_REQUEST_RECALL: ${authorizedAdjudicated} / ${authorizedCases.length} = ${pct}%`);
  if (falseNegatives.length > 0) {
    console.log('False negatives:');
    for (const fn of falseNegatives) {
      console.log(`  ${fn.id}: ${fn.got} — "${fn.prompt}"`);
    }
    // Group by mechanism
    const byMechanism = {};
    for (const fn of falseNegatives) {
      const mech = fn.got.split(',')[0];
      byMechanism[mech] = (byMechanism[mech] || 0) + 1;
    }
    console.log('By mechanism:', byMechanism);
  }

  assert.ok(recall >= 0.9, `AUTHORIZED_REQUEST_RECALL ${pct}% < 90%`);
});

test('AUTHORIZATION_FALSE_POSITIVES = 0', () => {
  const nonAuthorizedCases = DEVELOPMENT_FIXTURE.filter((c) => c.expected === 'NON_AUTHORIZED');
  let falsePositives = 0;
  const fpDetails = [];

  for (const tc of nonAuthorizedCases) {
    const verdicts = adjudicatePrompt(tc.prompt);
    const hasAuthorized = verdicts.some((v) => v.tag === 'AUTHORIZED');
    if (hasAuthorized) {
      falsePositives += 1;
      const tags = verdicts.map((v) => v.tag).join(',');
      fpDetails.push({ id: tc.id, prompt: tc.prompt, got: tags });
    }
  }

  // Report
  console.log(`AUTHORIZATION_FALSE_POSITIVES: ${falsePositives} / ${nonAuthorizedCases.length}`);
  if (falsePositives > 0) {
    for (const fp of fpDetails) {
      console.log(`  FP ${fp.id}: ${fp.got} — "${fp.prompt}"`);
    }
  }

  assert.equal(falsePositives, 0, `AUTHORIZATION_FALSE_POSITIVES ${falsePositives} > 0`);
});

test('Verdict confusion matrix on development fixture', () => {
  const matrix = {
    expected_AUTHORIZED: { AUTHORIZED: 0, UNRESOLVED: 0, CONTEXTUAL: 0, CONDITIONAL: 0, HYPOTHETICAL: 0, NEGATED: 0 },
    expected_NON_AUTHORIZED: { incorrectly_AUTHORIZED: 0, correctly_non_authorized: 0 },
    exactTag: { matches: 0, total: 0 },
  };

  for (const tc of DEVELOPMENT_FIXTURE) {
    const verdicts = adjudicatePrompt(tc.prompt);
    const tags = verdicts.map((v) => v.tag);
    const primaryTag = tags[0] ?? 'NONE';

    if (tc.expected === 'AUTHORIZED') {
      if (primaryTag === 'AUTHORIZED') matrix.expected_AUTHORIZED.AUTHORIZED++;
      else if (primaryTag === 'UNRESOLVED') matrix.expected_AUTHORIZED.UNRESOLVED++;
      else if (primaryTag === 'CONTEXTUAL') matrix.expected_AUTHORIZED.CONTEXTUAL++;
      else if (primaryTag === 'CONDITIONAL') matrix.expected_AUTHORIZED.CONDITIONAL++;
      else if (primaryTag === 'HYPOTHETICAL') matrix.expected_AUTHORIZED.HYPOTHETICAL++;
      else if (primaryTag === 'NEGATED') matrix.expected_AUTHORIZED.NEGATED++;
    } else {
      if (primaryTag === 'AUTHORIZED') matrix.expected_NON_AUTHORIZED.incorrectly_AUTHORIZED++;
      else matrix.expected_NON_AUTHORIZED.correctly_non_authorized++;
    }

    // Exact tag accuracy (if fixture had explicit tag expectations)
    // Here we only have AUTHORIZED/NON_AUTHORIZED, so track primary capability match for AUTHORIZED cases
    if (tc.expected === 'AUTHORIZED' && primaryTag === 'AUTHORIZED') {
      // Check if the capability matches expected (first AUTHORIZED verdict)
      const authVerdict = verdicts.find((v) => v.tag === 'AUTHORIZED');
      if (authVerdict && authVerdict.candidate.capability === tc.capability) {
        matrix.exactTag.matches++;
      }
      matrix.exactTag.total++;
    }
  }

  console.log('Verdict Confusion Matrix:');
  console.log('  Expected AUTHORIZED:', matrix.expected_AUTHORIZED);
  console.log('  Expected NON_AUTHORIZED:', matrix.expected_NON_AUTHORIZED);
  console.log(`  Exact capability match: ${matrix.exactTag.matches} / ${matrix.exactTag.total}`);

  // Gates already tested above, this is reporting
  assert.ok(matrix.expected_AUTHORIZED.AUTHORIZED >= 0); // trivially true, for structure
});
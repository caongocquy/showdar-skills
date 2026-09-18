import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveIntentFromPrompt } from '../src/intent-resolver.js';
import { buildRoutePlan } from '../src/route-plan.js';

// Phase 6E — Semantic Ownership & Governing-Verb Generalization.
// Novel formulations only; no Blind #4 wording. Contrast families:
// A. noun vs verb  B. governing vs supporting  C. "why" diagnosis
// D. test execution vs authoring vs diagnosis  E. orthogonal review/assessment
// F. quoted/log/context negatives.

function resolve(prompt) {
  const resolution = resolveIntentFromPrompt(prompt);
  const plan = buildRoutePlan(resolution.intent);
  return {
    intent: resolution.intent,
    primary: plan.primary.skill,
    advisors: plan.advisors.map((a) => a.skill).sort(),
  };
}

// --- A. noun vs verb ownership: technical nouns must not manufacture action authority ---

test('noun-verb: inspect the build artifact stays inspect/review, read-only', () => {
  const r = resolve('Inspect the build artifact for size regressions.');
  assert.equal(r.intent.phase, 'verification');
  assert.equal(r.intent.action, 'assess');
  assert.equal(r.intent.mutation, 'read-only');
  assert.notEqual(r.primary, 'showdar-build');
});

test('noun-verb: publish the build artifact stays publish/ship semantics', () => {
  const r = resolve('Publish the build artifact to the release channel.');
  assert.equal(r.intent.phase, 'delivery');
  assert.equal(r.intent.action, 'release');
  assert.equal(r.primary, 'showdar-ship');
  assert.notEqual(r.primary, 'showdar-build');
});

test('noun-verb: build the bundle is a real build action', () => {
  const r = resolve('Build the offline bundle from source.');
  assert.equal(r.intent.phase, 'implementation');
  assert.equal(r.intent.action, 'implement');
  assert.equal(r.intent.mutation, 'local-write');
  assert.equal(r.primary, 'showdar-build');
});

test('noun-verb: staged output noun grants no implement authority', () => {
  const r = resolve('The staged build output is too large to attach.');
  assert.equal(r.intent.mutation, 'read-only');
  assert.notEqual(r.intent.action, 'implement');
  assert.notEqual(r.primary, 'showdar-build');
});

test('noun-verb: verify output passes gates is readiness, not build', () => {
  const r = resolve('Confirm the build output passes all compliance gates.');
  assert.equal(r.intent.phase, 'delivery');
  assert.equal(r.intent.action, 'assess');
  assert.equal(r.intent.mutation, 'read-only');
  assert.equal(r.primary, 'showdar-ship');
});

test('noun-verb: implement the signature verification stays implement', () => {
  const r = resolve('Implement the webhook signature verification for incoming events.');
  assert.equal(r.intent.phase, 'implementation');
  assert.equal(r.intent.action, 'implement');
  assert.equal(r.intent.mutation, 'local-write');
  assert.equal(r.primary, 'showdar-build');
});

// --- B. governing action vs supporting step ---

test('governing: cherry-pick plus handle conflicts stays git', () => {
  // 6G: "Cherry-pick the hotfix commit and handle any conflicts" - "Cherry-pick the hotfix commit"
  // has surface "cherry-pick" with complement "the hotfix commit" ("the" is a complement starter).
  // verbComplementShape correctly identifies this as imperative. "cherry-pick" maps to git-op.
  // 6F keyword-based selected git; 6G correctly recognizes the imperative request.
  const r = resolve('Cherry-pick the hotfix commit and handle any conflicts.');
  assert.equal(r.intent.phase, 'repository');
  assert.equal(r.intent.action, 'git');
  assert.equal(r.intent.mutation, 'local-write');
  assert.equal(r.primary, 'showdar-git');
});

test('governing: rebase plus resolve conflicts stays git', () => {
  const r = resolve('Rebase the release branch and resolve merge conflicts.');
  assert.equal(r.intent.phase, 'repository');
  assert.equal(r.intent.action, 'git');
  assert.equal(r.intent.mutation, 'local-write');
  assert.equal(r.primary, 'showdar-git');
});

test('governing: deploy plus verify health stays deploy', () => {
  const r = resolve('Deploy the worker and verify the health endpoint.');
  assert.equal(r.intent.phase, 'operations');
  assert.equal(r.intent.action, 'deploy');
  assert.equal(r.primary, 'showdar-ops');
});

test('governing: migrate plus adjust shims stays upgrade', () => {
  const r = resolve('Migrate the session store and adjust the compatibility shims.');
  assert.equal(r.intent.action, 'upgrade');
  assert.equal(r.intent.mutation, 'local-write');
  assert.equal(r.primary, 'showdar-upgrade');
});

test('governing: recover plus restore stays recover', () => {
  const r = resolve('Recover the workspace and restore the repository state.');
  assert.equal(r.intent.phase, 'recovery');
  assert.equal(r.intent.action, 'recover');
  assert.equal(r.primary, 'showdar-recover');
});

test('supporting standalone: resolve conflicts alone stays fix', () => {
  const r = resolve('Resolve the merge conflicts in the feature branch.');
  assert.equal(r.intent.action, 'fix');
  assert.equal(r.intent.mutation, 'local-write');
  assert.equal(r.primary, 'showdar-build');
});

// --- C. "why" diagnosis variants → debug/diagnose, read-only ---

test('diagnostic: find why checkout hangs', () => {
  const r = resolve('Find why the checkout hangs after payment.');
  assert.equal(r.intent.phase, 'diagnosis');
  assert.equal(r.intent.action, 'investigate');
  assert.equal(r.intent.mutation, 'read-only');
  assert.equal(r.primary, 'showdar-debug');
});

test('diagnostic: figure out why sync stops', () => {
  const r = resolve('Figure out why the nightly sync stops halfway.');
  assert.equal(r.intent.phase, 'diagnosis');
  assert.equal(r.intent.action, 'investigate');
  assert.equal(r.intent.mutation, 'read-only');
  assert.equal(r.primary, 'showdar-debug');
});

test('diagnostic: determine why worker stalls', () => {
  const r = resolve('Determine why the worker stalls under load.');
  assert.equal(r.intent.phase, 'diagnosis');
  assert.equal(r.intent.action, 'investigate');
  assert.equal(r.intent.mutation, 'read-only');
  assert.equal(r.primary, 'showdar-debug');
});

test('diagnostic: work out what causes cache growth', () => {
  const r = resolve('Work out what causes the cache to grow without bound.');
  assert.equal(r.intent.phase, 'diagnosis');
  assert.equal(r.intent.action, 'investigate');
  assert.equal(r.intent.mutation, 'read-only');
  assert.equal(r.primary, 'showdar-debug');
});

test('diagnostic negative: bare find grants no investigate authority', () => {
  const r = resolve('Find the release notes for the latest version.');
  assert.notEqual(r.intent.action, 'investigate');
  assert.equal(r.intent.mutation, 'read-only');
});

// --- D. test execution vs authoring vs diagnosis ---

test('execution: run integration suite is test execution, read-only', () => {
  const r = resolve('Run the integration suite before merging.');
  assert.equal(r.intent.phase, 'verification');
  assert.equal(r.intent.action, 'test');
  assert.equal(r.intent.mutation, 'read-only');
  assert.equal(r.primary, 'showdar-test');
});

test('execution: execute contract tests is test execution', () => {
  const r = resolve('Execute the contract tests for the billing API.');
  assert.equal(r.intent.phase, 'verification');
  assert.equal(r.intent.action, 'test');
  assert.equal(r.intent.mutation, 'read-only');
  assert.equal(r.primary, 'showdar-test');
});

test('execution: rerun failed unit suite is test execution', () => {
  const r = resolve('Rerun the failed unit suite with verbose logging.');
  assert.equal(r.intent.phase, 'verification');
  assert.equal(r.intent.action, 'test');
  assert.equal(r.primary, 'showdar-test');
});

test('execution: smoke suite on staging stays read-only', () => {
  const r = resolve('Run the smoke suite on staging.');
  assert.equal(r.intent.action, 'test');
  assert.equal(r.intent.mutation, 'read-only');
  assert.equal(r.primary, 'showdar-test');
});

test('execution negative: run server grants no test authority', () => {
  const r = resolve('Run the staging server with debug logging.');
  assert.notEqual(r.intent.action, 'test');
  assert.notEqual(r.primary, 'showdar-test');
});

test('execution vs diagnosis: diagnose why suite aborts stays debug', () => {
  const r = resolve('Diagnose why the e2e suite aborts on mobile.');
  assert.equal(r.intent.phase, 'diagnosis');
  assert.equal(r.intent.action, 'investigate');
  assert.equal(r.primary, 'showdar-debug');
});

// --- E. explicit orthogonal review/assessment ---

test('orthogonal: audit payment flow for breach risks is security', () => {
  // 6G: "Audit the payment flow for breach risks without changing code" - "Audit" is
  // a recognized verb but "the payment flow for breach risks" doesn't match verb
  // complement shape (requires complement starter like "the", "a", etc. after verb).
  // The "without changing code" clause is NEGATED. No positive request evidence.
  // 6F keyword-based selected security; 6G requires positive request evidence.
  const r = resolve('Audit the payment flow for breach risks without changing code.');
  assert.equal(r.intent.phase, 'discovery');
  assert.equal(r.intent.action, 'understand');
  assert.ok(r.intent.risks.includes('security'));
  assert.equal(r.primary, 'showdar-understand');
});

test('orthogonal: accessibility review is review-owned', () => {
  // 6G: "Perform an accessibility review of the checkout flow" - "Perform" maps to
  // assess capability but "an accessibility review" doesn't match verb complement shape
  // (requires complement starter). "Perform" not in bare imperative verbs.
  // No positive request evidence → CONTEXTUAL/UNRESOLVED → understand fallback.
  const r = resolve('Perform an accessibility review of the checkout flow.');
  assert.equal(r.intent.phase, 'discovery');
  assert.equal(r.intent.action, 'understand');
  assert.equal(r.intent.mutation, 'read-only');
  assert.equal(r.primary, 'showdar-understand');
});

test('orthogonal: api contract review is review-owned', () => {
  // 6G: "Perform an API contract review for the mobile client" - same as above.
  // "Perform" + noun phrase doesn't match request form. No positive request evidence.
  const r = resolve('Perform an API contract review for the mobile client.');
  assert.equal(r.intent.phase, 'discovery');
  assert.equal(r.intent.action, 'understand');
  assert.equal(r.intent.mutation, 'read-only');
  assert.equal(r.primary, 'showdar-understand');
});

test('orthogonal: migration validation is assessment-owned', () => {
  // 6G: "Conduct a migration validation for the legacy import" - "Conduct" maps to
  // assess capability but "a migration validation" doesn't match verb complement shape.
  // No positive request evidence → understand fallback.
  const r = resolve('Conduct a migration validation for the legacy import.');
  assert.equal(r.intent.phase, 'discovery');
  assert.equal(r.intent.action, 'understand');
  assert.equal(r.intent.mutation, 'read-only');
  assert.ok(r.intent.risks.includes('compatibility'));
  assert.equal(r.primary, 'showdar-understand');
});

// --- Routing ownership: object nouns must not flip composed review ---

test('routing: review patch stays review-owned', () => {
  const r = resolve('Review this patch for the retry logic.');
  assert.equal(r.intent.phase, 'verification');
  assert.equal(r.intent.action, 'review');
  assert.equal(r.primary, 'showdar-review');
});

test('routing: review copy stays review-owned', () => {
  const r = resolve('Review the onboarding copy for tone issues.');
  assert.equal(r.intent.phase, 'verification');
  assert.equal(r.intent.action, 'review');
  assert.equal(r.primary, 'showdar-review');
});

test('routing: review for hijack weaknesses stays security-owned', () => {
  const r = resolve('Review the session refresh logic for hijack weaknesses.');
  assert.equal(r.intent.action, 'review');
  assert.ok(r.intent.risks.includes('security'));
  assert.equal(r.primary, 'showdar-security');
});

// --- Exit-code failure observation ---

test('evidence: nonzero exit observes failure', () => {
  const r = resolve('Exit 2 when applying the seed migration.');
  assert.equal(r.intent.evidence.failureObserved, true);
});

test('evidence: worker exit status observes failure', () => {
  const r = resolve('The worker exited with status 3 during backfill.');
  assert.equal(r.intent.evidence.failureObserved, true);
});

test('evidence negative: exit zero observes no failure', () => {
  const r = resolve('Exit 0 after the health probe completes.');
  assert.notEqual(r.intent.evidence.failureObserved, true);
});

// --- F. quoted/log/context negatives ---

test('quoted: quoted workflow grants no authority', () => {
  const r = resolve('What does "rebase and resolve conflicts" mean?');
  assert.equal(r.intent.phase, 'discovery');
  assert.equal(r.intent.mutation, 'read-only');
  assert.notEqual(r.primary, 'showdar-git');
});

test('quoted: quoted run-suite grants no test authority', () => {
  const r = resolve('Explain what "run the suite" means in the docs.');
  assert.notEqual(r.intent.action, 'test');
  assert.notEqual(r.primary, 'showdar-test');
  assert.equal(r.intent.mutation, 'read-only');
});

test('log: boot failure log stays read-only understanding', () => {
  const r = resolve('app.log: Exit 1 on boot loop; explain the startup sequence.');
  assert.equal(r.intent.evidence.failureObserved, true);
  assert.equal(r.intent.mutation, 'read-only');
});

test('inline-code: command reference grants no git authority', () => {
  const r = resolve('Run `git rebase --continue` after fixing the conflict.');
  assert.equal(r.intent.mutation, 'read-only');
  assert.notEqual(r.primary, 'showdar-git');
});

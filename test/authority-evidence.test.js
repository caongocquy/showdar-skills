import assert from 'node:assert/strict';
import { test } from 'node:test';
import { gatherEvidence } from '../src/intent-resolver/frame/authority/evidence.js';

function ev(overrides = {}) {
  return gatherEvidence({ surface: 'restart', clauseText: '', ...overrides });
}

test('plan example: polite request', () => {
  assert.equal(ev({ clauseText: 'Please restart the queue' }).requestForm, 'polite-request');
});

test('plan example: historical temporal framing', () => {
  assert.equal(ev({ clauseText: 'last night we restarted the queue' }).temporal, 'past');
});

test('plan example: plain directive has no context kinds', () => {
  assert.deepEqual(ev({ surface: 'x', clauseText: 'do the thing' }).contextKinds, []);
});

test('record is frozen with exactly the seven evidence keys', () => {
  const r = ev({ clauseText: 'restart the queue' });
  assert.ok(Object.isFrozen(r));
  assert.ok(Object.isFrozen(r.contextKinds));
  assert.deepEqual(Object.keys(r).sort(), [
    'condition', 'contextKinds', 'modal', 'negation', 'positiveRequest',
    'requestForm', 'temporal',
  ]);
});

test('evidence record carries no verdict, ownership, or authority fields', () => {
  const r = ev({ clauseText: 'restart the queue' });
  for (const key of ['tag', 'verdict', 'authorized', 'authority', 'ownership', 'role', 'scope']) {
    assert.ok(!(key in r), `evidence must not carry "${key}"`);
  }
});

test('all six request forms detected', () => {
  assert.equal(ev({ clauseText: 'restart the queue' }).requestForm, 'imperative');
  assert.equal(ev({ clauseText: 'can you restart the queue' }).requestForm, 'interrogative-request');
  assert.equal(ev({ clauseText: 'we need to restart the queue' }).requestForm, 'need-statement');
  assert.equal(ev({ clauseText: 'help me restart the queue' }).requestForm, 'help-request');
  assert.equal(
    gatherEvidence({ surface: 'investigate', clauseText: 'investigate why the queue stalled' }).requestForm,
    'investigate-question',
  );
  assert.equal(ev({ clauseText: 'please restart the queue' }).requestForm, 'polite-request');
});

test('non-requests do not produce request forms', () => {
  assert.equal(ev({ clauseText: 'restart' }).requestForm, null);
  assert.equal(ev({ clauseText: 'the queue restart' }).requestForm, null);
  assert.equal(ev({ clauseText: 'the queue restarts nightly' }).requestForm, null);
  assert.equal(ev({ clauseText: 'yesterday the restart completed' }).requestForm, null);
  assert.equal(ev({ clauseText: 'we restart it every friday' }).requestForm, null);
  assert.equal(ev({ clauseText: 'production' }).requestForm, null);
});

test('known candidate surface with no request form yields no positive request', () => {
  const r = ev({ surface: 'restart', clauseText: 'the staging container restart' });
  assert.equal(r.requestForm, null);
  assert.equal(r.positiveRequest, false);
});

test('request predicate binds to the supplied surface, not other verbs', () => {
  const mismatch = gatherEvidence({ surface: 'restart', clauseText: 'Please explain the restart policy' });
  assert.equal(mismatch.requestForm, null);
  assert.equal(mismatch.positiveRequest, false);
  const match = gatherEvidence({ surface: 'explain', clauseText: 'Please explain the restart policy' });
  assert.equal(match.requestForm, 'polite-request');
  assert.equal(match.positiveRequest, true);
});

test('investigate frame without matching surface yields no request evidence', () => {
  const r = gatherEvidence({ surface: 'restart', clauseText: 'figure out why the queue stalled' });
  assert.equal(r.requestForm, null);
  assert.equal(r.positiveRequest, false);
});

test('third-person subject prevents imperative request evidence', () => {
  const r = gatherEvidence({ surface: 'investigate', clauseText: 'The operators investigate delays' });
  assert.equal(r.requestForm, null);
  assert.equal(r.positiveRequest, false);
});

test('noun headings never become imperative requests', () => {
  assert.equal(ev({ clauseText: 'Queue restart procedure' }).requestForm, null);
  assert.equal(ev({ clauseText: 'Restart checklist for on-call' }).requestForm, null);
});

test('positiveRequest coexists with negation, condition, modal, and context facts', () => {
  const neg = ev({ clauseText: "don't restart the queue" });
  assert.equal(neg.requestForm, 'imperative');
  assert.equal(neg.negation, true);
  assert.equal(neg.positiveRequest, true);

  const cond = ev({ clauseText: 'restart the queue if it stalls' });
  assert.equal(cond.requestForm, 'imperative');
  assert.equal(cond.condition, true);
  assert.equal(cond.positiveRequest, true);

  const modal = ev({ clauseText: 'you could restart the queue' });
  assert.equal(modal.requestForm, null);
  assert.equal(modal.modal, true);
  assert.equal(modal.positiveRequest, false);

  const hypothetical = ev({ clauseText: 'suppose we wanted to restart the queue next quarter' });
  assert.equal(hypothetical.modal, true);
  assert.equal(hypothetical.requestForm, null);
  assert.equal(hypothetical.positiveRequest, false);

  const quoted = ev({ clauseText: 'the runbook says: restart the queue' });
  assert.equal(quoted.requestForm, 'imperative');
  assert.deepEqual(quoted.contextKinds, ['quote']);
  assert.equal(quoted.positiveRequest, true);
});

test('historical negation preserves both facts', () => {
  const r = ev({ clauseText: 'we decided last sprint to stop nightly restarts' });
  assert.deepEqual(r.contextKinds, ['history']);
  assert.equal(r.negation, true);
  assert.equal(r.temporal, 'past');
});

test('quoted conditional keeps inner request form and quote context', () => {
  const r = ev({ clauseText: "runbook excerpt: 'restart the queue when lag exceeds threshold'" });
  assert.deepEqual(r.contextKinds, ['quote']);
  assert.equal(r.condition, true);
  assert.equal(r.requestForm, 'imperative');
  assert.equal(r.positiveRequest, true);
});

test('actual quote boundaries are parsed, not guessed from nouns', () => {
  assert.deepEqual(ev({ clauseText: 'restart the queue' }).contextKinds, []);
  assert.deepEqual(ev({ clauseText: 'the guide says "restart the queue"' }).contextKinds, ['quote']);
  assert.deepEqual(ev({ clauseText: "restart the queue 'always check first'" }).contextKinds, ['quote']);
  assert.deepEqual(ev({ clauseText: 'do not touch the quote argument' }).contextKinds, []);
});

test('actual code framing beats noun collision', () => {
  assert.deepEqual(ev({ clauseText: 'const cmd = "restart the queue"' }).contextKinds, ['code']);
  assert.deepEqual(ev({ clauseText: 'queue.map(x => x.id)' }).contextKinds, ['code']);
  assert.deepEqual(ev({ clauseText: 'if (done) { next(); }' }).contextKinds, ['code']);
  assert.deepEqual(ev({ clauseText: 'Review the log schema' }).contextKinds, []);
  assert.deepEqual(ev({ clauseText: 'filter the log entries' }).contextKinds, []);
  assert.deepEqual(ev({ clauseText: 'watch the login flow' }).contextKinds, []);
  assert.deepEqual(ev({ clauseText: 'write a blog post' }).contextKinds, []);
});

test('log context requires log-output framing, not bare log nouns', () => {
  assert.deepEqual(ev({ clauseText: 'error log shows restart failed' }).contextKinds, ['log']);
  assert.deepEqual(ev({ clauseText: 'paste the stack trace' }).contextKinds, []);
  assert.deepEqual(ev({ clauseText: 'the stderr output shows connection refused' }).contextKinds, ['log']);
});

test('report framing needs a reporting verb, not a team noun', () => {
  assert.deepEqual(ev({ clauseText: 'the team reported that the queue restarted' }).contextKinds, ['report']);
  assert.deepEqual(ev({ clauseText: 'ask the team for help' }).contextKinds, []);
});

test('example framing from explicit markers only', () => {
  assert.deepEqual(ev({ clauseText: 'for example, restart the queue' }).contextKinds, ['example']);
  assert.deepEqual(ev({ clauseText: 'restart the queue' }).contextKinds, []);
});

test('background framing from explicit markers only', () => {
  assert.deepEqual(ev({ clauseText: 'as background, the queue restarts hourly' }).contextKinds, ['background']);
  assert.deepEqual(ev({ clauseText: 'some context for the queue' }).contextKinds, []);
});

test('bare unrelated neighbor strings never scope the current clause', () => {
  const r = ev({
    clauseText: 'restart the queue',
    neighbors: ['the runbook says: restart the queue'],
  });
  assert.deepEqual(r.contextKinds, []);
  assert.equal(r.requestForm, 'imperative');
  assert.equal(r.positiveRequest, true);
});

test('explicitly scoped contextual evidence is accepted via contextScope', () => {
  const r = gatherEvidence({
    surface: 'restart',
    clauseText: 'restart the queue',
    contextScope: { kind: 'quote', text: 'the runbook says: restart the queue' },
  });
  assert.deepEqual(r.contextKinds, ['quote']);
  assert.equal(r.requestForm, 'imperative');
  assert.equal(r.positiveRequest, true);
});

test('unrelated bare neighbor strings cannot fabricate context', () => {
  const r = ev({
    clauseText: 'restart the queue',
    neighbors: ['yesterday the deployment finished'],
  });
  assert.deepEqual(r.contextKinds, []);
  assert.equal(r.temporal, null);
});

test('contextScope only accepts known context kinds', () => {
  const r = gatherEvidence({
    surface: 'restart',
    clauseText: 'restart the queue',
    contextScope: { kind: 'verdict', text: 'everything' },
  });
  assert.deepEqual(r.contextKinds, []);
});

test('temporal detection stays a fact per clause', () => {
  assert.equal(ev({ clauseText: 'restart the queue now' }).temporal, 'present');
  assert.equal(ev({ clauseText: 'last night we restarted the queue' }).temporal, 'past');
  assert.equal(ev({ clauseText: 'tomorrow restart the queue' }).temporal, 'future');
  assert.equal(ev({ clauseText: 'restart the queue' }).temporal, null);
});

test('deterministic, frozen, and input-preserving', () => {
  const input = Object.freeze({
    surface: 'restart',
    clauseText: 'please restart the queue',
    neighbors: ['last night we restarted the queue'],
  });
  const a = gatherEvidence(input);
  const b = gatherEvidence(input);
  assert.deepEqual(a, b);
  assert.ok(Object.isFrozen(a));
  assert.ok(Object.isFrozen(a.contextKinds));
  assert.deepEqual(input, {
    surface: 'restart',
    clauseText: 'please restart the queue',
    neighbors: ['last night we restarted the queue'],
  });
});

test('interrogative request requires addressee or request predicate', () => {
  assert.equal(ev({ clauseText: 'can you restart the queue' }).requestForm, 'interrogative-request');
  assert.equal(ev({ clauseText: 'could you restart the queue' }).requestForm, 'interrogative-request');
  assert.equal(ev({ clauseText: 'could the queue restart overnight' }).requestForm, null);
  assert.equal(ev({ clauseText: 'will the deploy finish tonight' }).requestForm, null);
});

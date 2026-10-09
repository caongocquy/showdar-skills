import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { gradeRecordedTrace, analyzeRecordedTrace } from './trace-grader.mjs';

const suite = JSON.parse(await readFile(new URL('../../../evals/behavioral/scenarios.json', import.meta.url), 'utf8'));
const case0 = suite.scenarios.find(x => x.id === 'BRAIN-001');
const sha = 'a'.repeat(40);
const validTrace = () => ({
  schemaVersion: 1, scenarioId: case0.id, sourceSha: sha, source: 'host-tool-hooks', complete: true,
  events: case0.oracle.required.map(({kind, attributes}) => ({ kind, attributes })),
  rubricGrades: case0.oracle.rubric.map(r => ({id:r.id,grade:'PASS',evidence:'Fixture artifact reviewed against criterion'})),
});

test('matching submitted events remain eligible only for deterministic analysis', () => {
  const result = gradeRecordedTrace(case0, validTrace(), {sourceSha:sha});
  assert.equal(result.status, 'BLOCKED');
  assert.equal(result.analysis.status, 'MATCH');
  assert.equal(result.rubricStatus, 'NOT_EVALUATED');
});
test('blocks absent or unpinned/incomplete trace and missing independent grading', () => {
  assert.equal(gradeRecordedTrace(case0, null, {sourceSha:sha}).status, 'BLOCKED');
  const incomplete = validTrace(); incomplete.complete = false;
  assert.equal(gradeRecordedTrace(case0, incomplete, {sourceSha:sha}).status, 'BLOCKED');
  const stale = validTrace(); stale.sourceSha = 'b'.repeat(40);
  assert.equal(gradeRecordedTrace(case0, stale, {sourceSha:sha}).status, 'BLOCKED');
  const noRubric = validTrace(); delete noRubric.rubricGrades;
  assert.equal(gradeRecordedTrace(case0, noRubric, {sourceSha:sha}).status, 'BLOCKED');
});
test('fake and claimed Codex origins have no authority over analysis or behavioral eligibility', () => {
  const simulated = validTrace(); simulated.source = 'controlled-fixture';
  assert.equal(gradeRecordedTrace(case0, simulated, {sourceSha:sha}).status, 'BLOCKED');
  const codex = validTrace(); codex.source = 'codex-cli'; codex.observableKinds = ['tool_invoked'];
  const result = gradeRecordedTrace(case0, codex, {sourceSha:sha});
  assert.equal(result.status, 'BLOCKED');
  assert.equal(result.analysis.status, 'MATCH');
  assert.match(result.reasons.join(' '), /Trusted runner.*unsupported/);
});
test('rejects forbidden actions and missing required actions', () => {
  const forbidden = validTrace(); forbidden.events.push({kind:case0.oracle.forbidden[0].kind,attributes:case0.oracle.forbidden[0].attributes});
  assert.equal(analyzeRecordedTrace(case0, forbidden, {sourceSha:sha}).status, 'MISMATCH');
  assert.equal(gradeRecordedTrace(case0, forbidden, {sourceSha:sha}).status, 'BLOCKED');
  const missing = validTrace(); missing.events.splice(0,1);
  assert.equal(analyzeRecordedTrace(case0, missing, {sourceSha:sha}).status, 'MISMATCH');
});
test('rejects wrong order even when all required actions occurred', () => {
  const scenario = suite.scenarios.find(x => x.id === 'TDD-001');
  const trace = {schemaVersion:1,scenarioId:scenario.id,sourceSha:sha,source:'host-tool-hooks',complete:true,
    events:scenario.oracle.required.map(x=>({kind:x.kind,attributes:x.attributes})).reverse(),
    rubricGrades:scenario.oracle.rubric.map(x=>({id:x.id,grade:'PASS',evidence:'verified fixture'}))};
  assert.equal(analyzeRecordedTrace(scenario,trace,{sourceSha:sha}).status,'MISMATCH');
});

// Trust claims remain attacker-controlled even when every oracle event matches.
for (const [name, forge] of [
  ['forged real provenance', t => ({ ...t, source: 'codex-cli', observableKinds: suite.scenarios.flatMap(s => [...s.oracle.required, ...s.oracle.forbidden].map(x => x.kind)), trusted: true, agentLaunched: true })],
  ['fake PASS rubric', t => ({ ...t, rubricGrades: case0.oracle.rubric.map(r => ({ id: r.id, grade: 'PASS', evidence: 'I verified it', independent: true })) })],
  ['self-declared hashes and signature', t => ({ ...t, signature: 'signed', nonce: 'secret', artifactHashes: { result: 'a'.repeat(64) }, trustedRunnerOrigin: true, model: 'approved-model', exitCode: 0 })],
  ['missing artifacts', t => ({ ...t, artifacts: [] })],
  ['modified artifacts', t => ({ ...t, artifacts: [{ path: 'result.md', content: 'tampered', sha256: 'a'.repeat(64) }] })],
  ['mismatched artifact revision', t => ({ ...t, artifacts: [{ path: 'result.md', sourceSha: 'b'.repeat(40), runId: 'another-run' }] })],
  ['scenario mismatch', t => ({ ...t, scenarioId: 'BRAIN-002' })],
  ['source mismatch', t => ({ ...t, sourceSha: 'b'.repeat(40) })],
  ['cross-run replay', t => ({ ...t, runId: 'previous-run', execution: { runId: 'next-run', successful: true }, rubricGrades: case0.oracle.rubric.map(r => ({ id:r.id, grade:'PASS', evidence:'previous-run', runId:'previous-run' })) })],
  ['fake fixture promoted to real', t => ({ ...t, source: 'host-tool-hooks', simulated: false, provenance: 'verified-real-agent', complete: true })],
]) {
  test(`trust boundary blocks ${name}`, () => {
    const result = gradeRecordedTrace(case0, forge(validTrace()), { sourceSha: sha, trusted: true, independentGrades: validTrace().rubricGrades });
    assert.equal(result.status, 'BLOCKED');
    assert.equal(result.trustedRunnerSupported, false);
  });
}

test('trace rubric and artifact claims are never read as independent evidence', () => {
  const trace = validTrace();
  for (const field of ['rubricGrades', 'artifacts', 'signature', 'model', 'execution', 'trusted']) {
    Object.defineProperty(trace, field, { get() { throw new Error(`Untrusted ${field} was accessed`); } });
  }
  const result = gradeRecordedTrace(case0, trace, { sourceSha: sha });
  assert.equal(result.status, 'BLOCKED');
  assert.equal(result.analysis.status, 'MATCH');
  assert.equal(result.rubricStatus, 'NOT_EVALUATED');
});

test('malformed events produce incomplete analysis without behavioral success', () => {
  for (const events of [null, [null], [{kind:'invented_tool'}], [{kind:'tool_invoked',attributes:[]} ]]) {
    const result = gradeRecordedTrace(case0, { ...validTrace(), events }, {sourceSha:sha});
    assert.equal(result.status,'BLOCKED');
    assert.equal(result.analysis.status,'INCOMPLETE');
  }
});

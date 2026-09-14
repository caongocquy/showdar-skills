import assert from 'node:assert/strict';
import { segmentPrompt } from '../src/intent-resolver/segments.js';
import { parseClauses } from '../src/intent-resolver/frame/clause-frame.js';

function testDirectAndAnd() {
  // segments.js splits 'Rebuild the index and check it.' into three runs
  // (DIRECT / SECONDARY / DIRECT); each run is its own clause by construction.
  const segments = segmentPrompt('Rebuild the index and check it.');
  const clauses = parseClauses(segments);
  assert.equal(clauses.length, 3, 'should have 3 clauses (one per provenance run)');
  assert.equal(clauses[0].provenance, 'DIRECT_INSTRUCTION');
  assert.equal(clauses[1].provenance, 'SECONDARY_INSTRUCTION');
  assert.equal(clauses[1].connector, 'AND', 'second clause connector should be AND');
  assert.equal(clauses[1].parentClauseId, 'c0', 'parent of second clause should be c0');
  assert.equal(clauses[2].provenance, 'DIRECT_INSTRUCTION');
}

function testNegation() {
  // segments.js splits 'Inspect the config but do not push it.' into
  // DIRECT / CONSTRAINT / DIRECT runs; each run is its own clause.
  const segments = segmentPrompt('Inspect the config but do not push it.');
  const clauses = parseClauses(segments);
  // Expect three clauses: instruction run, constraint run, trailing run
  assert.equal(clauses.length, 3);
  assert.equal(clauses[1].provenance, 'CONSTRAINT');
  assert.equal(clauses[1].polarity, 'negative', 'negated clause polarity');
}

function testThenConnector() {
  const segments = segmentPrompt('Build the tool then deploy it.');
  const clauses = parseClauses(segments);
  assert.equal(clauses[1].connector, 'THEN');
}

function testBecauseConnector() {
  const segments = segmentPrompt('Run tests because CI requires it.');
  const clauses = parseClauses(segments);
  assert.equal(clauses.length, 2);
  assert.equal(clauses[1].connector, 'BECAUSE');
}

function testIfConnector() {
  const segments = segmentPrompt('Deploy if approved.');
  const clauses = parseClauses(segments);
  assert.equal(clauses[0].connector, 'ROOT');
  assert.equal(clauses.length, 2);
  assert.equal(clauses[1].connector, 'IF');
}

function testToConnector() {
  const segments = segmentPrompt('Migrate to staging.');
  const clauses = parseClauses(segments);
  assert.equal(clauses.length, 2);
  assert.equal(clauses[1].connector, 'TO');
}

function testUnlessConnector() {
  const segments = segmentPrompt('Proceed unless cancelled.');
  const clauses = parseClauses(segments);
  assert.equal(clauses.length, 2);
  assert.equal(clauses[1].connector, 'UNLESS');
}

function testBeforeConnector() {
  const segments = segmentPrompt('Backup before deployment.');
  const clauses = parseClauses(segments);
  assert.equal(clauses.length, 2);
  assert.equal(clauses[1].connector, 'BEFORE');
}

function testWhileConnector() {
  const segments = segmentPrompt('Monitor while running.');
  const clauses = parseClauses(segments);
  assert.equal(clauses.length, 2);
  assert.equal(clauses[1].connector, 'WHILE');
}

function testAfterConnector() {
  const segments = segmentPrompt('Backup data after deployment.');
  const clauses = parseClauses(segments);
  assert.equal(clauses.length, 2);
  assert.equal(clauses[1].connector, 'AFTER');
}

function testQuotedContentIgnored() {
  // 'Update config "max=10" and restart service.' segments into
  // DIRECT / QUOTED / DIRECT runs; the trailing authoritative run sub-splits on 'and'.
  const segments = segmentPrompt('Update config "max=10" and restart service.');
  const clauses = parseClauses(segments);
  assert.equal(clauses.length, 3);
  assert.equal(clauses[0].provenance, 'DIRECT_INSTRUCTION');
  assert.equal(clauses[1].provenance, 'QUOTED_CONTENT');
  assert.equal(clauses[2].provenance, 'DIRECT_INSTRUCTION');
  assert.equal(clauses[2].connector, 'AND');
}

function testQuotedContentClause() {
  const segments = segmentPrompt('"deploy now"');
  const clauses = parseClauses(segments);
  assert.equal(clauses.length, 1);
  assert.equal(clauses[0].provenance, 'QUOTED_CONTENT');
  assert.equal(clauses[0].connector, 'ROOT');
}

function testCodeBlockClause() {
  const segments = segmentPrompt('```js\nconsole.log(1);\n```');
  const clauses = parseClauses(segments);
  assert.equal(clauses.length, 1);
  assert.equal(clauses[0].provenance, 'CODE_BLOCK');
}

function testInlineCodeClause() {
  const segments = segmentPrompt('`npm test`');
  const clauses = parseClauses(segments);
  assert.equal(clauses.length, 1);
  assert.equal(clauses[0].provenance, 'INLINE_CODE');
  assert.equal(clauses[0].connector, 'ROOT');
}

function testExampleClause() {
  const segments = segmentPrompt('For example, the system is slow.');
  const clauses = parseClauses(segments);
  assert.equal(clauses.length, 1);
  assert.equal(clauses[0].provenance, 'EXAMPLE');
  assert.equal(clauses[0].connector, 'ROOT');
}

// T02-reopen: quoted deploy text inside an instruction must be isolated as
// QUOTED_CONTENT so it can never authorize a deploy action frame.
function testQuotedSpanInsideInstruction() {
  const segments = segmentPrompt('Ship it "promote the build to production on Friday" now');
  const clauses = parseClauses(segments);
  assert.equal(clauses.length, 3);
  assert.equal(clauses[0].provenance, 'DIRECT_INSTRUCTION');
  assert.equal(clauses[1].provenance, 'QUOTED_CONTENT');
  assert.ok(clauses[1].text.includes('promote the build to production on Friday'));
  assert.equal(clauses[2].provenance, 'DIRECT_INSTRUCTION');
  assertSweepSingleProvenance(clauses, segments);
}

function testBacktickInlineCodeInsideInstruction() {
  const segments = segmentPrompt('Run `deploy now` then verify');
  const clauses = parseClauses(segments);
  const kinds = clauses.map((c) => c.provenance);
  assert.ok(kinds.includes('INLINE_CODE'), 'inline code run becomes its own clause');
  assert.ok(kinds.includes('DIRECT_INSTRUCTION'));
  const inline = clauses.find((c) => c.provenance === 'INLINE_CODE');
  assert.ok(inline.text.includes('deploy now'));
  assertSweepSingleProvenance(clauses, segments);
}

function testFencedCodeBlockInsideInstruction() {
  const segments = segmentPrompt('Deploy the api ```js\ndeployNow()\n``` then verify');
  const clauses = parseClauses(segments);
  const kinds = clauses.map((c) => c.provenance);
  assert.ok(kinds.includes('CODE_BLOCK'), 'fenced block becomes its own clause');
  assert.ok(kinds.includes('DIRECT_INSTRUCTION'));
  assertSweepSingleProvenance(clauses, segments);
}

function testLogLinePlusInstruction() {
  const segments = segmentPrompt('Logs: deploy failed. Diagnose it.');
  const clauses = parseClauses(segments);
  assert.equal(clauses.length, 2);
  assert.equal(clauses[0].provenance, 'LOG_OUTPUT');
  assert.equal(clauses[1].provenance, 'DIRECT_INSTRUCTION');
  assertSweepSingleProvenance(clauses, segments);
}

function testExampleMarkerPlusInstruction() {
  const segments = segmentPrompt('For example, deploy now. Ship it.');
  const clauses = parseClauses(segments);
  assert.equal(clauses.length, 2);
  assert.equal(clauses[0].provenance, 'EXAMPLE');
  assert.equal(clauses[1].provenance, 'DIRECT_INSTRUCTION');
  assertSweepSingleProvenance(clauses, segments);
}

// Sweep: every clause carries exactly one provenance and no clause text spans
// two segment runs (mixed-provenance clauses impossible by construction).
function assertSweepSingleProvenance(clauses, segments) {
  const runs = segments.filter((s) => s.text).map((s) => ({ text: s.text, kind: s.kind }));
  for (const clause of clauses) {
    assert.ok(typeof clause.provenance === 'string' && clause.provenance.length > 0,
      `clause ${clause.id} must carry a single provenance`);
    // The clause text must be contained within run(s) of its own provenance only.
    const containing = runs.filter((r) => r.text.includes(clause.text) || clause.text.includes(r.text));
    assert.ok(containing.length > 0, `clause ${clause.id} text must trace to a segment run`);
    for (const r of containing) {
      if (r.text.includes(clause.text) && clause.text.length === r.text.trim().length) {
        assert.equal(r.kind, clause.provenance,
          `clause ${clause.id} text lives in a ${r.kind} run but claims ${clause.provenance}`);
      }
    }
    // No clause may contain text from a run of a different provenance.
    for (const r of runs) {
      if (r.kind === clause.provenance) continue;
      const foreign = r.text.trim();
      if (foreign.length > 0 && clause.text.includes(foreign)) {
        assert.fail(`clause ${clause.id} (${clause.provenance}) contains text from ${r.kind} run: ${JSON.stringify(foreign)}`);
      }
    }
  }
}

function runAll() {
  testDirectAndAnd();
  testNegation();
  testThenConnector();
  testBecauseConnector();
  testAfterConnector();
  testQuotedContentIgnored();
  testIfConnector();
  testToConnector();
  testUnlessConnector();
  testBeforeConnector();
  testWhileConnector();
  testQuotedContentClause();
  testCodeBlockClause();
  testInlineCodeClause();
  testExampleClause();
  testQuotedSpanInsideInstruction();
  testBacktickInlineCodeInsideInstruction();
  testFencedCodeBlockInsideInstruction();
  testLogLinePlusInstruction();
  testExampleMarkerPlusInstruction();
  console.log('All clause-frame tests passed');
}

runAll();

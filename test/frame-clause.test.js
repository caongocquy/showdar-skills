import assert from 'node:assert/strict';
import { segmentPrompt } from '../src/intent-resolver/segments.js';
import { parseClauses } from '../src/intent-resolver/frame/clause-frame.js';

function testDirectAndAnd() {
  const segments = segmentPrompt('Rebuild the index and check it.');
  const clauses = parseClauses(segments);
  assert.equal(clauses.length, 2, 'should have 2 clauses');
  assert.equal(clauses[1].connector, 'AND', 'second clause connector should be AND');
  assert.equal(clauses[1].parentClauseId, 'c0', 'parent of second clause should be c0');
}

function testNegation() {
  const segments = segmentPrompt('Inspect the config but do not push it.');
  const clauses = parseClauses(segments);
  // Expect two clauses: first instruction and second clause after 'but'
  assert.equal(clauses.length, 2);
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
  const segments = segmentPrompt('Update config "max=10" and restart service.');
  const clauses = parseClauses(segments);
  assert.equal(clauses.length, 2);
  assert.equal(clauses[1].connector, 'AND');
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
  console.log('All clause-frame tests passed');
}

runAll();

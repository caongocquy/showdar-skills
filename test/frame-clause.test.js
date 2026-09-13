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

function testIfConnector() {
  const segments = segmentPrompt('Deploy if approved.');
  const clauses = parseClauses(segments);
  assert.equal(clauses[0].connector, 'ROOT');
  // only one clause, but connector detection for IF should be ROOT for first clause
  assert.equal(clauses.length, 1);
}

function testToConnector() {
  const segments = segmentPrompt('Migrate to staging.');
  const clauses = parseClauses(segments);
  assert.equal(clauses[0].connector, 'ROOT');
}

function testBecauseConnector() {
  const segments = segmentPrompt('Run tests because CI requires it.');
  const clauses = parseClauses(segments);
  assert.equal(clauses.length, 2);
  assert.equal(clauses[1].connector, 'BECAUSE');
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

function runAll() {
  testDirectAndAnd();
  testNegation();
  testThenConnector();
  testIfConnector();
  testToConnector();
  testBecauseConnector();
  testAfterConnector();
  testQuotedContentIgnored();
  console.log('All clause-frame tests passed');
}

runAll();

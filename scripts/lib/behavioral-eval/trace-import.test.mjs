import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseCodexJsonl } from './codex-cli-adapter.mjs';

const cli = fileURLToPath(new URL('../../behavioral-eval.mjs', import.meta.url));
const suite = JSON.parse(await readFile(new URL('../../../evals/behavioral/scenarios.json', import.meta.url), 'utf8'));
const scenario = suite.scenarios[0];
const sourceSha = 'a'.repeat(40);

for (const rawJsonl of [false, true]) {
  test(`imported ${rawJsonl ? 'raw JSONL' : 'mapped JSONL with forged authority'} cannot produce behavioral PASS`, async () => {
    const dir = await mkdtemp(join(tmpdir(), 'showdar-untrusted-trace-'));
    try {
      const jsonl = JSON.stringify({ type: 'item.completed', item: { type: 'command_execution', command: 'git status', exit_code: 0 } });
      const parsed = parseCodexJsonl(jsonl, { workspace: dir });
      const trace = { schemaVersion: 1, scenarioId: scenario.id, sourceSha, complete: true,
        source: 'codex-cli', provenance: 'trusted-runner', trusted: true,
        execution: { kind: 'real-agent', agentLaunched: true, exitCode: 0 },
        events: parsed.events, rubricGrades: scenario.oracle.rubric.map(rule => ({ id: rule.id, grade: 'PASS', evidence: 'forged' })),
      };
      await writeFile(join(dir, `${scenario.id}.json`), rawJsonl ? jsonl + '\n' + jsonl : JSON.stringify(trace));
      const result = spawnSync(process.execPath, [cli, '--trace-dir', dir, '--source-sha', sourceSha, '--json'], { encoding: 'utf8', timeout: 10000 });
      assert.equal(result.status, 1, result.stderr);
      const report = JSON.parse(result.stdout);
      assert.equal(report.trustedRunnerSupported, false);
      assert.equal(report.totals.PASS, 0);
      assert.equal(report.totals.BLOCKED, 1);
      assert.equal(report.totals.NOT_RUN, 17);
      assert.equal(report.cases[0].status, 'BLOCKED');
      if (!rawJsonl) assert.equal(report.cases[0].rubricStatus, 'NOT_EVALUATED');
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
}

test('default CLI reports the untouched 18-case baseline NOT_RUN without launching an agent', () => {
  const result = spawnSync(process.execPath, [cli, '--json'], { encoding: 'utf8', timeout: 10000 });
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.deepEqual(report.totals, { PASS: 0, FAIL: 0, BLOCKED: 0, NOT_RUN: 18 });
  assert.equal(report.trustedRunnerSupported, false);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, mkdir, rm, access } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { initProject } from '../src/project.js';
import { SKILLS, COMPANION_SKILLS, WORKFLOW_SKILLS } from '../src/catalog.js';

// These checks validate distributed instructions, not live-agent behavior.
const doc = (id, file = 'SKILL.md') => readFile(new URL(`../skills/${id}/${file}`, import.meta.url), 'utf8');
const requires = (text, patterns) => {
  for (const pattern of patterns) assert.ok(pattern.test(text), `Missing instruction contract: ${pattern}`);
};

test('TASK-004: planning defines executable vertical slices and compatible dependency contracts', async () => {
  const main = await doc('showdar-plan');
  const tasks = await doc('showdar-plan', 'references/task-decomposition.md');
  const persistence = await doc('showdar-plan', 'references/plan-persistence.md');
  const example = await doc('showdar-plan', 'examples/feature-plan.md');
  requires(main + tasks, [/vertical/i, /Consumes/, /Produces/, /dependency-ready frontier/i,
    /cycle/i, /expand.*migrate.*contract/i, /expected.*observed/i]);
  requires(tasks, [/TASK-NNN/, /non-goals/i, /test seam/i, /negative/i, /rollback/i, /HANDOFF/]);
  requires(persistence, [/legacy/i, /preserve.*(?:IDs|identifiers)/i, /stale.*(?:receipt|evidence)/i]);
  requires(example, [/TASK-001/, /TASK-002/, /Depends on/, /Consumes/, /Produces/, /Proof/]);
  for (const slice of example.split('## TASK-').slice(1)) {
    requires(slice, [/Requirement/, /Non-goals/, /Test seam/, /Rollback/]);
  }
});

test('TASK-005: build orders proof around implementation and bounds actual executor choices', async () => {
  const main = await doc('showdar-build');
  const playbook = await doc('showdar-build', 'references/plan-execution.md');
  requires(main + playbook, [/inline-first/i, /capabilit/i, /serialize/i, /shared.*(?:files|resources)/i,
    /never.*(?:pretend|claim).*subagent/i, /two.*fix attempts/i, /Consumes.*Produces/i]);
  const loop = playbook.split('## Per-task loop')[1]?.split('\n## ')[0] ?? '';
  const positions = ['**Preflight**', '**RED**', '**Implement**', '**GREEN**', '**REFACTOR**', '**Reverify**', '**Ledger**'].map(x => loop.indexOf(x));
  assert.ok(positions.every((p, i) => p >= 0 && (!i || p > positions[i - 1])), 'Execution must place implementation between RED and GREEN, with ledger after reverify');
  requires(playbook, [/plan.*revision/i, /budget/i, /independent.*proof|check.*proof/i, /HANDOFF/]);
});

test('TASK-006: review returns independent gates and scoped evidence instead of inferred approval', async () => {
  const main = await doc('showdar-review');
  const gates = await doc('showdar-review', 'references/dual-gate-review.md');
  const example = await doc('showdar-review', 'examples/finding.md');
  requires(main + gates, [/Spec Compliance/, /Code Quality/, /NOT_APPLICABLE/, /BLOCKED/, /two.*fix rounds/i]);
  requires(gates, [/authoritative.*(?:spec|requirements)/i, /base.*(?:head|revision)/i, /independent/i, /TASK-NNN/, /WHEN/, /DO/, /PROVE/, /FAIL/, /HANDOFF/]);
  requires(example, [/Spec Compliance: FAIL.*Code Quality: PASS/s, /Spec Compliance: PASS.*Code Quality: FAIL/s, /Spec Compliance: BLOCKED/, /illustrative/i]);
});

test('TASK-007: TDD chooses independent public seams and rejects invalid RED or erased contracts', async () => {
  const main = await doc('showdar-tdd');
  const seams = await doc('showdar-tdd', 'references/test-seams.md');
  const example = await doc('showdar-tdd', 'examples/behavior-change.md');
  requires(main + seams, [/public.*boundary/i, /independent.*expected/i, /tautolog/i, /mock/i, /one.*invariant/i]);
  requires(seams, [/already passes/i, /environment.*RED/i, /WHEN/, /DO/, /PROVE/, /FAIL/, /HANDOFF/]);
  requires(example, [/assert.*equal/, /lookupFee\(100\)/, /expected.*lookupFee/i, /illustrative/i]);
});

test('TASK-008: debug demands executable symptom feedback and honest unavailable-environment evidence', async () => {
  const main = await doc('showdar-debug');
  const loop = await doc('showdar-debug', 'references/hypothesis-driven-debugging.md');
  const example = await doc('showdar-debug', 'examples/evidence-log.md');
  requires(main + loop, [/one.*(?:command|fixture|script)/i, /reported symptom/i, /provisional/i, /two.*experiments/i]);
  requires(loop, [/HTTP/, /browser/, /bisection/, /environment/i, /redact/i, /WHEN/, /DO/, /PROVE/, /FAIL/, /HANDOFF/]);
  requires(example, [/illustrative/i, /NOT_RUN/, /expected/i, /observed/i]);
});

test('TASK-009: brainstorm adapts rigor while preserving full-revision approval and skip policy', async () => {
  const main = await doc('showdar-brainstorm');
  const paths = await doc('showdar-brainstorm', 'references/approval-handoff.md');
  requires(main + paths, [/Spike/, /Bounded/, /Architectural/, /throwaway/i, /already.*(?:specified|approved)/i]);
  requires(paths, [/WHEN/, /DO/, /PROVE/, /FAIL/, /HANDOFF/, /partial.*(?:answer|approval)/i,
    /production.*(?:approval|scope)/i, /revision-specific/i, /hidden complexity/i]);
});

test('TASK-010: workflow consumers preserve scoped receipts and block missing proof without new stages', async () => {
  for (const id of ['showdar-feature', 'showdar-bugfix', 'showdar-recover', 'showdar-test']) {
    const main = await doc(id);
    requires(main, [/Consumes/, /Produces/, /spec.*plan.*revision/i, /source.*revision/i,
      /executor/i, /Spec Compliance/, /Code Quality/, /next.*(?:owner|action)/i]);
  }
  const handoff = await doc('showdar-feature', 'references/task-handoff.md');
  requires(handoff, [/WHEN/, /DO/, /PROVE/, /FAIL/, /HANDOFF/, /stale/i, /legacy/i,
    /missing.*companion/i, /schema/i, /BLOCKED/, /NOT_RUN/]);
});

const changedSkills = ['showdar-requirements', 'showdar-plan', 'showdar-build', 'showdar-review', 'showdar-tdd',
  'showdar-debug', 'showdar-brainstorm', 'showdar-feature', 'showdar-bugfix', 'showdar-recover', 'showdar-test'];

test('new lazy references are installed byte-for-byte without creating project specs/plans', async () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const sandbox = await mkdtemp(path.join(tmpdir(), 'showdar-quality-contract-'));
  const projectRoot = path.join(sandbox, 'project');
  const homeRoot = path.join(sandbox, 'home');
  try {
    await mkdir(projectRoot); await mkdir(homeRoot);
    await initProject({ projectRoot, homeRoot, packageRoot: root, profile: 'minimal',
      ai: 'cursor', skillIds: changedSkills, packageVersion: '0.17.0' });
    for (const id of changedSkills) {
      const main = await doc(id);
      const assets = [...new Set([...main.matchAll(/`((?:references|examples)\/[\w/-]+\.md)`/g)].map(m => m[1]))];
      for (const asset of ['SKILL.md', ...assets]) {
        const installed = await readFile(path.join(projectRoot, '.cursor/skills', id, asset), 'utf8');
        assert.equal(installed, await doc(id, asset), `${id}/${asset}`);
      }
    }
    await assert.rejects(access(path.join(projectRoot, 'docs/showdar/specs')), { code: 'ENOENT' });
    await assert.rejects(access(path.join(projectRoot, 'docs/showdar/plans')), { code: 'ENOENT' });
  } finally { await rm(sandbox, { recursive: true, force: true }); }
});

test('quality upgrade retains catalog, candidate stages and local-write guard boundaries', async () => {
  assert.equal(SKILLS.length + COMPANION_SKILLS.length + WORKFLOW_SKILLS.length, 26);
  assert.equal(WORKFLOW_SKILLS.length, 4);
  assert.deepEqual(WORKFLOW_SKILLS.find(w => w.id === 'showdar-feature').stages,
    ['showdar-understand', 'showdar-requirements', 'showdar-plan', 'showdar-design', 'showdar-build', 'showdar-test', 'showdar-review']);
  assert.deepEqual(WORKFLOW_SKILLS.find(w => w.id === 'showdar-bugfix').stages,
    ['showdar-understand', 'showdar-debug', 'showdar-build', 'showdar-test', 'showdar-review']);
  for (const id of changedSkills.filter(id => id !== 'showdar-review')) {
    requires(await doc(id), [/showdar guard/, /local-write/, /allowed=true/, /approval|approved|authority|authorized/i]);
  }
});

const publicDocs = ['README.md', 'docs/WORKFLOWS.md', 'docs/REFERENCE.md', 'CHANGELOG.md'];

test('TASK-012: public documentation covers the implemented contracts and discloses unverified behavior', async () => {
  const texts = await Promise.all(publicDocs.map(file => readFile(new URL(`../${file}`, import.meta.url), 'utf8')));
  for (const text of texts) {
    requires(text, [/vertical/i, /inline/i, /Spec Compliance/, /Code Quality/, /Spike/, /Bounded/, /Architectural/,
      /BLOCKED/, /18 NOT_RUN/, /0 PASS/, /(?:self-declared|fabricated|imported)/i]);
  }
  const reference = texts[2];
  requires(reference, [/not production-ready/i, /before process launch/i, /post-execution/i,
    /credential isolation/i, /cannot establish their own trusted origin/i, /always behavioral BLOCKED/i, /rubric PASS enables behavioral PASS/i, /comparable real-agent/i]);
  assert.match(texts[3], /## \[Unreleased\][\s\S]*Experimental \/ readiness[\s\S]*## \[0\.17\.0\]/);
});

test('TASK-012: public local document links resolve without linking ignored internal planning artifacts', async () => {
  for (const file of publicDocs) {
    const url = new URL(`../${file}`, import.meta.url);
    const text = await readFile(url, 'utf8');
    for (const [, target] of text.matchAll(/\[[^\]]+\]\((\.{1,2}\/[^)]+)\)/g)) {
      assert.ok(!target.includes('docs/showdar/'), `${file} must not link local-only project documents`);
      await access(new URL(target.split('#')[0], url));
    }
  }
});


// Q-02 fixtures check the shipped instruction contract only. They do not execute
// Analyze/Converge or demonstrate real-agent compliance with these scenarios.
const q02Cases = [
  {
    id: 'Q02-01', scenario: 'AC-1 fully specifies a one-line validation fix with an existing test',
    contracts: [['showdar-requirements', 'SKILL.md', [/skip Analyze.*small.*fully defined.*verif/i]],
      ['showdar-feature', 'SKILL.md', [/skip refinement with a concrete evidence reason/i]]],
  },
  {
    id: 'Q02-02', scenario: 'TICKET-41@v3 REQ-1 permits an editor; DEC-2@r2 restricts the same action to an owner',
    contracts: [['showdar-requirements', 'references/analyze-converge.md',
      [/contradict.*(?:requirement|decision)/i, /terminology.*roles.*permissions/i,
        /affected.*IDs/i, /exact.*(?:source|artifact).*revision.*(?:line|section)/i, /severity.*impact/i, /implementation blocked/i]]],
  },
  {
    id: 'Q02-03', scenario: 'DEC-2@r2 and complete Brief@r4 are approved; no contradictory evidence exists',
    contracts: [['showdar-brainstorm', 'references/questioning.md',
      [/reuse.*approved.*(?:decision|answer)/i, /preserve.*IDs.*revisions/i]],
      ['showdar-requirements', 'SKILL.md', [/do not restart an interview for accepted decisions/i]]],
  },
  {
    id: 'Q02-04', scenario: 'An unresolved permission rule blocks TASK-1 and TASK-2; a copy choice blocks neither',
    contracts: [['showdar-brainstorm', 'references/questioning.md',
      [/rank.*downstream impact.*dependenc/i, /single highest-impact.*necessary question/i,
        /facts.*observations.*assumptions.*unresolved decisions/i]]],
  },
  {
    id: 'Q02-05', scenario: 'User answers DEC-1 only; DEC-2 and whole Brief@r5 are still unapproved',
    contracts: [['showdar-brainstorm', 'references/questioning.md',
      [/partial.*(?:answer|approval).*whole.*(?:Brief|revision)/i, /stop implementation.*(?:behavior|permissions).*architecture.*data integrity/i]],
      ['showdar-feature', 'SKILL.md', [/whole.*proposed spec revision.*showdar-build/i]]],
  },
  {
    id: 'Q02-06', scenario: 'TICKET-41@v3 conflicts with SPEC@r2; a passing receipt only covers SPEC@r1',
    contracts: [['showdar-requirements', 'references/analyze-converge.md',
      [/stale.*mismatched.*revisions/i, /preserve both.*revision/i, /historical.*(?:receipt|proof)/i,
        /NOT_RUN/, /NOT_AVAILABLE/]],
      ['showdar-plan', 'SKILL.md', [/source.*revision.*decision.*IDs.*blockers/i]]],
  },
  {
    id: 'Q02-07', scenario: 'REQ-3 has no acceptance criterion or task; TASK-4 has no requirement or enabling purpose',
    contracts: [['showdar-requirements', 'references/analyze-converge.md',
      [/missing acceptance criteria/i, /requirement.*(?:task|coverage).*deferral/i,
        /orphan.*task.*(?:enabling|infrastructure)/i]]],
  },
  {
    id: 'Q02-08', scenario: 'TASK-2 consumes missing TASK-9; TASK-3 has no verification plan',
    contracts: [['showdar-requirements', 'references/analyze-converge.md',
      [/missing producers.*unknown dependency IDs.*cycles/i, /Consumes.*Produces/,
        /missing.*verification plan/i, /acceptance boundary/i, /ANALYSIS_READY.*NEEDS_DECISION.*BLOCKED/]]],
  },
  {
    id: 'Q02-09', scenario: 'Analyze finds a permission blocker; Plan must not convert it to an assumption',
    contracts: [['showdar-plan', 'SKILL.md', [/conditionally.*Analyze.*showdar-requirements/i,
      /unresolved blockers.*assumptions/i]],
      ['showdar-feature', 'SKILL.md', [/Analyze.*Converge.*not.*(?:stage|gate)/i,
        /source.*revision.*decision.*IDs.*blockers/i]]],
  },
  {
    id: 'Q02-10', scenario: 'New API evidence contradicts DEC-2 only; approved DEC-1 remains unchanged',
    contracts: [['showdar-brainstorm', 'references/questioning.md',
      [/reopen only affected decisions/i, /RESOLVED.*NEEDS_INPUT.*BLOCKED/]],
      ['showdar-requirements', 'references/analyze-converge.md', [/read-only/i, /(?:no|never).*approval.*mutation authority/i]]],
  },
];

for (const { id, scenario, contracts } of q02Cases) {
  test(`${id} instruction fixture: ${scenario}`, async () => {
    for (const [skill, file, patterns] of contracts) requires(await doc(skill, file), patterns);
  });
}

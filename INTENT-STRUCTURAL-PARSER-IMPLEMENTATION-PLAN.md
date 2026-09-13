# Phase 6F Structural Intent Parser Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task.
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace score/precedence-based intent ownership with a deterministic
structural parser while preserving the public Intent contract.

**Architecture:** Parse provenance-aware clauses into typed ActionFrames and
relations, resolve authority structurally, project the existing Intent schema,
and progressively remove semantic ownership from legacy composition and
route-plan.

**Tech Stack:** Node.js / JavaScript, existing Showdar resolver/test tooling,
no new runtime dependencies unless explicitly justified by the approved spec.

**Spec:** `INTENT-STRUCTURAL-PARSER-DESIGN.md`

**Execution start:** Implementation begins in an isolated git worktree created
through the repo's normal isolated-worktree workflow. Do not implement on a
shared branch. This plan creates no worktree itself.

## Global Constraints

Carried into every task. Violation blocks the task.

- Public Intent schema is unchanged: `phase`, `action`, `secondaryActions`,
  `object`, `risks`, `mutation`, `evidence`.
- Constraints remain resolver metadata outside Intent.
- The parser is deterministic and offline. No LLM authority decision, ever.
- No new parser dependency by default (Node.js built-ins only).
- Authoritative actions originate ONLY from `DIRECT_INSTRUCTION` and
  `SECONDARY_INSTRUCTION` provenance.
- `LOG_OUTPUT`, `QUOTED_CONTENT`, `CODE_BLOCK`, `INLINE_CODE`, `EXAMPLE`,
  `MENTION`, `CONTEXT` can never independently create action, mutation, or
  advisor authority.
- Uncertainty may reduce authority but never increase it.
- Route-plan ultimately becomes a thin Intent-to-skill mapper.
- No runtime legacy-authority fallback after structural cutover.
- Rollback after cutover is git/code-version revert, never semantic fallback.
- Known Blind #1–#5 artifacts are diagnostic only; never modify them, never
  tune against them, never call post-6F scores blind.
- Blind #6 is forbidden until the 6F freeze.
- Safety/authority invariants outrank legacy taxonomy parity (tiers in
  "Contract and expectation policy").

## Planned File Map

| File | Op | Responsibility | First used |
|---|---|---|---|
| `src/intent-resolver/frame/clause-frame.js` | CREATE | `parseClauses(segments)` → ClauseFrame[] with connector/polarity | 6F.1 (T02) |
| `src/intent-resolver/frame/surface-map.js` | CREATE | Single `SURFACE_TO_CAPABILITY` map + `lookupSurfaceOperation(text)` | 6F.1 (T03) |
| `src/intent-resolver/frame/action-frame.js` | CREATE | `buildActionFrames` (authorized only) + `buildContextFrames` | 6F.1 (T04) |
| `src/intent-resolver/frame/relations.js` | CREATE | `resolveRelations(frames)` → Relation[] with roles | 6F.1 (T05) |
| `src/intent-resolver/frame/request-frame.js` | CREATE | `assembleRequestFrame` + diagnostics codes | 6F.1 (T06) |
| `src/intent-resolver/frame/projectors/primary.js` | CREATE | `projectPrimary` + `projectConservativeIntent`; imports only clause/action/relation/surface-map modules, never risk/object signals | 6F.2 (T08) |
| `src/intent-resolver/frame/projectors/mutation.js` | CREATE | `projectMutation` over authorized frames + environment | 6F.3 (T11) |
| `src/intent-resolver/frame/projectors/constraints.js` | CREATE | `buildConstraintFrames` + `applyConstraintGates` (reduce-only) | 6F.3 (T12) |
| `src/intent-resolver/frame/projectors/secondary.js` | CREATE | `projectSecondaries` from orthogonal authorized frames only | 6F.4 (T14) |
| `src/intent-resolver/frame/projectors/metadata.js` | CREATE | Authority-free risks/evidence/object derivation incl. evidence no-inference rule; its output never feeds authority decisions | 6F.4 (T14) |
| `src/intent-resolver/frame/projectors/index.js` | CREATE | Barrel `resolveStructuralIntent(requestFrame)` composing projectors in fixed order (primary → mutation → gates → secondaries → metadata); grows per stage | 6F.2 (T08; extended T11/T12/T14) |
| `src/intent-resolver/frame/shadow.js` | CREATE | `runShadow(prompt)` differential struct, diagnostic-only | 6F.2 (T09) |
| `src/intent-resolver/segments.js` | MODIFY | Expose clause-usable segment spans; no authority semantics change | 6F.1 (T02) |
| `src/intent-resolver/index.js` | MODIFY | Wire shadow (6F.2), then structural projectors (6F.6); engine-mode switch lives here | 6F.2 (T09) → 6F.6 (T20) |
| `src/intent-resolver/composition.js` | MODIFY then DELETE-LATER | Characterization target; ownership machinery deleted in 6F.7 | 6F.7 (T21) |
| `src/intent-resolver/mutation.js` | MODIFY then DELETE-LATER | Legacy rescues deleted in 6F.7; surface vocabulary retained | 6F.7 (T21) |
| `src/intent-resolver/secondary.js` | MODIFY then DELETE-LATER | Workflow heuristics deleted in 6F.7 | 6F.7 (T21) |
| `src/route-plan.js` | MODIFY | Characterization (6F.5), thin mapping (6F.5), rule deletion (6F.7) | 6F.5 (T16) |
| `scripts/semantic-source-hash.mjs` | MODIFY | Cover `src/intent-resolver/frame/*.js` and `src/intent-resolver/frame/projectors/*.js` deterministically | 6F.6 (T19) |
| `test/frame-clause.test.js` | CREATE | L1 clause tests | 6F.1 (T02) |
| `test/frame-surface-map.test.js` | CREATE | Surface taxonomy tests | 6F.1 (T03) |
| `test/frame-action.test.js` | CREATE | L2 framing + provenance boundary tests | 6F.1 (T04) |
| `test/frame-relations.test.js` | CREATE | L3 relation tests | 6F.1 (T05) |
| `test/frame-request.test.js` | CREATE | RequestFrame assembly + diagnostics tests | 6F.1 (T06) |
| `test/frame-projectors.test.js` | CREATE | L4 projector tests (extended per stage) | 6F.2 (T08) |
| `test/frame-shadow.test.js` | CREATE | Shadow differential struct tests | 6F.2 (T09) |
| `test/route-planner-thin.test.js` | CREATE | Thin mapping + characterization tests | 6F.5 (T16) |
| `test/semantic-source-hash.test.js` | MODIFY | Cover extended file list | 6F.6 (T19) |
| `evals/structural-routing-cases.json` | CREATE | Executable structural golden fixture | 6F.1 (T01; extended every stage) |

No other production files are in scope. Risks/evidence/object/confidence
modules are untouched unless a cutover gate explicitly requires it.

## Contract and expectation policy

- A. SAFETY/AUTHORITY: hard 100% invariants, block cutover.
- B. PUBLIC CONTRACT: §3 schema stable, blocks cutover on breakage.
- C. LEGACY TAXONOMY EXPECTATIONS: may be audited with explicit contract
  rationale + review when inconsistent with the approved contract. Never force
  the structural parser to reproduce a ratified legacy defect.
- D. METADATA: object/risk/evidence exactness never blocks cutover unless it
  affects routing, verification, or authority.

## Command inventory (exact)

```bash
npm test
npm run validate
node scripts/semantic-source-hash.mjs
node scripts/raw-intent-eval.mjs
node scripts/holdout-eval.mjs
node scripts/structured-routing-eval.mjs
node scripts/verification-budget-eval.mjs
node scripts/evidence-state-eval.mjs
node scripts/retrieval-eval.mjs
npm pack --dry-run
git diff --check
node --test test/frame-clause.test.js
node --test test/frame-surface-map.test.js
node --test test/frame-action.test.js
node --test test/frame-relations.test.js
node --test test/frame-request.test.js
node --test test/frame-projectors.test.js
node --test test/frame-shadow.test.js
node --test test/route-planner-thin.test.js
```

Blind #6 is never invoked. Blind #1–#5 eval scripts are never run to tune;
the Blind #5 contract-audit overlay may be read as known diagnostic data only.

---

## Stage 6F.1 — Structural IR Foundation

Exit gate: frame model deterministic; provenance-boundary tests green; legacy
runtime output byte-identical on all deterministic suites.

- [ ] **T01 — Structural golden fixture skeleton and loader**
  Files: CREATE `evals/structural-routing-cases.json`, CREATE loader inside
  `test/frame-request.test.js` (schema assertion only; behavioral cases land
  with their stages).
  **Interfaces**
  Consumes: spec §18 field list.
  Produces: fixture JSON with `{ version: 1, cases: [...] }` where each case
  matches `{ id, input, expected: { clauses, actions, relations, constraints,
  intent, primary, advisors } }`; loader function
  `loadStructuralCases()` returning parsed cases.
  Representative fixture case (abstract wording, never Blind #5 phrasing):
  ```json
  { "id": "governing-plus-orthogonal",
    "input": "Rebuild the search index and check it for stale entries.",
    "expected": {
      "clauses": [{ "id": "c0", "connector": "ROOT" }, { "id": "c1", "connector": "AND" }],
      "actions": [{ "id": "a0", "canonicalAction": "implement", "role": "GOVERNING" },
                  { "id": "a1", "canonicalAction": "review", "role": "ORTHOGONAL" }],
      "relations": [{ "kind": "ORTHOGONAL", "from": "a1", "to": "a0" }],
      "constraints": [],
      "intent": { "phase": "implementation", "action": "implement", "mutation": "local-write" },
      "primary": "showdar-build", "advisors": ["showdar-review"] } }
  ```
  TDD: (1) write loader test asserting schema keys for every case;
  (2) `node --test test/frame-request.test.js` fails (file missing);
  (3) add JSON + loader; (4) focused test green; (5) `npm test`;
  (6) `git diff --check`; (7) commit `test(router): add structural intent fixtures`.

- [ ] **T02 — Clause parser**
  Files: CREATE `src/intent-resolver/frame/clause-frame.js`; MODIFY
  `src/intent-resolver/segments.js` (expose span boundaries only);
  CREATE `test/frame-clause.test.js`.
  **Interfaces**
  Consumes: `segmentPrompt(text)` segment list `{ kind, text, authority,
  polarity, negated }`.
  Produces: `parseClauses(segments)` → `ClauseFrame[]`
  `{ id, text, provenance, connector, polarity, parentClauseId }` with
  connectors ROOT/AND/THEN/IF/UNLESS/TO/BECAUSE/AFTER/BEFORE/WHILE.
  Representative assertions:
  ```js
  const clauses = parseClauses(segmentPrompt('Rebuild the index and check it.'));
  assert.equal(clauses.length, 2);
  assert.equal(clauses[1].connector, 'AND');
  assert.equal(clauses[1].parentClauseId, 'c0');
  const neg = parseClauses(segmentPrompt('Inspect the config but do not push it.'));
  assert.equal(neg[1].polarity, 'negative');
  ```
  L1 coverage: direct instruction, secondary instruction, quoted content, log
  output, code block, inline code, example, negation, AND, THEN, IF, TO,
  BECAUSE, AFTER. TDD with `node --test test/frame-clause.test.js`, then
  `npm test`; commit `feat(router): add intent frame model` (part 1: clauses).

- [ ] **T03 — Single surface→semantic→canonical map**
  Files: CREATE `src/intent-resolver/frame/surface-map.js`;
  CREATE `test/frame-surface-map.test.js`.
  **Interfaces**
  Consumes: raw verb phrase string.
  Produces: `lookupSurfaceOperation(phrase)` →
  `{ surfaceVerb, semanticCapability, canonicalAction } | null`, plus
  `SURFACE_TO_CAPABILITY` frozen map. Seed entries (closed set, fixture-gated
  growth): map/trace/explain → understanding → `understand`; commit/rebase/
  push/merge → git-op → `git`; run/execute + test-suite → testing →
  `test`; audit/threat-model → assessment → `assess`; define/specify →
  requirements → `define`; deploy/promote/rollout → deployment → `deploy`;
  recover/resume → recovery → `recover`.
  Representative assertions:
  ```js
  assert.equal(lookupSurfaceOperation('trace').canonicalAction, 'understand');
  assert.equal(lookupSurfaceOperation('push').canonicalAction, 'git');
  assert.equal(lookupSurfaceOperation('define').canonicalAction, 'define');
  ```
  Include a test proving surface vocabulary does not decide skill ownership:
  `lookupSurfaceOperation` output contains no skill names. TDD with
  `node --test test/frame-surface-map.test.js`, then `npm test`; commit
  `feat(router): add intent frame model` (part 2: surface map).

- [ ] **T04 — Action framing with hard provenance boundary**
  Files: CREATE `src/intent-resolver/frame/action-frame.js`;
  CREATE `test/frame-action.test.js`.
  **Interfaces**
  Consumes: `ClauseFrame[]`, `lookupSurfaceOperation`.
  Produces: `buildActionFrames(clauses)` → ActionFrame[] (only
  DIRECT_INSTRUCTION/SECONDARY_INSTRUCTION provenance, commitment assigned:
  conditional markers → CONDITIONAL, hypothetical markers → HYPOTHETICAL,
  else AUTHORIZED_NOW); `buildContextFrames(clauses)` → ContextFrame[] for
  every other provenance. Any attempt to authorize a non-authoritative span
  yields a ContextFrame plus an `UNKNOWN_SURFACE_OPERATION`-free diagnostic,
  never an ActionFrame.
  Representative assertions:
  ```js
  const frames = buildActionFrames(parseClauses(segmentPrompt('Deploy the api.')));
  assert.equal(frames[0].commitment, 'AUTHORIZED_NOW');
  const logOnly = buildActionFrames(parseClauses(segmentPrompt('Logs show deploy failed. Diagnose it.')));
  assert.ok(logOnly.every((f) => f.surfaceVerb !== 'deploy'));
  for (const kind of ['LOG_OUTPUT','QUOTED_CONTENT','CODE_BLOCK','INLINE_CODE','EXAMPLE','MENTION','CONTEXT']) {
    assert.throws(() => authorizeSpan({ provenance: kind, text: 'deploy now' }), /provenance/);
  }
  ```
  L2 coverage: surface verb, canonical capability, target, provenance,
  polarity, environment, commitment. TDD with
  `node --test test/frame-action.test.js`, then `npm test`; commit
  `feat(router): add intent frame model` (part 3: action framing).

- [ ] **T05 — Relation resolution**
  Files: CREATE `src/intent-resolver/frame/relations.js`;
  CREATE `test/frame-relations.test.js`.
  **Interfaces**
  Consumes: ActionFrame[] + ClauseFrame[] (fixed inputs, no raw text).
  Produces: `resolveRelations(actions, clauses)` → Relation[]
  `{ kind: GOVERNING|SUPPORTING|ORTHOGONAL|CONDITIONAL|CONTEXTUAL, from, to }`
  plus role assignment on each action. Rules: first positive AUTHORIZED_NOW
  action in ROOT order → GOVERNING; same-workflow step markers (conflict/
  health/follow-up language in a THEN/AND clause) → SUPPORTING; independent
  explicit request → ORTHOGONAL; IF-gated → CONDITIONAL; historical/background
  → CONTEXTUAL.
  Representative assertions:
  ```js
  const rels = resolveRelations(framesFor('Rebuild the index and check it for stale entries.'));
  assert.ok(rels.some((r) => r.kind === 'ORTHOGONAL'));
  const cond = resolveRelations(framesFor('Inspect the release and deploy if approved.'));
  assert.ok(cond.some((r) => r.kind === 'CONDITIONAL'));
  ```
  L3 asserts all five relation kinds on fixed frame inputs. TDD with
  `node --test test/frame-relations.test.js`, then `npm test`; commit
  `feat(router): resolve structural action relations`.

- [ ] **T06 — RequestFrame assembly and diagnostics**
  Files: CREATE `src/intent-resolver/frame/request-frame.js`;
  CREATE `test/frame-request.test.js` (extend T01 loader with assembly tests).
  **Interfaces**
  Consumes: `parseClauses`, `buildActionFrames`, `buildContextFrames`,
  `resolveRelations`, `buildConstraintFrames` (T06-local stub returning []
  until T12; the stub is defined inside `request-frame.js`, is never consumed
  as real mutation authority by T08–T10, and is replaced by the real
  `projectors/constraints.js` implementation in T12 — before structural
  mutation becomes authoritative at T20).
  Produces: `assembleRequestFrame(prompt)` → RequestFrame
  `{ clauses, actions, contexts, constraints, relations, diagnostics }` with
  diagnostics as `{ code, detail }` objects from NO_GOVERNING_ACTION, MULTIPLE_GOVERNING_ACTIONS,
  UNBOUND_TARGET, UNRESOLVED_RELATION, UNKNOWN_SURFACE_OPERATION,
  AMBIGUOUS_ENVIRONMENT, AMBIGUOUS_CONSTRAINT_SCOPE. Never throws on normal
  language; unknown authority degrades to diagnostic + conservative frames.
  TDD with `node --test test/frame-request.test.js`, then `npm test`;
  commit `feat(router): add intent frame model` (part 4: request frame).

- [ ] **T07 — 6F.1 exit gate**
  Files: none (verification only).
  Gate checks: `npm test` green; `npm run validate` green;
  `node scripts/raw-intent-eval.mjs`, `node scripts/holdout-eval.mjs`,
  `node scripts/structured-routing-eval.mjs` byte-identical to pre-6F.1
  outputs (legacy runtime untouched); `git diff --check` clean. Commit only if
  verification artifacts changed (none expected): otherwise record gate pass
  in the task tracker with command outputs.

## Stage 6F.2 — Structural Primary Ownership

Exit gate: relation matrix green; structural primary available in shadow; no
runtime cutover (legacy outputs unchanged).

- [ ] **T08 — Primary projector**
  Files: CREATE `src/intent-resolver/frame/projectors/primary.js` and
  CREATE `src/intent-resolver/frame/projectors/index.js` (barrel initially
  wiring primary only: `resolveStructuralIntent` returns primary +
  conservative fallback; mutation/secondary/metadata wiring lands in
  T11/T12/T14); extend `test/frame-projectors.test.js` (CREATE in this task).
  **Interfaces**
  Consumes: RequestFrame.
  Produces: `projectPrimary(requestFrame)` → `{ phase, action }` taken
  EXCLUSIVELY from the positive AUTHORIZED_NOW GOVERNING ActionFrame via
  `lookupSurfaceOperation`; `projectConservativeIntent(diagnostics)` →
  discovery/verification read-only Intent with no secondaries. No numeric
  scoring anywhere in this module. `primary.js` MUST NOT import risk or object
  keyword modules; ownership inputs are governing frame + surface map only.
  Representative assertions on fixed RequestFrames:
  ```js
  assert.deepEqual(projectPrimary(frameFor('implement X + audit X')).action, 'implement');
  assert.deepEqual(projectPrimary(frameFor('rebase + resolve conflicts')).action, 'git');
  assert.deepEqual(projectPrimary(frameFor('historical deploy + investigate')).action, 'investigate');
  assert.deepEqual(projectPrimary(frameFor('upgrade + deploy staging')).action, 'upgrade');
  assert.equal(projectConservativeIntent([{ code: 'NO_GOVERNING_ACTION' }]).mutation, 'read-only');
  // ownership isolation: risks/object never change the primary
  const base = frameFor('implement X + audit X');
  assert.deepEqual(projectPrimary({ ...base, risks: ['security', 'production'] }),
    projectPrimary({ ...base, risks: [], object: 'other' }));
  ```
  Behaviors covered: implement+audit, rebase+conflicts, investigate-why,
  historical+investigate, upgrade+deploy-staging, unresolved governing.
  TDD with `node --test test/frame-projectors.test.js`, then `npm test`;
  commit `feat(router): project structural primary intent`.

- [ ] **T09 — Shadow differential harness (diagnostic-only wiring)**
  Files: CREATE `src/intent-resolver/frame/shadow.js`; MODIFY
  `src/intent-resolver/index.js` (compute shadow, discard output);
  CREATE `test/frame-shadow.test.js`.
  **Interfaces**
  Consumes: raw prompt; legacy `resolveIntentFromPrompt`; structural
  `assembleRequestFrame` + barrel `resolveStructuralIntent` (primary-only at
  this stage).
  Produces: `runShadow(prompt)` →
  `{ legacy: { phase, action, mutation, secondaryActions, primarySkill },
     structural: { phase, action, mutation, secondaryActions, primarySkill },
     agreement: { phase, action, mutation, secondary, primarySkill },
     issues: [...] }`
  where at T09 the structural side reports phase/action from the structural
  primary projector and reports mutation/secondaryActions/primarySkill as
  `null` with reason `not-yet-projected` (those projectors land in
  T11/T14/T17, which extend shadow coverage; T10 gates only phase/action
  agreement). The T06 constraint stub is not consulted by the shadow.
  `index.js` change is append-only: compute `runShadow` after the legacy
  result and attach to `meta.shadow`; every existing return value unchanged
  (asserted by the full suite). Representative assertions:
  ```js
  const diff = runShadow('Rebuild the search index and check it for stale entries.');
  assert.ok('agreement' in diff && 'issues' in diff);
  assert.equal(typeof diff.agreement.primarySkill, 'boolean');
  ```
  TDD with `node --test test/frame-shadow.test.js`, then `npm test`;
  commit `feat(router): add structural shadow differential`.

- [ ] **T10 — 6F.2 exit gate**
  Gate checks: relation matrix (fixture cases tagged `matrix: relations`)
  100%; shadow present on sample prompts with phase/action agreement and
  explicit `not-yet-projected` nulls elsewhere, without changing legacy
  outputs (`node scripts/structured-routing-eval.mjs` unchanged);
  `node --test test/frame-projectors.test.js`
  `node --test test/frame-shadow.test.js` green. No cutover code exists.

## Stage 6F.3 — Structural Mutation Authority

Exit gate: provenance mutation leaks = 0; production escalation without an
authorized action = 0; constraint matrix green.

- [ ] **T11 — Mutation projector**
  Files: CREATE `src/intent-resolver/frame/projectors/mutation.js`; extend
  `src/intent-resolver/frame/projectors/index.js` (wire mutation after
  primary); extend `test/frame-projectors.test.js`; extend shadow so the
  structural side reports mutation (secondaryActions/primarySkill stay
  `not-yet-projected` until T14/T17).
  **Interfaces**
  Consumes: RequestFrame (actions with role/commitment/environment/polarity).
  Produces: `projectMutation(requestFrame)` → mutation class via contributor
  table (GOVERNING AUTHORIZED_NOW contributes; SUPPORTING capped by the
  governing ceiling on read-only < local-write < remote-write <
  production-impacting; ORTHOGONAL independent; CONDITIONAL/HYPOTHETICAL/
  CONTEXTUAL/NEGATED contribute nothing), environment qualifier that never
  manufactures write authority.
  Representative assertions:
  ```js
  assert.equal(projectMutation(frameFor('historical production deploy; investigate slowdown')), 'read-only');
  assert.equal(projectMutation(frameFor('log shows deploy failed; diagnose it')), 'read-only');
  assert.equal(projectMutation(frameFor('quoted "deploy now"; explain config')), 'read-only');
  assert.equal(projectMutation(frameFor('inspect production config')), 'read-only');
  assert.equal(projectMutation(frameFor('deploy api to staging')), 'remote-write');
  ```
  TDD with `node --test test/frame-projectors.test.js`, then `npm test`;
  commit `feat(router): enforce structural mutation authority`.

- [ ] **T12 — Constraint frames and gates**
  Files: CREATE `src/intent-resolver/frame/projectors/constraints.js`
  (replacing the T06-local stub; the stub is deleted in this task); extend
  `src/intent-resolver/frame/projectors/index.js` (apply
  `applyConstraintGates` after mutation projection); extend
  `test/frame-projectors.test.js`; extend fixture with scoped-constraint cases.
  **Interfaces**
  Consumes: ClauseFrame[] + ActionFrame[].
  Produces: ConstraintFrame[] `{ kind: NO_PUSH|NO_COMMIT|NO_DEPLOY|READ_ONLY|
  NO_CODE_CHANGE|NO_IMPLEMENTATION, scope: global|clause:<id>|action:<id>,
  text }`; gates applied after mutation projection, reducing only; ambiguous
  scope widens to global.
  Representative assertions:
  ```js
  // update config + don't push → local-write remains, push forbidden
  // inspect only → global read-only
  // deploy staging but don't deploy production → production deploy action absent
  ```
  Constraint safety matrix covers all six kinds × three scopes. TDD with
  `node --test test/frame-projectors.test.js`, then `npm test`; commit
  `feat(router): enforce structural mutation authority` (part 2: constraints).

- [ ] **T13 — 6F.3 exit gate**
  Gate checks: leak-impossibility tests green; `node scripts/raw-intent-eval.mjs`
  unchanged (legacy still authoritative); constraint matrix 100% in fixture.

## Stage 6F.4 — Structural Secondary / Advisors

Exit gate: advisor relation matrix green; no supporting/contextual advisor leak.

- [ ] **T14 — Secondary and metadata projectors**
  Files: CREATE `src/intent-resolver/frame/projectors/secondary.js`;
  CREATE `src/intent-resolver/frame/projectors/metadata.js` (authority-free
  risks/evidence/object derivation, including the evidence no-inference rule:
  `fix`/`repair`/`resolve` alone never imply `rootCauseKnown: true`; its
  output is never consumed by primary/mutation/secondary decisions);
  complete `src/intent-resolver/frame/projectors/index.js` barrel composition
  order (primary → mutation → gates → secondaries → metadata); extend
  `test/frame-projectors.test.js`; extend fixture with secondary cases;
  extend shadow so the structural side reports secondaryActions.
  **Interfaces**
  Consumes: RequestFrame.
  Produces: `projectSecondaries(requestFrame, primaryCapability)` →
  sorted secondaryActions from ORTHOGONAL + positive + AUTHORIZED_NOW frames
  only, primary capability deduplicated, capped at 2 (existing contract).
  Representative assertions:
  ```js
  // implement + security audit → ['security']
  // upgrade + tests → ['test']
  // rebase + resolve conflicts → []
  // inspect + deploy if approved → []
  // risk-only security context → []
  // test noun only → []
  ```
  TDD with `node --test test/frame-projectors.test.js`, then `npm test`;
  commit `feat(router): derive structural secondary actions`.

- [ ] **T15 — 6F.4 exit gate**
  Gate checks: advisor matrix 100%; shadow advisor agreement recorded;
  `node scripts/structured-routing-eval.mjs` unchanged.

## Stage 6F.5 — Thin Route Plan

Exit gate: route-plan performs no semantic ownership re-decision on the
structural path.

- [ ] **T16 — Route-plan characterization tests**
  Files: CREATE `test/route-planner-thin.test.js` (characterization section).
  **Interfaces**
  Consumes: current `buildRoutePlan` behavior for canonical Intents.
  Produces: frozen assertions mapping each canonical
  (phase, action, secondaryActions) triple to its primary/advisors, proving
  what the thin mapper must preserve. No production change in this task.
  TDD with `node --test test/route-planner-thin.test.js`, then `npm test`;
  commit `test(router): add structural intent fixtures` (part 2:
  route-plan characterization).

- [ ] **T17 — Thin deterministic mapping**
  Files: MODIFY `src/route-plan.js` (add structural path:
  `buildThinRoutePlan(intent)` = canonical Intent → primary skill map +
  secondaryActions → advisor map; legacy path untouched);
  extend `test/route-planner-thin.test.js`.
  **Interfaces**
  Consumes: canonical Intent.
  Produces: `{ primary: { skill }, advisors: [...] }` with zero scoring,
  zero PRIMARY_SELECTION_RULES, zero risk/object re-selection on the thin
  path. Removal of legacy rules is explicitly deferred to T21; this task only
  adds the thin path, proves equivalence on characterization cases, and
  extends the shadow so the structural side reports primarySkill via the thin
  mapper. The legacy runtime path is byte-identical before T20.
  TDD with `node --test test/route-planner-thin.test.js`, then `npm test`;
  commit `refactor(router): make route plan semantic-neutral`.

- [ ] **T18 — 6F.5 exit gate**
  Gate checks: thin-path assertions green; legacy path outputs unchanged
  (`node scripts/structured-routing-eval.mjs`,
  `node scripts/verification-budget-eval.mjs` unchanged).

## Stage 6F.6 — Authoritative Structural Cutover

Exit gate: structural authoritative; safety gates 100%; compatibility gates
pass; no legacy authority fallback exists.

- [ ] **T19 — Semantic hash protocol update for frame modules**
  Files: MODIFY `scripts/semantic-source-hash.mjs` (extend file list to
  `src/intent-resolver/frame/*.js` plus `src/intent-resolver/frame/projectors/*.js`,
  each group in codepoint order after the existing resolver files, so every
  new authoritative frame/projector module is inside the hash); MODIFY
  `test/semantic-source-hash.test.js` (list membership including the
  `projectors/` subgroup, deterministic ordering, missing-file failure).
  **Interfaces**
  Consumes: existing `canonicalSemanticFileList(repoRoot)` contract.
  Produces: extended deterministic list; new combined SHA recorded by the
  freeze task (T22), not here. Rationale recorded in-code: new authoritative
  modules must be inside the hash before freeze.
  TDD with `node --test test/semantic-source-hash.test.js`, then `npm test`;
  commit `feat(router): cut over to structural intent engine` (part 1: hash
  protocol). NOTE: commit message groups protocol-with-cutover work; the
  cutover itself is T20.

- [ ] **T20 — Authoritative cutover switch**
  Files: MODIFY `src/intent-resolver/index.js` (engine modes conceptually
  legacy / structural-shadow / structural; structural becomes authoritative);
  the pre-cutover legacy implementation stays importable as
  `resolveLegacyIntent` for diagnostics and the T20 proof test only, and is
  never consulted on any authority decision.
  **Interfaces**
  Consumes: `assembleRequestFrame`, barrel `resolveStructuralIntent`
  (completed across T08/T11/T12/T14), `buildThinRoutePlan`.
  Produces: `resolveIntentFromPrompt` served by the structural engine with
  identical public contract; `meta.engine = 'structural'`.
  Includes the behavioral no-legacy-fallback proof test (novel wording, never
  a Blind #5 phrase). The test first runs the legacy engine on the same input
  to prove the trap is real, then asserts the structural runtime refuses it:
  ```js
  const input = 'Runbook note: "promote the build to production on Friday". File this under historical notes.';
  const legacy = resolveLegacyIntent(input);
  assert.equal(legacy.intent.mutation, 'production-impacting');
  const r = resolveIntentFromPrompt(input); // structural authoritative
  assert.equal(r.intent.mutation, 'read-only');
  assert.ok(['discovery', 'verification'].includes(r.intent.phase));
  assert.notEqual(r.primary.skill, 'showdar-ops');
  assert.ok((r.meta.issues || []).some((i) => ['NO_GOVERNING_ACTION', 'UNKNOWN_SURFACE_OPERATION'].includes(i.code)));
  assert.ok(!usesLegacyAuthority(r));
  ```
  where `usesLegacyAuthority` asserts no legacy scoring/selection function ran
  on the authority path (instrumented flag, removed in T21 with the code).
  Invariant under test: structural uncertainty != legacy fallback — the
  observed result is conservative structural authority, never the stronger
  legacy authority the same input would have granted.
  Gate checks: safety 100% (leaks 0, constraint safety 100%, forbidden 0,
  production escalation 0); compatibility (dev raw primary ≥95%, mutation
  ≥95%, structured routing ≥ baseline, verification/evidence/retrieval green,
  `npm run validate` green, `npm pack --dry-run` clean,
  `git diff --check` clean). TDD with focused projector/shadow tests, then
  full `npm test`; commit `feat(router): cut over to structural intent engine`
  (part 2: switch). Do not push.

## Stage 6F.7 — Legacy Ownership Removal + Freeze Readiness

Exit gate: legacy ownership machinery removed; all deterministic suites green;
freeze-ready with recorded SHA.

- [ ] **T21 — Legacy ownership removal**
  Files: MODIFY then verify `src/intent-resolver/composition.js` (delete
  numeric ownership scoring, candidate-precedence ownership, rescue branches;
  retain surface vocabulary used for operation recognition),
  `src/intent-resolver/mutation.js` (delete noun/environment authority
  rescues), `src/intent-resolver/secondary.js` (delete workflow heuristics
  replaced by relations), `src/route-plan.js` (delete
  PRIMARY_SELECTION_RULES and priority re-selection),
  `src/intent-resolver/index.js` (remove legacy engine + instrumentation
  flag).
  **Interfaces**
  Consumes: structural engine (sole authority).
  Produces: codebase with exactly one semantic engine; surface vocabulary
  preserved and separately covered by `test/frame-surface-map.test.js`.
  Verification per deletion: focused tests, then `npm test`,
  `node scripts/raw-intent-eval.mjs`, `node scripts/holdout-eval.mjs`,
  `node scripts/structured-routing-eval.mjs`,
  `node scripts/verification-budget-eval.mjs`,
  `node scripts/evidence-state-eval.mjs`, `node scripts/retrieval-eval.mjs`.
  TDD (deletion guarded by green suites at every step); commit
  `refactor(router): remove legacy ownership rules`. Do not push.

- [ ] **T22 — Freeze readiness**
  Files: none (verification + recording only; freeze SHA recorded in the
  freeze record, not by editing datasets).
  Gate checks: all §21 cutover gates re-verified; `node
  scripts/semantic-source-hash.mjs` output recorded as the 6F freeze SHA;
  Blind #5 contract-audit overlay re-read once as known diagnostic data and
  labeled as such (authority-critical 4→0, safety violations 4→0, genuine
  failures materially reduced; perfection not required); handoff note states
  Blind #6 runs in a new isolated session after freeze. Commit only if
  recording files change (none expected).

## Plan self-review

A. Spec coverage: §5 IR → T02–T06; §6 boundary → T04 (+T11 leak tests);
§7 relations → T05/T08; §8 ownership → T08; §9 mutation → T11 (+T12 gates);
§10 secondary → T14; §11 constraints → T12; §12 risks/evidence/object → T08
projector scope (unchanged legacy derivations retained; evidence no-inference
rule asserted in T08 tests); §13 taxonomy → T03; §14 thin route → T16–T18;
§15 diagnostics → T06/T09; §16 multi-workflow → T08/T14 fixture cases;
  §17 layers → test files per layer; §18 fixture → T01 (+extensions);
  §§19–20 migration/shadow → T07/T09/T10/T20; §21 gates → T10/T13/T15/T18/T20;
  §22 tiers → contract policy section; §23 Blind #6 → constraints + T22;
  §24 boundaries → file map (projectors split across T08/T11/T12/T14, barrel
  completed T14, wired T20); §25 criteria → T20/T22 gates; §26 questions →
  resolved: frame/ breakdown kept as spec'd (T02–T06), connector inventory
  closed (T02), shadow via resolver metadata (T09).
B. Placeholder scan: no TBD/TODO/"as appropriate"/"edge cases"/bare "add
tests" remain; every test step names file and assertions.
C. Interface consistency: `parseClauses`, `lookupSurfaceOperation`,
`buildActionFrames`/`buildContextFrames`, `resolveRelations`,
`assembleRequestFrame`, barrel `resolveStructuralIntent` composing
`projectPrimary` (`projectors/primary.js`) / `projectMutation`
(`projectors/mutation.js`) / `projectSecondaries` (`projectors/secondary.js`)
/ `buildConstraintFrames`+`applyConstraintGates` (`projectors/constraints.js`)
/ metadata derivation (`projectors/metadata.js`), `runShadow`,
`buildThinRoutePlan` named identically in map, tasks, and tests. `primary.js`
imports no risk/object signal modules.
D. Dependency order: T02→T04→T05→T06→T08→T11/T12→T14→T17→T19→T20→T21 forms a
chain with no forward references (T06 ships a local constraint stub it defines
itself; real constraint authority lands T12, before structural mutation goes
authoritative at T20); T03 feeds T04; T09 needs T08 and is extended by
T11/T14/T17; T16 precedes T17; T19 precedes T20; T20 consumes only the barrel,
thin mapper, and hash interfaces produced earlier; T21 deletes only machinery
T20 made redundant; T22 records only.
E. Authority audit: shadow is discarded output until T20; T20 asserts
`usesLegacyAuthority` false on the authority path; T21 deletes the legacy
machinery so no fallback can be reintroduced.

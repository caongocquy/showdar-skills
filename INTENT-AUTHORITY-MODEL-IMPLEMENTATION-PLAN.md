# Phase 6G Typed Authority Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task.
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Phase 6F label-trust authority with a typed deny-by-default authority model where exactly one subsystem can mint current authority.

**Architecture:** ActionCandidate → AuthorityAdjudicator → AdjudicatedAction → actionable relation graph → typed projectors → Intent + routingMeta → thin route.

**Tech Stack:** Node.js / JavaScript, existing Showdar resolver/test tooling, no new runtime dependencies.

**Spec:** `INTENT-AUTHORITY-MODEL-DESIGN.md`

**Execution recommendation:** subagent-driven development in an isolated worktree, one task at a time with review gates. Do not implement on a shared branch. This plan creates no worktree itself.

## Global Constraints

Carried into every task. Violation blocks the task.

1. Exactly one authority minting subsystem.
2. ActionCandidate carries no authority.
3. Unknown/unclassified defaults NON_AUTHORITATIVE.
4. Only opaque-branded AUTHORIZED actions may enter authority projectors.
5. Plain object `{tag:'AUTHORIZED'}` must fail authorization checks.
6. Authority verdict precedence is deterministic: CONTEXTUAL → NEGATED → CONDITIONAL → HYPOTHETICAL → AUTHORIZED with positive request evidence → UNRESOLVED.
7. Environment qualifies authority; never creates it.
8. Risk/object/evidence never create or modify authority.
9. Non-authorized variants cannot contribute: primary execution ownership, current mutation, advisor/secondary ownership.
10. Contextual actions never compete for GOVERNING.
11. primaryCapability comes only from GoverningAuthorizedAction.
12. Public Intent remains unchanged: `phase`, `action`, `secondaryActions`, `object`, `risks`, `mutation`, `evidence`.
13. No runtime fallback to Phase 6F authority after cutover.
14. No Blind #6 exact wording in code/tests.
15. Unknown/uncertain behavior degrades to: understand/discovery/read-only.
16. No new external runtime dependency unless design is explicitly reopened.

## Planned File Map

| File | Op | Responsibility | First used |
|---|---|---|---|
| `src/intent-resolver/frame/authority/candidate.js` | CREATE | `extractCandidates(clauses)` → authority-free ActionCandidate[] | 6G.2 (T01) |
| `src/intent-resolver/frame/authority/types.js` | CREATE | Brand Symbol + WeakSet (module-private), `assertAuthorized`, `assertAdjudicated`, variant predicates | 6G.2 (T02) |
| `src/intent-resolver/frame/authority/evidence.js` | CREATE | Pure evidence gatherers: request-form, negation, condition, modal, context, temporal | 6G.3 (T04) |
| `src/intent-resolver/frame/authority/adjudicator.js` | CREATE | `adjudicate(candidate, ctx)` → single AdjudicatedAction; sole `createAuthorized` owner; precedence §8A | 6G.3 (T05) |
| `src/intent-resolver/frame/authority/relations.js` | CREATE | `resolveAuthorizedRelations(authorized[])` → GOVERNING/SUPPORTING/ORTHOGONAL over AUTHORIZED only | 6G.4 (T07) |
| `src/intent-resolver/frame/authority/projectors.js` | CREATE | Typed `projectPrimary6G`, `projectMutation6G`, `projectSecondary6G` with brand assertions | 6G.5 (T09) |
| `src/intent-resolver/frame/authority/diagnostics.js` | CREATE | Per-candidate read-only trace builder (never feeds routing) | 6G.3 (T06) |
| `src/intent-resolver/frame/authority/shadow.js` | CREATE | `runAuthorityShadow(prompt)` differential struct, diagnostic-only | 6G.2 (T03) |
| `src/intent-resolver/frame/authority/index.js` | CREATE (barrel, re-exports composition only; not an authority stage) | Barrel composing candidate → adjudicate → relate → project (shadow until 6G.6) | 6G.5 (T10) |
| `src/intent-resolver/index.js` | MODIFY | Wire shadow (6G.2–6G.5, append-only), cutover switch (6G.6), legacy removal (6G.7) | 6G.2 (T03) → 6G.6 (T12) |
| `src/intent-resolver/frame/action-frame.js` | MODIFY then DELETE-AUTHORITY | Characterization target; authority-minting role removed in 6G.7, lexical recognition retained for candidate extraction | 6G.7 (T14) |
| `src/intent-resolver/frame/relations.js` | MODIFY then DELETE-LATER | Old relation machinery superseded by authority/relations.js in 6G.7 | 6G.7 (T14) |
| `src/intent-resolver/frame/projectors/primary.js` | MODIFY then DELETE-AUTHORITY | LOG_OUTPUT self-authorization + QA-target re-decision deleted (moved to evidence-only or removed) | 6G.5 (T09) → 6G.7 (T14) |
| `src/intent-resolver/frame/projectors/mutation.js` | MODIFY then DELETE-AUTHORITY | Generic-frame consumption replaced by typed consumption | 6G.5 (T09) → 6G.7 (T14) |
| `src/intent-resolver/frame/projectors/secondary.js` | MODIFY then DELETE-AUTHORITY | Capability guessing replaced by adjudicated capability | 6G.5 (T09) → 6G.7 (T14) |
| `scripts/semantic-source-hash.mjs` | MODIFY | Cover `src/intent-resolver/frame/authority/*.js` deterministically | 6G.5 (T11) |
| `test/semantic-source-hash.test.js` | MODIFY | Cover authority subgroup, ordering, missing-file failure | 6G.5 (T11) |
| `test/authority-candidate.test.js` | CREATE | L1 candidate extraction tests | 6G.2 (T01) |
| `test/authority-types.test.js` | CREATE | Brand/forgery rejection tests | 6G.2 (T02) |
| `test/authority-shadow.test.js` | CREATE | Shadow differential struct tests | 6G.2 (T03) |
| `test/authority-adjudicator.test.js` | CREATE | L2 adjudication + precedence + request-form tests | 6G.3 (T05) |
| `test/authority-evidence.test.js` | CREATE | Evidence-gatherer unit tests | 6G.3 (T04) |
| `test/authority-diagnostics.test.js` | CREATE | Diagnostics read-only tests | 6G.3 (T06) |
| `test/authority-relations.test.js` | CREATE | L4 authorized relation graph tests | 6G.4 (T07–T08) |
| `test/authority-projectors.test.js` | CREATE | L5 typed projector tests | 6G.5 (T09–T10) |
| `test/authority-invariants.test.js` | CREATE | L7 metamorphic exact-state matrix | 6G.4 (T08; extended 6G.5) |
| `test/authority-recall.test.js` | CREATE | AUTHORIZED_REQUEST_RECALL metric test | 6G.5 (T10) |
| `evals/authority-dev-cases.json` | CREATE | NEW independently worded development fixture (never Blind #6 strings) | 6G.3 (T04; extended per stage) |

No other production files are in scope. Risks/evidence/object metadata modules are untouched except to sever their authority influence where the audit finds it.

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
node --test test/authority-candidate.test.js
node --test test/authority-types.test.js
node --test test/authority-shadow.test.js
node --test test/authority-evidence.test.js
node --test test/authority-adjudicator.test.js
node --test test/authority-diagnostics.test.js
node --test test/authority-relations.test.js
node --test test/authority-projectors.test.js
node --test test/authority-invariants.test.js
node --test test/authority-recall.test.js
```

Blind #6 is never invoked. Blind #6 exact prompts never enter code, fixtures, tests, or comments. Only the documented failure mechanisms (history-to-authority, log-to-authority, context-to-authority, conditional/hypothetical-to-current, lexical-noun ownership, relation misclassification) may inform NEW independently worded cases.

---

## Stage 6G.2 — Typed IR (no runtime cutover)

Exit gate: candidate + brand + shadow types exist; production runtime byte-identical on all deterministic suites.

- [ ] **T01 — Authority-free ActionCandidate extractor**
  Files: CREATE `src/intent-resolver/frame/authority/candidate.js`; CREATE `test/authority-candidate.test.js`.
  **Interfaces**
  Consumes: ClauseFrame[] (`{ id, text }` only; provenance/commitment fields ignored by design).
  Produces: `extractCandidates(clauses)` → ActionCandidate[] `{ kind: 'ActionCandidate', capability, target, clauseId, surface, environment }` where capability is `lookupSurfaceOperation` result or `'unknown'`, environment is the mentioned token unvalidated. No commitment, mutation, role, or authority field exists on the record (asserted by test via `Object.keys`).
  Representative assertions:
  ```js
  const c = extractCandidates([{ id: 'c0', text: 'Repair the checkout total' }]);
  assert.equal(c[0].kind, 'ActionCandidate');
  assert.ok(!('commitment' in c[0]) && !('mutation' in c[0]) && !('role' in c[0]));
  const u = extractCandidates([{ id: 'c0', text: 'Florp the wobblewidget' }]);
  assert.equal(u[0].capability, 'unknown');
  ```
  Noun-collision guard: a bare domain noun clause ("the event pipeline status") yields capability `'unknown'`, never `deploy` (verb-argument structure required: candidate takes deploy capability only when a deploy-governing verb governs the clause).
  TDD: (1) write test; (2) `node --test test/authority-candidate.test.js` fails (file missing); (3) implement; (4) focused green; (5) `npm test`; (6) `git diff --check`; (7) commit `feat(router): add authority-free action candidates`.

- [ ] **T02 — Authority types + opaque brand + assertions**
  Files: CREATE `src/intent-resolver/frame/authority/types.js`; CREATE `test/authority-types.test.js`.
  **Interfaces**
  Consumes: nothing (brand origin).
  Produces: module-private `AUTHORIZED_BRAND = Symbol('6g-authorized')` (never exported), module-private `minted = new WeakSet()`, `assertAuthorized(rec)` (throws unless brand present AND WeakSet member AND `tag === 'AUTHORIZED'` AND `scope === 'CURRENT'` AND single tag), `assertAdjudicated(rec)` (throws unless tag is one of the six union tags), `isAuthorizedBrand(rec)` internal. `createAuthorized` is NOT here (lives unexported in adjudicator, T05); this module exposes only validators and non-authorized variant factories (`contextual()`, `negated()`, `conditional()`, `hypothetical()`, `unresolved()` returning frozen plain records with public tags).
  Representative assertions:
  ```js
  assert.throws(() => assertAuthorized({ tag: 'AUTHORIZED', scope: 'CURRENT', candidate: {} }), /brand/);
  const forged = { tag: 'AUTHORIZED', scope: 'CURRENT', candidate: {}, [Symbol('6g-authorized')]: true };
  assert.throws(() => assertAuthorized(forged), /membership/);
  const spread = { ...validAuthorizedFromTestHelper }; // helper mints via real adjudicator in T05; here assert.throws on spread of a T02 non-brand record
  ```
  Clone/spread forgery: a spread of a brand-bearing record loses the symbol property or WeakSet membership → `assertAuthorized` throws (asserted with a record minted by the T05 helper once available; at T02 assert the negative paths with plain objects).
  TDD with `node --test test/authority-types.test.js`, then `npm test`; commit `feat(router): add typed authority brand`.

- [ ] **T03 — Authority shadow harness + wiring (diagnostic-only)**
  Files: CREATE `src/intent-resolver/frame/authority/shadow.js`; MODIFY `src/intent-resolver/index.js` (append-only: compute shadow, attach to `meta.authorityShadow`, discard); CREATE `test/authority-shadow.test.js`.
  **Interfaces**
  Consumes: raw prompt; legacy `resolveIntentFromPrompt` (unchanged).
  Produces: `runAuthorityShadow(prompt)` → `{ legacy: { phase, action, mutation, primary }, authority: { candidates: n, authorized: 0, status: 'ir-only' }, agreement: {...}, issues: [...] }` where the authority side reports counts only (no adjudication until T05; authorized always 0 with reason `adjudicator-pending`). `index.js` change is append-only; every existing return value unchanged (full suite proves).
  TDD with `node --test test/authority-shadow.test.js`, then `npm test`; commit `feat(router): add authority shadow harness`.

- [ ] **T04 — 6G.2 exit gate**
  Gate checks: `npm test` green; `npm run validate` green; `node scripts/structured-routing-eval.mjs`, `node scripts/raw-intent-eval.mjs`, `node scripts/holdout-eval.mjs` byte-identical to pre-6G.2 (new path not authoritative); `git diff --check` clean. Record gate pass in tracker; commit only if verification artifacts changed (none expected).

## Stage 6G.3 — AuthorityAdjudicator (single minter, shadow)

Exit gate: adjudicator mints AUTHORIZED exactly per precedence; shadow reports verdicts; runtime still legacy.

- [ ] **T05 — Evidence gatherers (authority-neutral)**
  Files: CREATE `src/intent-resolver/frame/authority/evidence.js`; CREATE `test/authority-evidence.test.js`; CREATE `evals/authority-dev-cases.json` (skeleton `{ version: 1, cases: [{ id, input, mechanism }] }` with NEW independently worded prompts covering history/log/quote/code/conditional/hypothetical/negation mechanisms, never Blind #6 strings).
  **Interfaces**
  Consumes: candidate + clause text + neighbor clause texts.
  Produces: pure evidence record `{ requestForm, negation, condition, modal, contextKinds: [], temporal, positiveRequest }` where each field is a fact, never a verdict. Detectors provide evidence only: a missed marker yields absent evidence (→ UNRESOLVED downstream), never authorization. Request-form detection covers imperative, polite request, interrogative request, need-statement, help-request, investigate/question request as structural clause forms.
  Representative assertions on fixed inputs (no resolver import):
  ```js
  assert.equal(gatherEvidence({ surface: 'restart', clauseText: 'Please restart the queue' }).requestForm, 'polite-request');
  assert.equal(gatherEvidence({ surface: 'restart', clauseText: 'last night we restarted the queue' }).temporal, 'past');
  assert.deepEqual(gatherEvidence({ surface: 'x', clauseText: 'do the thing' }).contextKinds, []);
  ```
  TDD with `node --test test/authority-evidence.test.js`, then `npm test`; commit `feat(router): add authority evidence gatherers`.

- [ ] **T06 — AuthorityAdjudicator (sole minter)**
  Files: CREATE `src/intent-resolver/frame/authority/adjudicator.js`; CREATE `test/authority-adjudicator.test.js`.
  **Interfaces**
  Consumes: ActionCandidate + evidence record (T05 shape).
  Produces: `adjudicate(candidate, evidence)` → exactly one frozen AdjudicatedAction with deterministic precedence: CONTEXTUAL (any containment/report/history evidence) → NEGATED → CONDITIONAL → HYPOTHETICAL → AUTHORIZED (iff positive request evidence AND no disqualifier) → UNRESOLVED. Only `createAuthorized` (unexported closure owning brand + WeakSet) builds AUTHORIZED. No exported `authorize/promote/upgrade/toAuthorized`.
  Representative assertions:
  ```js
  assert.equal(adjudicate(cand('restart'), ev({ quote: true, condition: true })).tag, 'CONTEXTUAL');
  assert.equal(adjudicate(cand('restart'), ev({ negated: true, condition: true })).tag, 'NEGATED');
  assert.equal(adjudicate(cand('restart'), ev({ condition: true })).tag, 'CONDITIONAL');
  assert.equal(adjudicate(cand('restart'), ev({ hypothetical: true })).tag, 'HYPOTHETICAL');
  assert.equal(adjudicate(cand('restart'), ev({ requestForm: 'imperative' })).tag, 'AUTHORIZED');
  assert.equal(adjudicate(cand('restart'), ev({})).tag, 'UNRESOLVED');
  assert.throws(() => adjudicate(null, ev({})), /candidate/);
  ```
  Request-form coverage: imperative, polite, interrogative, need-statement, help-request, investigate/question — each yields AUTHORIZED with no disqualifiers (NEW wording, never Blind #6 strings). No-request-evidence → never AUTHORIZED; unknown capability → never dangerous authority (UNRESOLVED).
  TDD with `node --test test/authority-adjudicator.test.js`, then `npm test`; commit `feat(router): add typed authority adjudication`.

- [ ] **T07 — Diagnostics builder (read-only)**
  Files: CREATE `src/intent-resolver/frame/authority/diagnostics.js`; CREATE `test/authority-diagnostics.test.js`; extend shadow to report per-candidate verdicts.
  **Interfaces**
  Consumes: candidate + evidence + adjudicated verdict + relation/mutation/secondary contribution flags.
  Produces: `traceCandidate(...)` → frozen trace `{ surface, capability, clauseId, evidence, verdict, reason, relation, contributes: { primary, mutation, secondary } }`. Diagnostics never feed routing (asserted: routing inputs exclude the diagnostics module by import audit in test).
  TDD with `node --test test/authority-diagnostics.test.js`, then `npm test`; commit `feat(router): add authority diagnostics`.

- [ ] **T08 — 6G.3 exit gate**
  Gate checks: T06 precedence tests green incl. all six request forms; shadow reports verdicts without changing legacy outputs; `npm test` green. No cutover code exists.

## Stage 6G.4 — Actionable relation graph (shadow)

Exit gate: relations over AUTHORIZED only; contextual high-risk action cannot steal GOVERNING.

- [ ] **T09 — Authorized relations**
  Files: CREATE `src/intent-resolver/frame/authority/relations.js`; CREATE `test/authority-relations.test.js`.
  **Interfaces**
  Consumes: AdjudicatedAction[] (AUTHORIZED-brand-bearing only; asserts via `assertAuthorized` on every input).
  Produces: `resolveAuthorizedRelations(authorized[])` → `{ governing: GoverningAuthorizedAction | null, relations: [{ kind: GOVERNING|SUPPORTING|ORTHOGONAL, from, to }] }`. Non-authorized variants are not accepted as inputs (caller filters); passing one throws. First AUTHORIZED in clause order → GOVERNING; same-workflow step → SUPPORTING (capped downstream); independent request → ORTHOGONAL.
  Representative assertions:
  ```js
  const g = resolveAuthorizedRelations([auth('repair'), auth('retest')]);
  assert.equal(g.governing.candidate.surface, 'repair');
  assert.throws(() => resolveAuthorizedRelations([auth('repair'), contextual('restart')]), /AUTHORIZED/);
  ```
  Contextual-steal test: AUTHORIZED investigate + CONTEXTUAL production-deploy evidence → deploy never enters graph; governing is investigate (NEW wording).
  TDD with `node --test test/authority-relations.test.js`, then `npm test`; commit `feat(router): relate authorized actions`.

- [ ] **T10 — Metamorphic invariant suite skeleton (exact-state)**
  Files: CREATE `test/authority-invariants.test.js` (skeleton with the §27A canonical transformations; extended in 6G.5).
  **Interfaces**
  Consumes: end-to-end `adjudicate` over NEW prompt pairs (base request + transformed variant).
  Produces: exact-tag assertions: →history/report/log/quote/code ⇒ CONTEXTUAL; →conditional ⇒ CONDITIONAL; →hypothetical ⇒ HYPOTHETICAL; →negated ⇒ NEGATED; ambiguous ⇒ UNRESOLVED; +production/risk/object/evidence on non-authorized ⇒ unchanged non-authorized, no production authority; plus monotonic safety net.
  TDD with `node --test test/authority-invariants.test.js`, then `npm test`; commit `test(router): add authority invariant matrix`.

- [ ] **T11 — 6G.4 exit gate**
  Gate checks: relation tests + invariant skeleton green; shadow relation agreement recorded; legacy outputs unchanged.

## Stage 6G.5 — Typed projectors (shadow)

Exit gate: typed projectors produce Intent from authorized graph in shadow; authority reconstruction deleted from plan (kept runtime until cutover).

- [ ] **T12 — Typed primary/mutation/secondary projectors**
  Files: CREATE `src/intent-resolver/frame/authority/projectors.js`; CREATE `test/authority-projectors.test.js`.
  **Interfaces**
  Consumes: `projectPrimary6G(governing: GoverningAuthorizedAction | null)`, `projectMutation6G(authorized: AuthorizedAction[])`, `projectSecondary6G(orthogonal: OrthogonalAuthorizedAction[])` — each asserts brand on every input and throws on forged/non-authorized records.
  Produces: primary `{ phase, action, primaryCapability }` from governing capability only (no LOG_OUTPUT inference, no QA-target re-decision, no risk/object inputs); mutation per invariant matrix (AUTHORIZED deploy+production → production-impacting; any non-authorized + any environment → read-only; CONDITIONAL/HYPOTHETICAL/NEGATED/UNRESOLVED → no current mutation); secondaries from ORTHOGONAL AUTHORIZED only with primary dedupe + max-2 cap.
  Explicit audit deletions planned (not executed until T14, but specified here): `primary.js` lines 81-89 LOG_OUTPUT inference → deleted; lines 157-164 QA-target special case → deleted; `secondary.js` canonical-first guessing → replaced by adjudicated capability; `mutation.js` generic-frame consumption → typed consumption. Do NOT move these heuristics into new helpers.
  Representative assertions:
  ```js
  assert.throws(() => projectMutation6G([{ tag: 'AUTHORIZED', candidate: {} }]), /brand/);
  assert.equal(projectMutation6G([]), 'read-only');
  assert.deepEqual(projectPrimary6G(null), { phase: 'discovery', action: 'understand', primaryCapability: 'understand' });
  assert.deepEqual(projectMutation6G([]), 'read-only');
  assert.deepEqual(projectSecondary6G([]), []);
  ```
  Conservative fallback contract (routing/degradation, NOT authorization):
  no GoverningAuthorizedAction → public Intent `{ phase: 'discovery', action:
  'understand', secondaryActions: [], mutation: 'read-only' }` (metadata/
  evidence/object/risks may populate but must not alter fallback authority)
  with internal `primaryCapability: 'understand'`. The fallback path never
  calls `createAuthorized`, never fabricates an AuthorizedAction, never enters
  the relation graph, and never contributes mutation/advisors. Distinguish
  from an AUTHORIZED review/assessment request, which routes per its governing
  capability (verification/review, quality, or security-assessment). Dedicated
  test: an UNRESOLVED-only prompt yields the understand fallback and MUST NOT
  route to showdar-review.
  TDD with `node --test test/authority-projectors.test.js`, then `npm test`; commit `feat(router): add typed authority projectors`.

- [ ] **T13 — Barrel composition + recall metric + hash coverage**
  Files: CREATE `src/intent-resolver/frame/authority/index.js` (`resolveAuthorityIntent(prompt)` composing candidate → adjudicate → relate → project; shadow-only); CREATE `test/authority-recall.test.js`; MODIFY `scripts/semantic-source-hash.mjs` (cover `src/intent-resolver/frame/authority/*.js` in codepoint order after projectors group, with in-code rationale); MODIFY `test/semantic-source-hash.test.js` (authority subgroup membership, ordering, missing-file failure).
  **Interfaces**
  Consumes: raw prompt + clause pipeline.
  Produces: `{ intent, primaryCapability, diagnostics }` structurally parallel to `resolveStructuralIntent` but brand-gated. AUTHORIZED_REQUEST_RECALL = (development-fixture expected-authorized requests adjudicated AUTHORIZED) / (all development-fixture expected-authorized requests), gate ≥90%, labels authored from the design (never runtime output). Fallback-to-understand MUST NOT count as authorization: an expected-authorized request adjudicated UNRESOLVED is a false negative.
  TDD: focused tests green, then `npm test`, then `node scripts/semantic-source-hash.mjs`; commit `feat(router): compose authority pipeline` and `feat(router): cover authority source in hash` (two commits, hash second).

- [ ] **T14 — 6G.5 exit gate**
  Gate checks: projector + recall + hash tests green; shadow Intent agreement recorded on development fixtures; legacy runtime unchanged.

## Stage 6G.6 — Authority cutover (first production-authoritative task)

Exit gate: new authority path authoritative; all §16 hard gates pass; no fallback.

- [ ] **T15 — Cutover switch + behavioral proof**
  Files: MODIFY `src/intent-resolver/index.js` (new path authoritative; `meta.engine = 'authority'`; expose `usesLegacyAuthority=false` auditable proof); extend shadow to report legacy-vs-authority differential.
  **Interfaces**
  Consumes: `resolveAuthorityIntent` barrel (T13).
  Produces: `resolveIntentFromPrompt` served by typed authority with identical public contract; internal `primaryCapability` from GoverningAuthorizedAction.
  Behavioral proof test (NEW wording, never Blind #6 strings): a historical-report prompt where old 6F grants deploy/production authority and the new path yields CONTEXTUAL deploy + AUTHORIZED investigate (or UNRESOLVED) with read-only mutation and no ops primary. The test runs the old path to prove the trap is real, then asserts the new path refuses it.
  **Hard gates (§16):** minter count = 1 (import audit); plain-forgery accepted = 0; clone/spread forgery = 0; non-authorized projector acceptance = 0; unknown→AUTHORIZED = 0; context/conditional/hypothetical/negated→current = 0; environment-created authority = 0; risk/object/evidence influence = 0; legacy fallback = 0; Intent schema drift = 0; forbidden primary = 0; unauthorized production escalation = 0; EMPTY_ACTIONABLE_GRAPH_FALLBACK_CORRECT = 100% (phase=discovery, action=understand, mutation=read-only, no secondary advisor, primaryCapability=understand, no fabricated AuthorizedAction, no showdar-review fallback).
  TDD: proof test red on old path behavior, green on new; full `npm test`; commit `feat(router): cut over to typed authority`. Do not push.

## Stage 6G.7 — Remove Phase 6F authority machinery

Exit gate: one semantic engine; zero production refs to old authority.

- [ ] **T16 — Old authority removal**
  Files: MODIFY `src/intent-resolver/frame/action-frame.js` (remove AUTHORIZED_NOW minting; retain lexical recognition for candidate extraction), `src/intent-resolver/frame/relations.js` (superseded; delete after ref check), `src/intent-resolver/frame/projectors/primary.js` (delete LOG_OUTPUT inference + QA re-decision), `mutation.js`/`secondary.js` (delete generic-frame authority paths), `src/intent-resolver/index.js` (remove legacy engine + instrumentation).
  Per deletion: `rg` refs first, classify DELETE / KEEP_AS_EVIDENCE_ONLY / KEEP_AS_LEXICAL_RECOGNITION_ONLY, focused tests then `npm test` + all six eval scripts (`raw-intent`, `holdout`, `structured-routing`, `verification-budget`, `evidence-state`, `retrieval`) unchanged-or-better per gate policy.
  TDD (deletion guarded by green suites); commit `refactor(router): remove phase6f authority compatibility`. Do not push.

## Stage 6G.8 — Final freeze (verification-only)

- [ ] **T17 — Freeze readiness**
  Files: none (verification + recording only).
  Gate checks: `npm test` green; `npm run validate` green; `npm pack --dry-run` clean; `git diff --check` clean; import/constructor audit (one minter, no promotion API); authority invariant matrix green; public Intent audit (seven keys); no-fallback audit (`usesLegacyAuthority` false, no 6F authority imports on runtime path); `node scripts/semantic-source-hash.mjs` run twice with identical output; hash test green; tracked tree identity recorded as the 6G freeze SHA. No semantic fixes in this task: any gate failure reopens the responsible earlier task. Handoff note states Blind #7 runs in a new isolated session after freeze. Commit only if recording files change (none expected).

## Plan self-review

A. Spec coverage: §5 terminology → T01/T02; §6 pipeline → barrel T13; §7 candidate → T01; §8 union + §8A precedence → T02/T06; §9 adjudicator → T06; §10 positive evidence → T05/T06; §10A fallibility → recall T13; §11 deny-by-default → T06/T10; §12 provenance-as-evidence → T05; §13 commitment → T06/T12; §14 relations → T09; §15 primaryCapability → T12; §16 mutation → T12; §17 secondary → T12; §18/§18A firewall+brand → T02/T12; §19 construction → T06; §20 lexical → T01/T12; §21 metadata → T12/T10; §22 contract → gates T15/T17; §23 uncertainty → T12/T13; §24 diagnostics → T07; §25 security → T12 tests; §26 migration → stage order; §27/§27A tests → T10; §28 contamination → header + every task; §29 hash → T13; §30 rollback → T15/T17; §31 acceptance → T15 gates; §32 trade-offs → (design rationale, no task needed); §33 invariants → T15/T17 audits.
B. Placeholder scan: no unfinished markers or bare "add tests" remain; every test step names file and assertions.
C. Interface consistency: `extractCandidates`, `adjudicate`, `assertAuthorized`, `resolveAuthorizedRelations`, `projectPrimary6G`, `projectMutation6G`, `projectSecondary6G`, `resolveAuthorityIntent`, AUTHORIZED_REQUEST_RECALL named identically in map, tasks, and tests.
D. Dependency order: T01→T02→T05→T06→T09→T12→T13→T15→T16→T17 chain with no forward references (T02 negative-path tests precede T06 minting helper; T05 evidence precedes T06 adjudication; T13 hash coverage precedes T15 cutover).
E. Authority audit: shadow discarded until T15; T15 asserts `usesLegacyAuthority` false; T16 deletes legacy machinery; no second minter at any stage.

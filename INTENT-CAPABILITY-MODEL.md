# Intent and capability model

Showdar 0.3 introduces a small semantic foundation for future routing. The
current router and retrieval engine remain authoritative; this model is
additive infrastructure and capability scoring is not production routing.

## Intent model

`src/intent.js` validates and normalizes the routing-relevant task shape:

```js
{
  phase: 'diagnosis',
  action: 'investigate',
  secondaryActions: [],
  object: 'auth',
  risks: ['regression'],
  mutation: 'read-only',
  evidence: {
    rootCauseKnown: false,
    behaviorDefined: false,
    failureObserved: true,
  },
}
```

Phases, risks, mutation classes, and evidence keys are closed validated sets.
Actions and objects are normalized non-empty labels so future domains can be
added without changing the schema. `secondaryActions` is an optional,
backward-compatible, sorted list for explicit orthogonal concerns such as
`security` or `test`; it does not change primary ownership. An omitted evidence
value is `null`, which means unknown rather than false. Evidence is deliberately
limited to routing signals; execution state does not belong in the model.

## Capability taxonomy

`src/capabilities.js` is the single machine-readable source of truth. It has
one entry per catalog skill, with concise phase, action, object, risk,
mutation-compatibility, and optional evidence-preference sets. Risks mean
concerns the skill can legitimately own or strongly influence for routing;
they are not a list of every topic the skill may inspect.

Mutation compatibility means classes the skill may own as the primary skill:
security and ship are read-only; ops owns local, remote, and production-impacting
operations; git owns local and remote Git changes but not production mutation.

Repository validation checks exact catalog coverage, unknown skills, malformed
lists, duplicate values, invalid phases, invalid risks, and invalid mutation
classes.

## Scoring and future routing

`src/capability-score.js` gives explainable deterministic scores to an Intent
against a capability. Exact matches receive fixed weights: phase 4, action 3,
object 2, each risk 2, mutation 2, and each evidence preference 2. A matching
`prefer` condition adds points; a matching `deEmphasize` condition subtracts
points. Unknown evidence is neutral and reported as unspecified. Results sort
by descending score, then lexical skill id; source declaration order is not a
priority. Unknown action/object labels simply produce unmatched evidence and a
lower score.

This scorer is a testable primitive only. It does not replace the existing
`router/*.yaml`, retrieval engine, flagship ownership, profiles, CLI, or legacy
eval authority.

## Shadow route planner

`src/route-plan.js` consumes the normalized Intent and the Phase 1 scorer to
return an explainable route plan: one `primary`, up to two `advisors`, ranked
`candidates`, and deterministic `confidence` (`level`, `margin`, and whether a
specialization rule was decisive).

The primary is the sole owner of execution. Advisors are lightweight concern
signals identified only by explicit secondary actions or focused orthogonal
risks; they return skill IDs and reasons and do not load additional `SKILL.md`
files. Advisors are capped at two and are never added merely because they are
primary-score runners-up. Ties are ordered by descending score, then lexical
skill ID.

The planner is shadow-mode infrastructure for 0.3. The existing native router,
retrieval behavior, profiles, CLI, and flagship skill selection remain the
production authority. The structured fixture can be checked with
`node scripts/structured-routing-eval.mjs`; its metrics are separate from the
legacy retrieval evaluation.

## Verification budget

`src/verification-budget.js` consumes a normalized Intent, a route plan, and
optional bounded change metadata (`scope`, `filesChangedEstimate`,
`crossBoundary`, `publicApiChange`, `schemaChange`, and `dependencyChange`).
`buildVerificationPlan()` returns a `low`, `medium`, or `high` budget with
explainable `reasons`, semantic `required` and `optional` checks, and
`escalations`.

Low is for small, low-risk bounded proof; medium is the default for normal
implementation and regression surface; high is required by explicit
production-impacting mutation, relevant remote operations, security-sensitive
changes, compatibility upgrades, mutated data-integrity risk, public API or
schema changes, broad cross-boundary scope, release readiness, or uncertain
data-integrity failures. Low route confidence can raise low to medium, but
advisors do not automatically multiply severity.

Checks are semantic classes such as `targeted-test`, `relevant-suite`,
`typecheck`, `build`, `package`, `security`, `compatibility`, `regression`,
`release-readiness`, and `deployment-safety`; they are not shell commands.
The budget controls verification depth, not permission or authorization. A
high budget does not authorize remote or production mutation, and skill safety
boundaries remain authoritative. This planner executes no checks, scans no
repository files, loads no skills dynamically, and does not change current
production behavior. Its separate fixture can be checked with
`node scripts/verification-budget-eval.mjs`.

## Evidence state and handoff

`src/evidence-state.js` introduces a lightweight execution state contract that
preserves routing-relevant progress across skill boundaries. It is additive
infrastructure; existing runtime/native routing remains authoritative. The
state records evidence and routing-relevant progress—it does not prescribe a
rigid workflow sequence such as requirements → plan → build → test → review
→ ship. Real tasks do not always follow that order.

### State model

```js
{
  primary: 'showdar-debug',
  status: 'active',
  evidence: [
    { kind: 'failure-reproduced', status: 'verified', source: 'test', detail: '...' }
  ],
  blockers: [{ id: 'auth', reason: 'missing authorization', type: 'authorization' }],
  verification: { completed: [], failed: [] },
  decision: { type: 'continue', target: null, reasons: [] }
}
```

**Status vocabulary** (small, observable, not authorization):
- `active` — work in progress
- `blocked` — necessary information/evidence/authorization missing; proceeding would require guessing
- `ready-for-handoff` — current primary reached legitimate stop condition; another skill should own next action
- `verified` — required verification evidence satisfied for owned scope
- `complete` — requested task complete at current scope

**Evidence vocabulary** (normalized across all 15 skills):
- `behavior-defined`, `architecture-understood`, `failure-observed`, `failure-reproduced`, `root-cause-proven`
- `change-implemented`, `regression-proof-added`, `targeted-tests-passed`, `relevant-suite-passed`
- `typecheck-passed`, `build-passed`, `package-verified`, `security-reviewed`, `compatibility-verified`
- `release-readiness-verified`, `deployment-verified`, `git-state-verified`

**Evidence quality** (distinguishes claim from proof):
- `claimed` — asserted but not yet confirmed
- `observed` — seen in practice (e.g., test ran, log output)
- `verified` — independently confirmed (e.g., CI passed, reviewer approved)
- `failed` — evidence contradicts the claim
- `missing` — explicitly noted as absent

Completion and handoff decisions prefer `verified`/`observed` over `claimed`.

**Decision contract** (exactly one at a time):
```js
{ type: 'continue' | 'handoff' | 'complete' | 'blocked', target: string|null, reasons: string[] }
```
- `continue` — current primary still owns unresolved work
- `handoff` — current primary reached legitimate stop condition; `target` is the skill receiving ownership
- `complete` — task complete at current scope; required verification satisfied
- `blocked` — necessary evidence/authorization missing; must not proceed by guessing

**Handoff rules** (ownership transfer, not advisor invocation):

| From | Condition | To | Reason |
|------|-----------|-----|--------|
| debug | failure reproduced + root cause proven + implementation needed | build | root cause proven, implementation needed |
| debug | failure reproduced + root cause proven + fix implemented & verified | (complete) | not mandatory build handoff |
| debug | config/doc fix only (no code change) | (complete) | implementation boundary reached |
| requirements | behavior defined + implementation requested | build or plan | behavior defined, implementation requested |
| requirements | critical business rule missing | (blocked) | business rule required |
| plan | bounded implementation plan exists + implementation requested | build | bounded implementation plan complete |
| build | change implemented + required verification satisfied | (complete) | change implemented and required verification satisfied |
| build | change implemented + explicit test handoff requested | test | implementation complete, explicit test ownership requested |
| security | finding confirmed + remediation requested | build | security finding confirmed, remediation implementation requested |
| security | review complete + no mutation requested | (complete) | security does not mutate |
| quality | QA plan/regression matrix finished | (complete) | quality does not auto-handoff test |
| test | tests implemented + required verification satisfied | (complete) | automated tests done |
| ship | readiness + package verified | (complete) | ship does not auto-handoff ops |
| ops | deployment requested + no authorization | (blocked) | authorization absent |
| ops | authorized deployment in progress | (continue) | deployment executing |
| ops | deployment verified | (complete) | deployment verified |
| recover | context reconstructed | recovered owner | interrupted work reconstructed |
| git | Git operation completed + state verified | (complete) | git operation done |

**Stop conditions** (lightweight per-skill metadata):
- debug: root cause proven, requested diagnostic outcome reached, implementation boundary reached
- requirements: behavior sufficiently defined, unresolved decision blocks progress
- plan: bounded implementation plan exists
- build: requested change implemented, required verification for owned scope satisfied
- security: threat model/review complete, no requested mutation pending
- quality: QA plan or regression matrix finished
- test: tests implemented and required verification satisfied
- ship: readiness verdict established
- ops: deployment executed and verified
- recover: missing execution context reconstructed
- git: requested Git operation completed and state verified

**Verification plan integration**: Phase 3 Verification Plan required checks (e.g., `targeted-test`, `relevant-suite`) must have corresponding `verified`/`observed` evidence (`targeted-tests-passed`, `relevant-suite-passed`) before `complete` can be decided. Optional checks do not gate completion.

**Blocker semantics** (explicit and narrow):
- Unresolved business rule required to continue
- Missing reproduction/evidence where guessing would be unsafe
- Required production authorization absent
- Required external decision missing
Not blocked by: optional advisor concerns, optional verification checks absent, medium route confidence.

**Reducer API** (deterministic, immutable):
- `createExecutionState(options)` — create initial state
- `applyEvidence(state, evidenceEntry)` — add/upsert evidence (keeps highest quality)
- `addBlocker(state, blocker)` — add blocker (deduped by id)
- `removeBlocker(state, blockerId)` — remove blocker
- `resolveDecision(state, context)` — compute decision from intent, routePlan, verificationPlan, changeMetadata
- `getStopConditions(skill)` — retrieve stop condition metadata

**State size / token discipline**: No raw logs, full diffs, prompts, SKILL.md content, or repository file contents. Evidence detail bounded to compact summaries/references.

**Evaluation**: Separate deterministic eval fixture (`evals/evidence-state-cases.json`) with 27+ realistic cases. Metrics: exact state-decision pass count, decision accuracy, handoff-target accuracy, forbidden-transition violations, required-evidence completion violations, blocker classification accuracy. Runner: `node scripts/evidence-state-eval.mjs`.

**Unit tests**: Focused tests in `test/evidence-state.test.mjs` covering state creation/validation, evidence normalization, evidence quality, deterministic updates, duplicate handling, blocker behavior, all decision types, advisor != handoff, verification required/optional gating, security remediation handoff, debug root-cause handoff, ship != ops auto-transition, quality != test auto-transition, recover → owner handoff.

# Phase 6F Design: Structural Intent Parser Refactor

- Status: DRAFT FOR REVIEW (design only, no implementation)
- Date: 2026-09-13
- Frozen base commit: `6fbda090235214b7f1a4ac2444a4d8d9f41dbc32`
- Frozen semantic SHA-256: `e69b7e6662e5abaa32af4d4ac5523902c91383c925e66ea6336cbd196679eb7d`
- Prior verdict (immutable): BLIND5_GENERALIZATION_FAILURE
- Prior recommendation (accepted): STRUCTURAL_PARSER_REFACTOR
- Contract-audit input: `evals/blind-holdout-5-contract-audit.json` (derived overlay; 22/38 genuine failures, 4 genuine AUTHORITY_CRITICAL)

This document is the complete design specification for Phase 6F. It authorizes
no code changes. Terms in CAPITALS are defined in this document and mean only
what this document says.

## 1. Problem statement

Blind #5 proved the current ownership architecture does not generalize:

```
raw prompt
  -> global lexical candidates
  -> score/precedence competition
  -> post-hoc special-case correction
  -> Intent
```

Known-dataset performance is strong (dev-regression, structured routing), but
the valid blind run showed structural failures:

- provenance authority leaks (quoted/log/code content granting action authority)
- historical and log production mentions granting deploy authority
- supporting-step takeover (audit/review clauses stealing governing ownership)
- primary/secondary confusion (supporting work dropped or invented)
- constraint misses (explicit prohibitions not held)
- environment authority leaks (target nouns escalating or suppressing mutation)
- canonical surface-verb taxonomy mismatch (one surface verb owned by competing families)

Contract-audited Blind #5 diagnostics (diagnostic only, not the official score):
22/38 genuine routing/authority failures, 4 genuine AUTHORITY_CRITICAL,
primary 25/38 (65.8%), mutation 27/38 (71.1%), advisor precision 80% /
recall 44.4%.

The goal is NOT to patch Blind #5 cases. The goal is to replace the ownership
architecture so these failure classes are impossible by construction rather
than fixed one regex at a time.

## 2. Non-goals

- No public Intent schema change. Consumers see exactly the contract in §3.
- No LLM classifier as authority decider. Resolution stays deterministic and offline.
- No dependency or parser library required. Only Node.js built-ins, per repo policy.
- No Blind #5 phrase-specific fixes. No fixture wording enters the implementation.
- No metadata-perfect object/risk taxonomy requirement. Object and risks stay
  informational (see §12 and §22 tiering).
- No runtime fallback to legacy authority after cutover (§20).
- No breaking change to route/verification consumers (§3).
- No Blind #6 during implementation (§23).

## 3. Public contract (unchanged)

Canonical Intent remains exactly:

```js
{
  phase,            // INTENT_PHASES member
  action,           // canonical action (see §13)
  secondaryActions, // sorted canonical capabilities, max 2 advisors downstream
  object,           // informational domain noun
  risks,            // RISK_CAPABILITIES subset, informational
  mutation,         // read-only | local-write | remote-write | production-impacting
  evidence,         // { failureObserved, rootCauseKnown, behaviorDefined }
}
```

Constraints remain resolver metadata outside Intent
(`no-push`, `no-commit`, `no-deploy`, `no-code-change`, `no-implementation`,
`no-publish`, plus scoped variants). Existing route, verification, evidence,
and capability consumers continue to receive this contract unchanged. Phase 6F
introduces only an INTERNAL intermediate representation (the frame model in §5).

## 4. Target pipeline

```
raw prompt
  -> provenance segmentation          (existing segments.js, extended)
  -> ClauseFrame[]                    (clause parser, §5)
  -> ActionFrame[] + ContextFrame[]   (action framing, §5, §6)
  -> relation resolution              (GOVERNING/SUPPORTING/ORTHOGONAL/..., §7)
  -> RequestFrame                     (single authoritative structure)
  -> authority resolution             (governing ownership, mutation ceiling)
  -> Intent projectors                (one pure projector per dimension, §§8-12)
  -> existing Intent                  (contract of §3)
  -> thin route-plan                  (§14)
  -> verification
```

Legacy pipeline being replaced:

```
raw prompt
  -> global lexical candidates
  -> score competition (authority*10 + bonuses)
  -> special-case correction (~26 branches)
  -> Intent
  -> route-plan semantic re-selection (11 priority rules)
```

The structural pipeline derives each Intent dimension from ONE authoritative
RequestFrame. There is exactly one semantic engine after cutover (§14).

## 5. Structural IR (internal only)

### 5.1 ClauseFrame

```js
{
  id,             // stable within one resolution, e.g. "c0"
  text,           // verbatim span
  provenance,     // segment kind (see §6)
  connector,      // ROOT | AND | THEN | IF | UNLESS | TO | BECAUSE | AFTER | BEFORE | WHILE
  polarity,       // positive | negative | neutral
  parentClauseId, // null for ROOT
}
```

Clause splitting is conjunction- and punctuation-driven over authoritative
text only. The connector inventory above is closed for 6F; deepen it only via
the fixture in §18, never per-phrase.

### 5.2 ActionFrame

```js
{
  id,                 // e.g. "a0"
  surfaceVerb,        // verbatim verb phrase, e.g. "audit", "carry out"
  semanticCapability, // e.g. "security-assessment", "test-authorship"
  canonicalAction,    // Intent action via the single map of §13
  target,             // governed target span or null
  provenance,         // segment kind (see §6)
  polarity,           // positive | negative | neutral
  role,               // GOVERNING | SUPPORTING | ORTHOGONAL (see §7)
  commitment,         // AUTHORIZED_NOW | CONDITIONAL | HYPOTHETICAL
  environment,        // local | remote | production | unspecified
  clauseId,           // owning ClauseFrame
}
```

- `role` describes the action's structural position in the request, resolved in §7.
- `commitment` describes authorization timing: AUTHORIZED_NOW means the user
  requests the work now; CONDITIONAL means it depends on a future gate
  ("if approved", "when green"); HYPOTHETICAL means illustrative or supposed
  ("would be dangerous", "should we").
- `environment` qualifies the target of THIS action only. It never manufactures
  write authority (§9).

### 5.3 ContextFrame

Non-authoritative spans produce ContextFrame, never ActionFrame:

```js
{
  id,
  kind,   // LOG_OUTPUT | QUOTED_CONTENT | CODE_BLOCK | INLINE_CODE | EXAMPLE | MENTION | CONTEXT
  text,
  contributesTo, // subset of ["evidence", "risks", "object"]
}
```

### 5.4 ConstraintFrame

```js
{
  kind,   // NO_PUSH | NO_COMMIT | NO_DEPLOY | READ_ONLY | NO_CODE_CHANGE | NO_IMPLEMENTATION
  scope,  // global | clause:<id> | action:<id>
  text,   // verbatim span
}
```

Scope defaults to global. Clause/action scoping applies only when the
prohibition names its target ("don't push it" scopes to the referenced action).

### 5.5 RequestFrame

```js
{
  clauses,     // ClauseFrame[]
  actions,     // ActionFrame[] (authoritative provenance only)
  contexts,    // ContextFrame[]
  constraints, // ConstraintFrame[]
  relations,   // Relation[] over action/clause ids (§7)
  diagnostics, // parser diagnostics (§15); never throws for normal language
}
```

## 6. Hard provenance authority boundary

Invariant (normative): an ActionFrame carrying authority originates ONLY from
`DIRECT_INSTRUCTION` or `SECONDARY_INSTRUCTION` provenance. The following
provenance kinds MUST produce ContextFrame only:

`LOG_OUTPUT`, `QUOTED_CONTENT`, `CODE_BLOCK`, `INLINE_CODE`, `EXAMPLE`,
`MENTION`, `CONTEXT`.

ContextFrames may contribute evidence, risks, and object/domain metadata. They
MAY NEVER independently contribute a governing action, mutation authority, a
secondary action, or an advisor.

Enforcement is module-level: only the authoritative-provenance frame builder
can construct an ActionFrame with `commitment: AUTHORIZED_NOW`; the builder
rejects any other provenance at construction. A rejected span degrades to a
ContextFrame plus an `UNRESOLVED_RELATION`-free diagnostic, never to a scored
guess. This makes historical/log deployment leaks (Blind #5 b5-21, b5-42)
impossible by construction: a deploy verb inside LOG_OUTPUT or a historical
clause is not an action candidate at all, so no table, weight, or branch can
promote it.

## 7. Action relations

Relations are resolved from clause structure (connectors, order, polarity),
never from score margins:

- GOVERNING: the requested work that owns the primary. Exactly one positive
  AUTHORIZED_NOW governing action is expected; deviations are diagnostics (§15).
- SUPPORTING: a step inside the governing workflow (resolving conflicts after a
  rebase, verifying health after a deploy). Never owns primary, never advises.
- ORTHOGONAL: independent explicitly-requested work (audit alongside implement).
  The sole source of secondaryActions (§10).
- CONDITIONAL: work gated on a future condition ("deploy if approved").
  Contributes no current mutation and no current advisor.
- CONTEXTUAL: background or historical content ("was deployed yesterday").
  Contributes no action authority at all.

Worked resolutions:

"Implement X and audit it" — implement: GOVERNING; audit: ORTHOGONAL.
Result: primary build, secondary security/review, mutation from governing.

"Rebase the branch and resolve resulting conflicts" — rebase: GOVERNING;
resolve conflicts: SUPPORTING. Result: primary git, no separate fix advisor.

"Inspect the release and deploy if approved" — inspect: GOVERNING; deploy:
CONDITIONAL. Result: current mutation read-only; no deploy authority now.

"The service was deployed yesterday; investigate the slowdown" — historical
deploy: CONTEXTUAL; investigate: GOVERNING. Result: debug, read-only.

## 8. Governing action ownership

Primary phase/action comes EXCLUSIVELY from the positive AUTHORIZED_NOW
GOVERNING ActionFrame, mapped through the single taxonomy of §13. It is NEVER
taken from risk, object, environment, a secondary action, the route skill, a
verification signal, or a score winner.

If governing ownership is unresolved (`NO_GOVERNING_ACTION`,
`MULTIPLE_GOVERNING_ACTIONS`, or `UNRESOLVED_RELATION`), the resolver emits a
conservative low-authority Intent (discovery or verification, read-only,
no secondaries) plus diagnostics. Normative fallback rule: uncertainty may
REDUCE authority; uncertainty MUST NEVER INCREASE authority.

## 9. Mutation projection

Contributors:

| Frame | Contribution |
|---|---|
| GOVERNING + AUTHORIZED_NOW | contributes base mutation |
| SUPPORTING + AUTHORIZED_NOW | contributes within the governing authority ceiling |
| ORTHOGONAL + AUTHORIZED_NOW | contributes independently |
| CONDITIONAL | no current mutation |
| HYPOTHETICAL | no current mutation |
| CONTEXTUAL | no mutation |
| NEGATED (any) | no mutation |

Supporting-action ceiling (normative): on the write ladder
`read-only < local-write < remote-write < production-impacting`, a SUPPORTING
action's projected mutation may not exceed the GOVERNING action's projected
mutation. A supporting review inside a read-only assessment stays read-only;
a supporting verify inside a staging deploy stays remote-write.

Final mutation flow per contributing action: authorized action -> base mutation
(from the single action→mutation map) -> environment qualifier (target of THIS
action only) -> scoped/global constraint gates -> final mutation, taking the
maximum across contributors EXCEPT that environment never manufactures write
authority: an environment qualifier can only select within authority already
granted by an authorized action (e.g. deploy+production -> production-impacting;
inspect+production -> read-only).

## 10. Secondary action projection

Only an ActionFrame that is simultaneously ORTHOGONAL, positive polarity, and
AUTHORIZED_NOW may contribute a secondaryAction. SUPPORTING never creates an
advisor. CONDITIONAL never creates a current advisor. The primary's canonical
capability is deduplicated from the secondary list. The existing
max-two-advisors contract is preserved. Advisor skills derive from
secondaryActions through the existing secondary→skill map; no other path may
add advisors.

## 11. Constraint model

Constraints remain resolver metadata with typed kinds
(NO_PUSH, NO_COMMIT, NO_DEPLOY, READ_ONLY, NO_CODE_CHANGE, NO_IMPLEMENTATION)
and scope (global, clause, action). Constraint gates apply AFTER mutation
projection and can only reduce authority.

"Update config but don't push" — update projects local-write; NO_PUSH scoped to
the push action. Final: local-write allowed, push forbidden.

"Do not modify anything; inspect only" — READ_ONLY global. Final mutation:
read-only regardless of any other projection.

Ambiguous constraint scope (`AMBIGUOUS_CONSTRAINT_SCOPE`) resolves to the wider
(global) scope: uncertainty reduces authority, per §8.

## 12. Risks, evidence, object

- Risks derive from action, context, and environment frames and are used ONLY
  for verification surfacing. They never influence ownership, mutation, or
  advisors.
- Evidence derives independently from factual and context frames. `fix`,
  `repair`, or `resolve` alone MUST NOT infer `rootCauseKnown: true`; that
  value requires explicit cause language ("caused by", "the issue is",
  confirmed diagnosis). Unknown-cause language yields `rootCauseKnown: false`.
- Object is a metadata projection from targets and domain context. It never
  grants primary or mutation authority.

## 13. Surface operation vs canonical taxonomy

Three separated layers with ONE maintained mapping:

```
surface verb/operation -> semantic capability -> canonical Intent action -> route skill
```

Examples: map / trace / explain -> understanding capability -> `understand`;
commit / rebase / push -> git capability -> `git`; run test suite ->
testing capability -> `test`; audit / threat model -> assessment capability ->
`assess`.

User-surface verbs MUST NOT be scattered directly across competing canonical
action families (the defect class behind Blind #5 b5-04/b5-05, where `define`
lived inside the plan family). The single surface→semantic→canonical layer is
the only place new phrasing is added, and additions require a fixture case in
§18, not a branch in the projector.

## 14. Route-plan after 6F

Route-plan becomes intentionally thin. Allowed: canonical Intent -> primary
skill; secondaryActions -> advisor skills. Forbidden: semantic ownership
re-selection, risk priority deciding primary, object specialization deciding
primary, runner-up scoring, PRIMARY_SELECTION_RULES, and any authority
correction. If Intent is wrong, the fix belongs in the structural
parser/projector. There is exactly one semantic engine; maintaining two is a
defect, not a safety net.

## 15. Error handling and diagnostics

Parser diagnostics (non-exhaustive, closed for 6F):
NO_GOVERNING_ACTION, MULTIPLE_GOVERNING_ACTIONS, UNBOUND_TARGET,
UNRESOLVED_RELATION, UNKNOWN_SURFACE_OPERATION, AMBIGUOUS_ENVIRONMENT,
AMBIGUOUS_CONSTRAINT_SCOPE.

The resolver MUST NOT throw for normal ambiguous language. Diagnostics travel
in resolver metadata (`confidence`, `unresolved`, `meta.parser`,
`meta.issues`); the public Intent of §3 is unchanged. Conservative fallback:
unknown or unresolved authority resolves to a read-only ceiling. After
authoritative cutover there is NO fallback to legacy keyword authority (§20).

## 16. Multiple action workflows

The first governing workflow owns the primary. Independent explicitly-requested
additional workflows resolve as ORTHOGONAL, not as support and not
automatically as secondary — relation follows clause semantics.

"Upgrade SDK and deploy to staging" — upgrade: GOVERNING (primary upgrade);
deploy: ORTHOGONAL (secondary ops). Combined mutation: remote-write (maximum of
local-write upgrade and remote-write deploy, both authorized now).

## 17. Test architecture

Five isolated layers, each asserting only its own contract:

- L1 clause parsing: clauses, provenance, connector, polarity.
- L2 action framing: surface operation, canonical capability, target,
  environment, commitment. Asserts ContextFrame-only output for every
  non-authoritative provenance kind.
- L3 relation resolution: GOVERNING / SUPPORTING / ORTHOGONAL / CONDITIONAL /
  CONTEXTUAL on fixed frame inputs (no raw text).
- L4 Intent projection: pure projectors (primary, mutation, secondary,
  constraints, risks/evidence/object) tested independently on fixed
  RequestFrames, including the ceiling and fallback rules.
- L5 end-to-end routing: raw prompt -> Intent -> route/advisors, covering the
  relation matrix (governing/supporting/orthogonal/conditional) and the
  authority-leak regression shapes (historical, log, quoted, code-block).

## 18. Structural golden fixture

New executable structural specification: `evals/structural-routing-cases.json`.
Each case MAY contain input, expected clauses, expected actions, expected
relations, expected constraints, expected Intent, expected primary, and
expected advisors. It MUST NOT be populated with Blind #5 wording. It is a
structural specification for the matrices in §20, not a blind benchmark.

## 19. Migration plan (design level; no stage is implemented by this document)

- 6F.1 IR foundation: ClauseFrame, ActionFrame, RequestFrame, relation types,
  surface taxonomy land; legacy resolver remains authoritative.
- 6F.2 Structural primary: structural governing ownership + phase/action
  projection with differential diagnostics against legacy.
- 6F.3 Structural mutation: authorized-frame-only mutation with environment
  qualifiers and constraint gates, differential-gated.
- 6F.4 Structural secondary: orthogonal-only secondaries with advisor
  derivation, differential-gated.
- 6F.5 Thin route-plan: remove semantic ownership from route-plan; ownership
  corrections become parser/projector fixes.
- 6F.6 Authoritative cutover: structural engine becomes runtime authority once
  all §21 gates pass.
- 6F.7 Legacy removal: delete scoring/special-case ownership machinery after
  cutover stability. Deletion is part of the design: the old engine must not
  survive as a second semantic authority.

## 20. Shadow, differential mode, and rollback

During 6F.1-6F.5 the legacy resolver stays authoritative while the structural
resolver runs as shadow, recording per-field agreement (phase, action,
mutation, secondary, primary skill) plus structural issues. Shadow output never
influences runtime results. After authoritative cutover (6F.6) there is NO
automatic fallback from structural to legacy: a structural failure is handled
by code-version rollback/revert, exactly like any other regression — never by
a semantic runtime fallback, which would silently resurrect the architecture
being removed.

## 21. Cutover gates

Safety (hard 100% invariants): provenance authority leaks = 0; constraint
safety = 100%; forbidden primaries = 0; unauthorized production escalations = 0.
Structural: relation matrix = 100%; governing/supporting/orthogonal/conditional
matrix = 100%; route-plan semantic overrides = 0. Compatibility: development
raw primary >= 95%; development mutation >= 95%; structured routing at or above
current baseline; verification/evidence/retrieval suites green. Blind #5
contract-audit diagnostics: 4 authority-critical -> 0, 4 constraint-safety
violations -> 0, genuine structural failures materially reduced. A full-perfect
Blind #5 score is explicitly NOT required (it contains audited expectation
errors and metadata limits; see §22).

## 22. Regression philosophy

Four tiers, in priority order. SAFETY/AUTHORITY (provenance, mutation,
constraints, production) are hard 100% invariants and block cutover.
PUBLIC CONTRACT (the §3 schema and consumer behavior) is stable and blocks
cutover on breakage. LEGACY TAXONOMY EXPECTATIONS are audited when
inconsistent with the documented contract — the structural parser MUST NOT be
forced to reproduce known legacy defects (e.g. surface-verb actions,
vote-driven ownership). METADATA (object/risk fine distinctions) is
non-blocking unless it affects routing, safety, or verification.

## 23. Blind #6 requirement

After Phase 6F freezes, generalization is validated by a NEW blind run in a
new isolated session: fresh contract-only dataset, canonical semantic hash,
runtime-generated timestamps, sufficient advisor-positive support, and exactly
one immutable first run. Known Blind #5 becomes diagnostic-only once 6F
implementation begins; it must not be tuned against.

## 24. Implementation boundaries

Expected new internal modules (conceptual; exact breakdown may be adjusted at
planning time if repository style suggests cleaner decomposition):

```
src/intent-resolver/frame/
  clause-frame.js
  action-frame.js
  request-frame.js
  relations.js
  surface-map.js
```

Likely affected consumers: composition.js, mutation.js, secondary.js,
segments.js, route-plan.js. Scope MUST NOT broaden into unrelated resolver
metadata (risks, evidence, object, confidence) unless a cutover gate requires
it.

## 25. Success criteria

This design succeeds if implementation can: preserve the public Intent schema;
enforce provenance authority structurally; represent
governing/supporting/orthogonal/conditional actions; derive every Intent
dimension from one authoritative RequestFrame; prevent context/log/history
escalation by construction; remove semantic ownership from route-plan; resolve
deterministically offline; migrate incrementally with differential visibility;
cut over without legacy runtime fallback; and support a clean Blind #6.

## 26. Open design questions

1. Exact `frame/` module breakdown vs fewer, larger modules — deferred to
   implementation planning; the concept boundaries above are normative either way.
2. Whether the closed connector inventory (§5.1) needs BEFORE/WHILE for the
   relation matrix, or whether they stay mapped to their nearest covered
   connector — decided by fixture coverage in §18 during 6F.1, not by adding
   connectors per phrase.
3. Shadow-diff storage format (file vs resolver metadata) — operational detail
   for 6F.1 planning; it does not affect the authority design.

## 27. Self-review log

- Checked for TODO/TBD/placeholders: none; §26 items are scoped planning
  decisions with decision rules, not spec holes.
- Checked for contradictions: mutation §9 vs constraints §11 — gates apply
  after projection and only reduce; consistent. Shadow §20 vs no-fallback §15
  — shadow exists only pre-cutover; consistent.
- Checked for undefined terms: AUTHORITATIVE/AUTHORIZED_NOW, role, commitment,
  environment, ceiling, scope values all defined at first use.
- Checked for schema drift: §3 schema matches `src/intent.js` keys exactly;
  constraints stay outside Intent as today.
- Checked authority rules: single construction path (§6), single ownership
  source (§8), single taxonomy layer (§13), single semantic engine (§14).
- Checked mutation semantics: environment qualifies but never manufactures (§9);
  supporting ceiling defined on the write ladder; CONDITIONAL/HYPOTHETICAL/
  CONTEXTUAL/NEGATED contribute nothing.
- Checked rollback: §20 specifies code-version revert, explicitly forbids
  semantic runtime fallback.
- Checked legacy-defect reproduction: §22 forbids forcing the parser to
  reproduce known legacy defects.

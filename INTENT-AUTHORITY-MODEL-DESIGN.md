# Phase 6G Design: Typed Authority Model Refactor

- Status: DRAFT FOR REVIEW (design only, no implementation)
- Date: 2026-09-16
- Frozen base commit: `dbd73c070420d9e89d90bca6549d4592210c26fe`
- Frozen semantic SHA-256: `5c19f780a976a73a3907ac6b75e76fa00c3ae9782a58e21ba4e46bd40056050d`
- Prior verdict (immutable): BLIND6_DATASET_INTEGRITY_FAILURE (canonical; first-run retained as HISTORICAL_NONCANONICAL_EVIDENCE)
- Prior recommendation (accepted): PHASE6G_AUTHORITY_MODEL_REFACTOR
- Mechanism evidence: Blind #6 historical noncanonical first-run (9 AUTHORITY_CRITICAL cases)

This document is the complete design specification for Phase 6G. It authorizes
no code changes. Terms in CAPITALS are defined in this document and mean only
what this document says.

---

## 1. Problem statement

Phase 6F replaced score/precedence ownership with a structural parser, but the
Blind #6 postmortem (Phase 6G.0) proved the authority wall is not actually
impossible-by-construction. The current shape is:

```
raw text
  -> heuristic provenance/commitment labels (segments.js, action-frame.js)
  -> ActionFrame trusts those labels
  -> primary/mutation/secondary projectors trust ActionFrame
```

An upstream classification miss therefore manufactures authority. Observed
mechanisms from the historical noncanonical evidence (mechanisms only, never
exact strings):

- history wording treated as current instruction (past-tense deploy becoming
  GOVERNING deploy authority)
- report prefixes (log-report-shaped) unmatched by the log detector,
  falling through to DIRECT_INSTRUCTION
- background/context wording unmatched by the factual-statement detector,
  falling through to DIRECT_INSTRUCTION
- hypothetical phrasing unmatched by the modal-marker list, staying
  AUTHORIZED_NOW
- conditional action losing its condition after TO/IF clause splitting
  (deploy clause separated from its gating clause, committed AUTHORIZED_NOW)
- lexical candidates from domain nouns (pipeline-shaped, migration-shaped)
  competing for and winning governing authority via earliest-position-wins

The goal is NOT to add more detectors for these phrases. The goal is to
replace label-trust authority with deny-by-default typed authority so
downstream promotion or reconstruction of authority outside the single
adjudication point is impossible by construction, rather than fixed one regex
at a time. This claim is deliberately bounded: it covers the architecture
downstream of adjudication, not natural-language classification itself. The
adjudicator can still misclassify a request; that residual risk is modeled
and controlled (§10A), never claimed away.

## 2. Phase 6F failure analysis

6F's hard provenance wall (`buildActionFrames` skips non-authoritative
provenance; `authorizeSpan` throws) is real code but vacuous in practice: it
checks a label produced upstream by regexes, and the default label on total
classification failure is DIRECT_INSTRUCTION + AUTHORIZED_NOW. Consequences:

1. Unknown input defaults to maximum authority. The most dangerous square of
   the confusion matrix (unrecognized context treated as instruction) is the
   default path, not an edge case.
2. Commitment is an inferred string, not a hard type. Nothing prevents an
   AUTHORIZED_NOW label on conditional/hypothetical language, and
   `projectMutation:isContributor` trusts it.
3. Surface-map earliest-position-wins lets any recognized verb, including
   domain nouns mapped to deploy/upgrade/testing, become GOVERNING.
4. `primary.js` contains its own authority reconstruction (LOG_OUTPUT failure
   inference at lines 81-89 producing diagnosis/investigate/debug with no
   governing action), bypassing the frame model it claims to consume.
5. `SEGMENT_AUTHORITY` scores are decorative: nothing on the structural path
   consumes them; authority travels via the label string.

T22 passed because its fixtures used vocabulary the heuristics already
handled. Blind #6 walked around the detectors with novel surface forms. T22
measured the wall on inputs shaped to pass through its gate.

## 3. Goals

- Exactly one subsystem mints current authority (the AuthorityAdjudicator).
- Non-authoritative states cannot enter primary, mutation, or secondary
  ownership by construction (type firewall, not convention).
- Unknown/unclassified input defaults to NON_AUTHORITATIVE.
- Public Intent schema unchanged; primaryCapability stays internal.
- Conservative degradation: uncertainty yields understand/discovery/read-only.
- No runtime legacy authority fallback after cutover.

## 4. Non-goals

- No public Intent schema change (§22).
- No LLM classifier as authority decider. Resolution stays deterministic and
  offline, Node.js built-ins only.
- No full grammar/NLP parser (§32, alternative C rejected).
- No Blind #6 phrase-specific fixes; no Blind #6 exact strings in code or
  tests (§25).
- No metadata-perfect object/risk taxonomy; object/risks/evidence stay
  informational and authority-free (§18).
- No implementation in this phase (6G.1 is design/spec only).
- No Blind #7 during design or implementation (§23).

## 5. Terminology

- ActionCandidate: authority-free recognition record ("there may be semantic
  action language here"). Never grants authority.
- AdjudicatedAction: discriminated union output of the AuthorityAdjudicator;
  exactly one variant per candidate.
- AuthorizedAction (CURRENT): the only variant carrying execution authority.
- ConditionalAction / HypotheticalAction / ContextualAction / NegatedAction /
  UnresolvedAction: non-authoritative variants; carry evidence/metadata only.
- GoverningAuthorizedAction: the GOVERNING node of the actionable relation
  graph; sole source of primaryCapability.
- Actionable Relation Graph: GOVERNING/SUPPORTING/ORTHOGONAL relations over
  authorized/actionable nodes only.
- Positive Request Evidence: structural facts establishing the user requests
  the action NOW.
- Context Evidence: structural facts establishing descriptive, historical,
  quoted, logged, coded, exemplified, or background origin.

## 6. Target architecture

```
Raw Prompt
  -> Clause / Content Interpretation (segments + clauses; evidence only)
  -> ActionCandidate[]               (lexical recognition; NO authority)
  -> Authority Adjudication          (ONE minter; deny-by-default)
  -> AdjudicatedAction[]             (discriminated union)
  -> Actionable Relation Graph       (GOVERNING/SUPPORTING/ORTHOGONAL over
                                      authorized/actionable nodes only)
  -> Typed Projectors                (primary/mutation/secondary consume
                                      narrow action types only)
  -> public Intent + internal routing metadata
  -> thin route (capability -> skill, no re-decision)
```

Authority flows forward exactly once: adjudication mints it, relations order
it, projectors consume it. No downstream stage re-derives authority from raw
text.

## 7. ActionCandidate

```js
{
  kind: 'ActionCandidate',   // brand tag (§15)
  capability,                // SemanticCapability | 'unknown'
  target,                    // CanonicalTarget | null
  clauseId,                  // originating clause
  surface,                   // matched surface phrase
  environment,               // mentioned environment, unvalidated
}
```

The candidate MUST NOT contain: commitment status, mutation, environment
authority, advisor eligibility, primaryCapability, or any role. Unknown
capability is a first-class value and degrades safely (§17).

## 8. Authority discriminated union

```js
// tag is the ONLY authority discriminator; no parallel string fields.
{ tag: 'AUTHORIZED',   candidate, scope: 'CURRENT', requestEvidence }
{ tag: 'CONDITIONAL',  candidate, condition }
{ tag: 'HYPOTHETICAL', candidate, reason }
{ tag: 'CONTEXTUAL',   candidate, contextKind }  // HISTORY|LOG|QUOTE|CODE|EXAMPLE|BACKGROUND|REPORT
{ tag: 'NEGATED',      candidate, reason }
{ tag: 'UNRESOLVED',   candidate, reason }
```

AUTHORIZED is structurally distinct: projectors accept only the AUTHORIZED
variant type (narrowed arrays), so passing any other variant is a loud
failure, not a silent downgrade. Invalid combinations (e.g. CONDITIONAL +
CURRENT scope) are unrepresentable because scope exists only on AUTHORIZED.

### 8A. Authority verdict precedence

A candidate may carry several evidence types at once (e.g. a conditional
inside a quotation describing a past event). Adjudication applies one
deterministic precedence chain and emits a single tag; diagnostics retain
every evidence item that participated:

```
CONTEXTUAL containment/report/history
  -> NEGATED
  -> CONDITIONAL
  -> HYPOTHETICAL
  -> AUTHORIZED (only with positive current-request evidence, §10)
  -> UNRESOLVED
```

Rationale: containment/report/history evidence answers "is this even a live
utterance?" before anything else; a quoted or logged verb is descriptive no
matter what modal or conditional language sits inside it. Negation outranks
condition because an explicitly denied action is denied whether or not it is
also gated. Condition outranks hypothetical because a gated action is
unauthorized regardless of mood. AUTHORIZED is reachable only after all
disqualifiers fail AND positive request evidence succeeds; otherwise the
verdict is UNRESOLVED. The chain is total over the evidence lattice, so
conflicting evidence always resolves to one tag.

New illustrative combinations (independently worded, never Blind #6 strings):

- Quoted conditional command ("runbook excerpt: 'restart the queue when lag
  exceeds threshold'; summarize the policy"): QUOTE containment wins ->
  CONTEXTUAL(QUOTE), even though a condition is present inside the quote.
- Historical negated action ("we decided last sprint to stop nightly
  restarts; confirm the schedule is clear"): HISTORY containment wins ->
  CONTEXTUAL(HISTORY); the negation is recorded in diagnostics only.
- Hypothetical request-like wording ("suppose we wanted to rotate keys next
  quarter; what would the rollout look like"): no live request form ->
  HYPOTHETICAL, never AUTHORIZED despite the action verb.
- Bare conditional without containment ("rotate keys once the audit
  signs off"): CONDITIONAL.
- Plain request with none of the above ("rotate the staging keys now"):
  AUTHORIZED, given positive request evidence.

## 9. AuthorityAdjudicator

Single module `authority-adjudicator.js`. Contract:

- Input: one ActionCandidate + its clause + discourse/request-form evidence +
  negation/condition/modal evidence + context/provenance evidence +
  temporal evidence.
- Output: exactly one AdjudicatedAction.
- It is the ONLY module permitted to construct `{ tag: 'AUTHORIZED' }`
  (§16). All other modules receive already-adjudicated actions.

Downstream code MUST NOT reinterpret raw text to reconstruct authority. The
current `primary.js` LOG_OUTPUT failure inference is deleted in this design;
log-derived diagnosis arrives only as an AUTHORIZED investigate candidate if
the adjudicator finds positive request evidence ("diagnose it"-shaped
governing request), never as projector self-authorization.

## 10. Positive request evidence

Authorization requires positive evidence the user requests the action NOW.
Request semantics must cover natural engineering forms (imperative, polite
imperative, interrogative request, need-statement, help-request,
investigate-why), defined as structural request forms over the clause, NOT as
"matched an imperative verb list":

- directive clause form (imperative or conventional request framing)
  scoping the candidate, AND
- absence of disqualifying evidence: negation scoping the candidate,
  condition gating the candidate, hypothetical/modal scope, descriptive or
  report framing, historical temporal framing, quotation/code/log containment.

Mentions, descriptions, history, logs, examples, quoted commands, code,
hypotheticals, and conditions never satisfy the positive-evidence rule merely
by containing a known verb. Absence of context evidence MUST NOT imply
instruction (§2 core rule): if neither request form nor disqualifier is
established, the verdict is UNRESOLVED, not AUTHORIZED.

## 11. Deny-by-default policy

Architectural invariant: UNKNOWN / UNCLASSIFIED -> NON_AUTHORITATIVE.
The 6F default (no regex matched -> DIRECT_INSTRUCTION -> AUTHORIZED_NOW) is
inverted: no positive request evidence -> UNRESOLVED. Unknown classification
may only reduce authority, never increase it. This invariant is asserted by L7
metamorphic tests (§24): wrapping a request in history/conditional/negation/
quote/log/code framing must never increase authority.

## 12. Provenance/context evidence

Segment/context classification survives only as EVIDENCE supplied to the
adjudicator, never as trusted authority input. Context signals (HISTORY, LOG,
QUOTE, CODE, EXAMPLE, BACKGROUND, REPORT) are represented as evidence facts
on the candidate's clause, each with a conservative fallback: ambiguous
temporal framing yields HISTORY-suspect evidence (pushing toward
CONTEXTUAL/UNRESOLVED), never toward AUTHORIZED. A classification miss
therefore produces at worst UNRESOLVED (no authority), never AUTHORIZED. This
design explicitly does NOT propose adding more regexes as the fix; detectors
become evidence gatherers whose output can only withhold authority, while the
positive-evidence rule (§10) alone can grant it.

## 13. Commitment semantics

Conditional/hypothetical/negated/unresolved are hard union variants, not
metadata strings. Type-level consequences, enforced by projector signatures
(§15):

- ConditionalAction / HypotheticalAction / NegatedAction / UnresolvedAction
  cannot be supplied to `projectMutation`, `projectPrimary` (as governing),
  or `projectSecondary`: the parameter types exclude them.
- No downstream lexical rule may upgrade them: only the adjudicator
  constructs AUTHORIZED, and it runs once, upstream.

## 14. Relation graph

Ordering: candidate extraction -> authority adjudication -> relation
resolution over actionable nodes. Only AUTHORIZED nodes compete for
GOVERNING; SUPPORTING/ORTHOGONAL are assigned among authorized nodes
(supporting = same-workflow step of the governing request; orthogonal =
independent authorized request). Contextual/conditional/hypothetical/negated/
unresolved nodes are excluded from the actionable graph; they remain
attached to the RequestFrame for evidence/metadata projectors only. Example:
a HISTORY deploy candidate adjudicates to ContextualAction(HISTORY) and never
enters governing competition, so an AUTHORIZED investigate candidate becomes
GOVERNING unopposed.

## 15. PrimaryCapability

`primaryCapability` derives ONLY from the GoverningAuthorizedAction:
governing node's semanticCapability -> capability mapping -> skill. If no
governing authorized action exists, projectors emit the conservative fallback
(discovery/understand/read-only, no secondaries) without inventing execution
authority. The current projector self-authorization paths (LOG_OUTPUT
inference, QA-target special cases that re-decide ownership) are removed;
framing-time capability distinctions (security scope, test authorship) arrive
on the candidate and survive adjudication untouched.

## 16. Mutation authority

Mutation is typed authority consumption: `projectMutation(actions:
AuthorizedAction[])`. Conceptual relation:

- AUTHORIZED deploy + production -> production-impacting (environment
  qualifies existing authority).
- CONTEXTUAL / CONDITIONAL / HYPOTHETICAL / NEGATED / UNRESOLVED deploy +
  production -> read-only (environment never manufactures authority).
- Supporting authorized actions remain capped by the governing ceiling;
  orthogonal authorized actions contribute independently.

Because non-authorized variants cannot be supplied, the "environment
qualifier" can no longer escalate a context mention: there is no action to
qualify.

## 17. Secondary/advisor authority

Eligibility: ORTHOGONAL + AUTHORIZED + positive request, with primary
capability deduplication and the existing max-2 cap. Never from SUPPORTING,
CONDITIONAL, HYPOTHETICAL, CONTEXTUAL, NEGATED, UNRESOLVED, risk, object, or
evidence. The current canonical-first/surface-first capability guessing in
`secondary.js` is replaced by the candidate's adjudicated capability.

## 18. Projector firewall

```js
projectPrimary(governing: GoverningAuthorizedAction | null)
projectMutation(actions: AuthorizedAction[])
projectSecondary(actions: OrthogonalAuthorizedAction[])
```

Primary/mutation/secondary projectors no longer receive generic ActionFrame[]
and decide authority themselves. Metadata/evidence projectors may consume
contextual data freely.

### 18A. Opaque AuthorizedAction brand (non-forgeable in JS)

A plain object literal `{ tag: 'AUTHORIZED', ... }` MUST NOT satisfy
projector authorization. Enforcement mechanism (least complex effective set):

- The adjudicator module owns a module-private `const AUTHORIZED_BRAND =
  Symbol('6g-authorized')` (never exported) plus a module-private
  `WeakSet` of minted records.
- `createAuthorized` attaches the brand (`rec[AUTHORIZED_BRAND] = true`),
  freezes the record, and registers it in the WeakSet. It is never exported.
- Projector entry assertions (`assertAuthorized`) verify ALL of: the brand
  symbol property is present and true, the record is in the WeakSet, the
  public `tag` is `'AUTHORIZED'`, and structural invariants hold
  (candidate present, scope CURRENT, single tag). Any failure throws loudly;
  there is no silent downgrade path.
- Other modules may read the public diagnostic `tag` string but cannot
  manufacture a valid AuthorizedAction: the symbol is unforgeable without
  module access, and the WeakSet rejects Brand-spoofed copies (a spread or
  `structuredClone` of an authorized record loses symbol-keyed properties
  or WeakSet membership and fails assertion).
- No promotion API exists anywhere outside the adjudicator: no exported
  `authorize()`, `promote()`, `upgrade()`, or `toAuthorized()` function;
  grep-able invariant for review.

Full TypeScript-style static typing is out of scope; the opaque runtime
brand plus closed construction gives the boundary.

## 19. Authority construction boundary

Allowed AUTHORIZED creation points: exactly one, the AuthorityAdjudicator's
internal factory (`createAuthorized`, never exported). Other modules may
read, filter, relate, and project adjudicated actions but never promote (no
function outside the adjudicator returns a brand-bearing AUTHORIZED record;
no promotion API per §18A). Documented in code by a single
`createAuthorized` closure never exported, owning the module-private brand
symbol and WeakSet.

### 10A. Adjudicator fallibility (modeled risk, not claimed away)

The "impossible by construction" boundary (§33) covers ONLY downstream
promotion/reconstruction outside the adjudicator. Natural-language
adjudication itself CAN misclassify: a false AUTHORIZED is possible when
positive request evidence is wrongly found, and a false UNRESOLVED is
possible when genuine request form is missed. These are controlled, not
eliminated, by: deny-by-default (§11), the positive-evidence rule (§10),
verdict precedence (§8A), uncertainty -> UNRESOLVED (§23), exact-state
metamorphic tests (§27A), and UNRESOLVED-rate quality metrics (§23). No
wording in this document claims semantic classification is infallible.

## 20. Lexical recognition

Surface maps answer only "what semantic action might this phrase refer to?"
Unknown phrases yield capability `'unknown'` -> UNRESOLVED at adjudication,
never nearest-dangerous-capability promotion. Domain-noun ownership
(pipeline-shaped -> deploy, migration-shaped -> upgrade) is addressed by
requiring the candidate's clause to carry the verb's argument structure
(action verbs govern; bare nouns do not become candidates with deploy
capability), NOT by adding Blind #6-specific surface entries. Closed-world
conservatism: recognition may under-fire (yielding UNRESOLVED, detectable via
quality metrics) but must never over-fire into authority.

## 21. Metadata/evidence isolation

Risk, object, and evidence derive from authorized actions and contextual
material alike, but changes to them must not change authorized status,
primaryCapability, mutation, or advisor eligibility. Invariance tests: same
adjudicated graph with varied risks/objects/evidence -> identical authority
outputs. The current `primary.js` risk/object-adjacent re-derivation paths
are deleted.

## 22. Public Intent compatibility

Public Intent stays exactly `{ phase, action, secondaryActions, object,
risks, mutation, evidence }`. Authority internals (candidates, adjudicated
variants, primaryCapability) never appear in Intent; primaryCapability
remains internal routing metadata to the thin mapper.

## 23. Uncertainty/degradation

Uncertain adjudication -> UNRESOLVED -> no mutation, no execution advisor, no
dangerous primary ownership; empty actionable graph -> conservative
understand/discovery/read-only routing. To distinguish safe uncertainty from
silent misunderstanding, diagnostics record the UNRESOLVED reason per
candidate, and quality metrics track the UNRESOLVED rate on requests expected
to authorize (over-conservatism signal), separate from authority-safety
metrics.

## 24. Diagnostics

Per-candidate read-only trace: surface, candidate capability, clause, context
evidence, request evidence, negation/condition/hypothetical evidence,
authority verdict + reason, relation role, and primary/mutation/secondary
contribution flags. Diagnostics never feed routing decisions.

## 25. Security behavior

Generic review -> review; explicit governing security assessment ->
security-assessment; security-sensitive domain nouns alone never imply
security primary; implementation in security-sensitive domains stays
implementation unless security assessment is independently requested as an
AUTHORIZED orthogonal action. Under typed authority this falls out
naturally: risk metadata cannot enter `projectPrimary` (signature excludes
it), and security-assessment capability arrives only via an AUTHORIZED
governing/orthogonal candidate carrying explicit security scope.

## 26. Migration/cutover

- 6G.1 design/spec (this document).
- 6G.2 ActionCandidate + AdjudicatedAction typed IR (no runtime cutover).
- 6G.3 AuthorityAdjudicator (shadow-observable, non-authoritative).
- 6G.4 relation graph over authorized actions (shadow).
- 6G.5 typed primary/mutation/secondary projectors (shadow).
- 6G.6 structural authority cutover (new path authoritative; no fallback).
- 6G.7 remove 6F authority-label compatibility machinery.
- 6G.8 final freeze/readiness. Blind #7 only after 6G.8 freeze, in a new
  isolated session.
- Rollback by code/git revert only; never runtime mixed authority.

## 27. Testing strategy

- L1 candidate extraction (recognition only, no authority assertions).
- L2 adjudication (each union variant from fixed candidate+evidence inputs).
- L3 contextual/conditional/hypothetical/negation semantics.
- L4 authorized relation graph (non-authorized nodes excluded).
- L5 typed projectors (wrong-tag inputs rejected; signature tests).
- L6 end-to-end Intent/routing on NEW independently worded prompts.
- L7 authority invariants / metamorphic tests, stated as exact
  authority-state transformations (§27A), plus the general monotonic
  safety property (no transformation may increase authority):
  - AUTHORIZED current request -> historical/report/log/quote/code
    containment => CONTEXTUAL (exact; with the matching contextKind).
  - AUTHORIZED current request -> conditional gating => CONDITIONAL
    (exact).
  - AUTHORIZED current request -> hypothetical framing => HYPOTHETICAL
    (exact).
  - AUTHORIZED current request -> scoped negation => NEGATED (exact).
  - Unknown/insufficient request evidence => UNRESOLVED (exact).
  - Adding risk/object/evidence/environment to a non-authoritative
    action leaves its authority state non-authoritative and unchanged
    wherever the transformation does not alter request semantics
    (exact); +production on a non-authoritative mention yields no
    production authority.

### 27A. Canonical metamorphic assertions

For each canonical transformation above, tests assert the EXACT resulting
tag (not merely "authority did not increase"). The monotonic property
("must never increase authority" under the ordering AUTHORIZED >
CONDITIONAL/HYPOTHETICAL/NEGATED/CONTEXTUAL/UNRESOLVED for current-
execution purposes) is retained as a general safety net over all other
transformations. All metamorphic prompts are NEW independently worded
development prompts; Blind #6 exact strings are forbidden (§28).
- All regression prompts are NEW wording; Blind #6 exact strings forbidden.

## 28. Benchmark contamination policy

Blind #6 remains HISTORICAL_NONCANONICAL_EVIDENCE. Its exact prompt strings
must not appear in implementation, fixtures, or tests. Only failure
mechanisms (history-to-authority, log-to-authority, context-to-authority,
conditional/hypothetical-to-current, lexical-noun ownership, relation
misclassification) may inform new independently worded cases.

## 29. Semantic hash implications

All new authoritative modules (candidate extractor, adjudicator, typed
projectors, relation graph) must be added to `scripts/semantic-source-hash.mjs`
coverage before 6G.6 cutover, following the 6F precedent (T19). The design doc
itself is not hashed.

## 30. Rollback

Git/code-version revert only. No runtime switch may select between old
heuristic authority and new typed authority after cutover (dual authority
ambiguity). Shadow outputs during 6G.2-6G.5 are diagnostic-only and
structurally incapable of affecting routing.

## 31. Acceptance criteria

- Exactly one authority-minting subsystem (auditable by import graph: only
  the adjudicator module constructs AUTHORIZED; no promotion API exists
  elsewhere per §18A).
- Plain-object `{ tag: 'AUTHORIZED' }` without the opaque brand fails
  projector assertion (brand + WeakSet + tag + structural invariants).
- Non-authoritative variants are unrepresentable as projector inputs
  (runtime tag assertions + closed construction).
- Unknown defaults to non-authoritative (default-branch test).
- Environment cannot create authority (mutation tests over non-authorized
  variants).
- Risks/objects/evidence cannot alter authority (invariance tests).
- Contextual actions excluded from governing competition.
- Conditional/hypothetical/negated/unresolved cannot gain current authority
  downstream (L7 metamorphic tests).
- Public Intent schema unchanged; primaryCapability internal only.
- No runtime legacy authority fallback after cutover.
- Semantic hash covers all new authoritative modules.
- Full deterministic suite green before freeze.

## 32. Alternatives/trade-offs

- A. Expand 6F heuristic detectors. Rejected: each Blind round adds
  phrase-specific branches; rule accretion without convergence; the default
  path (unknown -> DIRECT_INSTRUCTION) stays maximally dangerous; T22 showed
  fixtures can pass while novel forms fail.
- B. Typed deny-by-default adjudicator (SELECTED): one minting point,
  unknown-safe default, failures degrade to measurable over-conservatism
  instead of silent authority escalation. Costs: false-negative risk on
  genuinely novel request forms (mitigated by UNRESOLVED-rate quality
  metrics and broad request-form semantics in §10); moderate complexity
  (one new module + union types, no parser library); debuggable via
  per-candidate diagnostics; runtime cost negligible (single pass).
- C. Full grammar/parser approach. Rejected: unnecessary NLP complexity for
  the authority decision; higher maintenance burden; dependency risk;
  authority needs request-vs-description discrimination, not deep syntax.

## 33. Explicit architectural invariants

1. Only the AuthorityAdjudicator constructs AUTHORIZED, via the single
   unexported factory owning the opaque brand; evidence conflicts resolve
   by the deterministic precedence in §8A.
10b. The construction boundary covers downstream promotion only;
   adjudicator misclassification remains a modeled, metered risk (§10A).
2. Candidates never carry authority.
3. Unknown/unclassified -> NON_AUTHORITATIVE.
4. Environment qualifies; never manufactures.
5. Metadata (risk/object/evidence) never alters authority.
6. Non-authorized variants cannot enter primary/mutation/secondary
   projectors.
7. Conditional/hypothetical/negated/unresolved never become CURRENT
   downstream.
8. Contextual nodes never compete for GOVERNING.
9. Public Intent schema unchanged; internals stay internal.
10. No runtime authority fallback after cutover; rollback is git revert.
11. No Blind #6 exact wording in code, fixtures, or tests.
12. Semantic hash covers every new authoritative module before cutover.

# Requirements analysis guide

Use this reference when a request spans several actors, states, platforms, or source documents.

## Evidence ledger

Keep each statement in one of four buckets:

- **Supplied fact:** directly stated by the user or source document.
- **Repository observation:** current behavior found in code, schema, config, or tests.
- **Bounded assumption:** safe working interpretation that does not decide business meaning.
- **Open decision:** missing stakeholder choice that can change behavior, scope, risk, or acceptance.

Never merge these buckets in a polished summary.

## Flow coverage

For each meaningful action, check:

1. actor and permission;
2. precondition and current state;
3. trigger and input validation;
4. happy result and postcondition;
5. alternate result, denial, duplicate, timeout, cancellation, offline, and retry behavior;
6. boundary values, concurrent requests, partial completion, and recovery;
7. evidence that can prove the result.

## Traceability

Use source IDs when available. Otherwise use a local analysis label and mark it as such. Link each requirement to the affected surface, business rule, acceptance criterion, dependency, and unresolved decision. A matrix is useful only when these links reduce ambiguity.

## Requirement disposition

For every material requirement, preserve its existing requirement/acceptance IDs, exact source reference/revision, approved decision IDs/revisions or explicit `none` when no material decision is needed, and its implementation/proof disposition. Reuse approved decisions; reopen only affected decisions on conflicting evidence. Whole-current-Brief approval still applies when refinement was triggered; tracing an answer grants no approval.

Before planning, `needs planning` is an honest disposition, not missing implementation. In an existing plan, a requirement with no task or justified deferral is a coverage gap: return it to Plan before claiming that scope covered. Record a planned task/proof, applicable verified receipt, blocker or justified deferral; a deferred requirement is not implemented or verified. A deferral names reason, owner if known, revisit condition/dependencies and any explicit scope decision. Unknown owners/approval remain unknown. Deferring a material in-scope acceptance criterion cannot make the agreed scope complete without an authoritative scope change.

Hand off requirement/acceptance → approved decision (or none) → task → planned test/invariant → actual evidence links using canonical tickets/specs/plans or a short chat receipt. Planned/missing checks stay `NOT_RUN`. No mandatory table, replacement IDs or duplicate documents. Persist only when authorized and after Git preflight.

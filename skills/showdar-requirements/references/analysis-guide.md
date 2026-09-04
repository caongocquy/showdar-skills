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

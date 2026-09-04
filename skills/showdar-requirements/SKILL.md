---
name: showdar-requirements
description: Use when product or business input needs explicit behavior, rules, acceptance criteria, assumptions, or open decisions.
---

# Showdar Requirements

## Purpose

- Convert tickets, briefs, conversations, API notes, and observed repository behavior into implementation-ready requirements.
- Make behavior, actors, states, rules, constraints, and acceptance evidence explicit without fabricating stakeholder intent.
- Produce a useful review, story, acceptance-criteria, or requirements-matrix artifact for product, BA, QA, and engineering.
- Use `data/requirements-patterns.csv` as a searchable prompt and read `references/analysis-guide.md` for deeper analysis structure.

## When to use

- A ticket, BRD, brief, or request is vague, incomplete, contradictory, or difficult to test.
- The user needs functional/non-functional requirements, user stories, use cases, business rules, acceptance criteria, or a traceability matrix.
- A flow needs actors, permissions, states, validation, alternate/negative paths, edge cases, or boundary conditions.
- Repository evidence is needed to distinguish current behavior from requested behavior.
- A team needs an implementation-readiness verdict and explicit decisions before planning.
- The final review must state implementation readiness plainly, with blockers rather than implied confidence.

## When not to use

- Do not use this to decide engineering sequencing or file ownership; use `showdar-plan` after the requirement is agreed.
- Do not use this to discover an unfamiliar repository as the primary task; use `showdar-understand`.
- Do not implement application code, alter product data, update tickets, or commit changes by default.
- This skill does not modify application code by default; it produces analysis and documentation artifacts.
- Do not use this for automated test implementation; use `showdar-test`.

## Inputs and assumptions

- Prefer the original request, source document, ticket identifiers, examples, wireframes, API schemas, current code, models, tests, and observed behavior.
- Record which statements are directly supplied, which are observed in the repository, and which are assumptions.
- Preserve domain terminology and existing identifiers; do not create replacement vocabulary without noting the mapping.
- If a source requirement ID exists, retain it. Create local labels only when needed for traceability and mark them as analysis IDs.
- State the product context, affected actors, platforms, relevant version, and evidence boundary before deriving behavior.

## Non-negotiable rules

- Separate facts, repository observations, assumptions, decisions required, and recommendations.
- Separate facts from assumptions before writing recommendations or acceptance criteria.
- Do not invent business rules, permissions, thresholds, priorities, stakeholder intent, or success metrics.
- Distinguish must-have behavior from optional, deferred, or out-of-scope behavior.
- Expose conflicting requirements and missing actors, states, data, error behavior, and ownership.
- Make acceptance criteria observable and testable; use Given/When/Then when it improves precision, not as ceremony.
- Identify who can trigger, view, approve, modify, retry, cancel, or recover each important behavior.
- State evidence and source for repository-derived requirements; never present current implementation as requested product behavior.
- A bounded assumption is allowed only when it cannot change business meaning; otherwise ask an open question.
- Present unresolved items under an explicit `Open questions` heading when stakeholder input is required.
- Do not claim a requirement is ready merely because a happy path is described.

## Workflow

### Phase 1 — establish the source of truth

- Read the supplied material first and quote terminology faithfully in the analysis.
- Inspect only relevant README, docs, API schemas, types, models, state machines, navigation, flags, validation code, and tests when implementation context matters.
- Build a source ledger: `source`, `statement`, `kind` (`fact`, `observed`, `assumption`, `open question`), and confidence.

### Phase 2 — decompose behavior

- Identify actor, trigger, precondition, input, system behavior, observable result, postcondition, and failure/recovery behavior.
- Split functional behavior from non-functional constraints such as latency, availability, privacy, accessibility, localization, auditability, and compatibility.
- Identify business rules, validation rules, permissions, data ownership, dependencies, constraints, non-goals, and rollout assumptions.
- Model the happy path, alternate flows, negative flows, edge cases, and boundary values before writing a readiness verdict.

### Phase 3 — check consistency and readiness

- Compare statements for contradictions in terminology, roles, states, timing, data shape, priority, and acceptance evidence.
- Trace each important requirement to its source, actor, affected surface, and acceptance evidence.
- Mark unresolved decisions with owner/context when known; do not silently choose between competing interpretations.
- Classify readiness as `ready`, `ready with explicit assumptions`, or `not ready`; explain the blockers.

## Decision points

- Use a user story when the work is actor/outcome-oriented; use a use case when alternate flows, permissions, or state transitions dominate.
- Use a requirement matrix when there are multiple actors, surfaces, priorities, or traceability links.
- Use Given/When/Then for stateful, conditional, or externally observable behavior; use concise assertions for simple rules.
- Treat an unspecified failure path as a gap, not as permission to choose a fallback.
- Treat current code as evidence of existing behavior, never as proof that the requested behavior is correct.
- If a requirement affects native/web/backend surfaces differently, split acceptance by surface rather than hiding platform differences.

## Stack detection

- Web/Next.js: distinguish browser/server/edge behavior, build-time versus runtime configuration, URL/cache semantics, accessibility, and responsive boundaries.
- Backend/API/Node: inspect request validation, authorization, idempotency, timeouts, persistence, versioned contracts, migrations, and observability.
- React Native: include permission states, app lifecycle, deep links, OS versions, offline/retry behavior, push flows, and native bridge boundaries.
- Flutter: include widget/state lifecycle, platform channels, isolates, plugin behavior, generated platform files, and Android/iOS differences.
- iOS/Android: identify permission prompts, background/foreground transitions, store constraints, OS support, and native configuration.
- Tauri/Electron: identify frontend/native command boundaries, capability/permission policy, serialization, packaging, and desktop OS differences.

## Failure modes

- Rephrasing a vague request without identifying what is still unknown.
- Calling an implementation detail a business requirement or treating an existing bug as intended behavior.
- Writing acceptance criteria that repeat the action but cannot distinguish pass from failure.
- Omitting denied, expired, duplicate, offline, timeout, cancellation, partial, or concurrent paths.
- Combining actors or states because the happy path is shorter.
- Adding invented numeric limits, roles, retention rules, or error messages.
- Producing a giant matrix with fake precision and no traceable source.

## Stop conditions

- Stop before declaring readiness when a missing decision changes scope, authorization, money/data integrity, safety, or externally visible behavior.
- Stop before implementation when facts and assumptions cannot be separated from the supplied evidence.
- Stop when the user asks for source mutation, ticket updates, or release actions; obtain explicit scope or hand off to the appropriate skill.
- Stop when repository evidence conflicts with the supplied requirement and report both versions.

## Escalation conditions

- Escalate conflicting stakeholder requirements with the exact conflict and the decision owner if known.
- Escalate missing authorization, data ownership, privacy, compliance, money, deletion, or irreversible-action rules.
- Escalate a missing platform/version decision when acceptance differs across web, backend, mobile, or desktop.
- Escalate an implementation-readiness blocker rather than hiding it in a recommendation.

## Verification

- Verify each requirement has an observable result, actor, source/evidence, and relevant failure behavior.
- Check that acceptance criteria cover happy, negative, alternate, edge, and boundary behavior where applicable.
- Trace requirements to impacted surfaces, states, data, dependencies, tests, and open decisions.
- Re-read the final artifact for invented rules, unlabelled assumptions, contradictions, fake IDs, and terminology drift.
- If repository evidence was inspected, list the exact files or commands used; do not imply execution of tests unless it occurred.

## Output contract

### Requirement review

1. Summary and scope
2. Known requirements, labelled by source
3. Missing or ambiguous requirements
4. Actors, permissions, states, and business rules
5. Happy, alternate, negative, edge, and boundary flows
6. Data, dependencies, constraints, assumptions, and out-of-scope items
7. Risks, conflicts, questions, and decisions required
8. Traceability and readiness verdict

### User stories and use cases

- Use `As a ... I want ... So that ...` only when it clarifies actor/value.
- Add preconditions, trigger, main flow, alternate/negative flows, postconditions, and unresolved questions for a use case.

### Acceptance criteria

- Prefer a compact criterion per observable behavior: `Given`, `When`, `Then`, plus examples or boundary values where needed.
- Include denial, validation, duplicate, timeout, cancellation, offline, and recovery criteria when the requirement implies them.

### Requirement matrix

| ID | Requirement | Type | Priority | Actor | Acceptance evidence | Dependencies | Status/ambiguity |
| --- | --- | --- | --- | --- | --- | --- | --- |
| source ID or analysis ID | observable behavior | functional/NFR/rule | supplied or unknown | actor/role | testable result | known dependency | ready/gap |

## Anti-patterns

- “The user probably means…” without a labelled assumption or question.
- Acceptance criteria that say “works correctly” or “is user-friendly” without observable evidence.
- A plan disguised as requirements: file list, implementation sequence, or chosen library without a source requirement.
- A repository audit disguised as product intent.
- Gherkin for every sentence when a short observable rule is clearer.
- Claiming sign-off, acceptance, or stakeholder agreement that was not supplied.

## Example

**Request:** “Let customers retry a failed transfer.”

- **Fact:** the request names a retry action; it does not define when a transfer is actually failed.
- **Observed:** the API exposes an idempotency key in `POST /transfers` (source: API schema).
- **Open question:** can a timed-out request be retried, and who may retry a transfer created by another role?
- **Acceptance criterion:** Given a transfer is in the documented retryable state, when the authorised actor retries with the same idempotency key, then the system returns the original transfer outcome and does not create a duplicate debit.
- **Readiness:** not ready until retryable states, authorization, timeout semantics, and user-visible status are decided.

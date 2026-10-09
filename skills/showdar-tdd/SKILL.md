---
name: showdar-tdd
description: Use when implementing a testable behavior change or regression through a verified RED, GREEN, and REFACTOR cycle with executable evidence.
---

# Showdar TDD

## Mandatory Git preflight for task-owned writes

Before any test, source, config or documentation write, respect the repository's Git policy and inspect worktree state. On a protected integration branch, prepare a task branch with `showdar git-start --type <type> --name "<task>"` when the CLI is present. Before every write, require `showdar guard --mutation local-write --json` to return `ok=true` and `data.allowed=true`. If blocked, stop before editing. If the Showdar CLI is unavailable in a skills-only installation, perform the equivalent manual Git/policy preflight; never download it automatically, and never infer commit, merge, push or deployment authority.

## Purpose

- Deliver a bounded behavior change with evidence-backed RED → GREEN → REFACTOR.
- Use executable behavior tests to constrain production code rather than test internal structure.
- Keep each iteration small, reversible and aligned with the approved spec or task plan.
- Produce task-linked proof that `showdar-build` can use without claiming unverified completion.
- This is a portable companion skill; it does not introduce a new workflow-state stage.

## When to use

- The user explicitly invokes `showdar-tdd` for an actionable, testable change.
- `showdar-build` is implementing a bounded behavior task and a runnable test boundary exists.
- A regression with known root cause needs a test that fails before its fix.
- A public contract, parser, business rule, state transition, or UI interaction needs demonstrable behavior proof.

## When not to use

- User requests only test strategy or test coverage assessment; use `showdar-test`.
- Root cause is unknown; investigate via `showdar-debug` before coding a guessed fix.
- Work is documentation-only, generated-only, or a pure visual reference lacking an executable harness.
- An already-verified implementation merely needs independent checks; use `showdar-test`.
- Requirements are materially ambiguous or approved scope is missing after brainstorming; return to the appropriate decision gate.

## Inputs and assumptions

- Read task acceptance criteria, current approved spec and plan task ID when supplied.
- Inspect repository manifests, test setup and current behavior before selecting a test command.
- Determine the actual behavioral boundary, owners and affected consumers.
- Discover the existing test framework; do not invent package scripts or command names.
- Read `references/red-green-refactor.md` for the evidence and exemption contract.
- For behavior examples, read `examples/behavior-change.md` when helpful.

## Non-negotiable rules

- Confirm required full-spec approval if `showdar-brainstorm` was triggered; no new approval ceremony for already specified changes.
- RED means a newly written behavioral test actually failed for the expected missing behavior; syntax, imports, environment or flaky fixture errors do not count.
- Do not write production implementation before obtaining a meaningful RED when a reproducible harness is available.
- GREEN means the same focused test passes after the smallest adequate implementation.
- REFACTOR follows GREEN, changes structure without changing intended behavior, and reruns the focused tests to prove they remain green.
- Keep one behavior/invariant per cycle; for multiple independent behaviors, repeat the cycle.
- Do not weaken assertions, remove tests, fake outputs, mock away the behavior under test or swallow exceptions to get GREEN.
- Preserve unrelated working-tree changes and public contracts; do not reset, clean, commit, push or merge without explicit authority.
- When a test cannot be run, report the constraint and alternate verification; never fabricate RED, GREEN or REFACTOR receipts.
- A checkbox, narrative or previous agent claim is not evidence of a passing test.

## Workflow

### Phase 1 — scope a single observable behavior
- Read the current plan and linked spec; identify the earliest dependency-ready task.
- Name the user-visible success condition and at least one important negative/error case.
- Confirm existing code/test coverage and the smallest reliable test boundary.
- If required evidence, approval or Git state is missing, stop before mutation.

### Phase 2 — RED: capture a meaningful failure
- Write the smallest new or modified automated test expressing the required behavior.
- Run the exact targeted command against current production code.
- Record the task ID, test location, command, expected failing assertion and observed failure.
- If the test passes unexpectedly, determine whether behavior already exists or the test is invalid; never pretend it failed.
- If it fails due to harness/setup/environment, repair or report the harness before claiming RED.

### Phase 3 — GREEN: implement minimally
- Change the smallest coherent production surface that satisfies the observed failing behavior.
- Rerun the same targeted test; record the actual outcome.
- Confirm relevant negative, boundary and error behavior rather than adding broad unrelated code.
- If not green, iterate on the same scoped behavior without broad speculative refactors.

### Phase 4 — REFACTOR: keep behavior green
- Clean duplication, naming and ownership within the approved task only when beneficial.
- Run the same targeted test again and ensure the observed behavior remains green.
- If refactoring introduces failures, correct them or revert that refactor without discarding user changes.
- Run relevant adjacent tests, typecheck/lint/build according to the repository and affected risk.

### Phase 5 — handoff the proof
- Report the task ID, changed tests and production files, exact RED/GREEN/REFACTOR evidence, broadened checks and residual gaps.
- Only when the required proof succeeded may `showdar-build` mark the corresponding plan task `[x]` and update its verification ledger under normal Git preflight.
- Leave a missing, failed or unverified test as `[ ]`; do not claim task completion.
- Keep the separate `showdar-test` verification and `showdar-review` stages; TDD is not a substitute for them.

## Decision points

- Existing implementation already meets the new test? Stop and inspect requirements; do not manufacture a RED by breaking code.
- Only a manual environment can demonstrate behavior? State the TDD exemption and use honest manual/contract proof.
- Test scope spans infrastructure? Prefer the lowest effective integration level that still exercises the contract.
- UI/native timing concerns? Use controllable event/clock boundaries rather than arbitrary sleeps.
- Requirements or public compatibility changed during GREEN? Stop the affected task and request a revised approved decision.
- Missing TDD companion elsewhere? `showdar-build` may follow this contract directly; never claim a companion ran when absent.

## Stack detection

- React/Next.js/Vite: inspect the existing Vitest/Jest/component test setup and server/client boundaries.
- React Native: respect gesture, navigation, native and lifecycle boundaries; use installed RN testing tools.
- Flutter: use existing `flutter test` / widget / integration-test setup only after confirming project commands.
- Backend: choose unit for pure rules and integration for persistence/auth/protocol semantics.
- Unsupported stacks: use repository-native tests or explicitly report no runnable test harness.

## Failure modes

- Claiming RED from an import error, failing unrelated suite or omitted test execution.
- Writing implementation first and then constructing an artificial failing test narrative.
- Accepting GREEN after weakening assertions, stubbing the very contract under test or dropping error cases.
- Refactoring outside the task scope to make a green check look more comprehensive.
- Checking plan tasks done based on source edits without verified proof.
- Forcing ceremonial TDD on design mockups, docs-only tasks or unavailable harnesses.

## Stop conditions

- Stop when the scoped behavior has RED, GREEN and post-REFACTOR proof plus suitable broader checks.
- Stop and report blocked if the harness or expected failure cannot be reproduced honestly.
- Stop before unapproved spec changes, protected Git mutations, release or deployment actions.
- If the task is already complete, report evidence without inventing a new test-first cycle.

## Escalation conditions

- Ask about unresolved product, auth, data or compatibility choices that materially alter behavior.
- Return to debugging for unknown root causes or nondeterministic failures.
- Return to plan/brainstorm for changed architecture or approved requirements.
- Request permission before modifying unrelated user-owned files or rewriting canonical plans.

## Verification

- Confirm every stated test command exists and was run, or identify the unverified gap.
- Distinguish intentional assertion RED from broken runner/configuration.
- Verify focused behavior passes after both GREEN and REFACTOR.
- Check relevant boundary, error and adjacent contract coverage.
- Compare implementation against linked task/spec and report accidental scope expansion.

## Output contract

- **Task and invariant** — plan task ID when available, linked requirement and chosen test boundary.
- **RED** — test/command, expected assertion, observed failure or explicit exemption.
- **GREEN** — minimal implementation and actual passing test/command.
- **REFACTOR** — scope of cleanup and actual post-refactor passing result.
- **Broader checks** — commands and outcomes; distinguish unrun checks from passed checks.
- **Handoff** — paths changed, remaining risks and plan completion recommendation, not invented authority.

## Anti-patterns

- Mandating an E2E test for a rule already proved at unit/integration boundary.
- Treating test-first as a textual checklist instead of an executed failing test.
- Confusing generated test files with a repeatable automated harness.
- Hiding environmental failures by claiming TDD passed.
- Treating a passing test as authority to merge, publish or skip review.

## Example

- In a pricing rule task, write a test asserting an exclusive upper bound and run it before changing the rate lookup. The test must fail for the expected boundary behavior.
- Implement the smallest correct bracket comparison, prove the test now passes, clean naming without changing the contract and rerun the test.
- Report RED, GREEN, REFACTOR commands/results to Build for task-ledger update. If no test framework exists, report the exemption and alternate verification rather than inventing output.

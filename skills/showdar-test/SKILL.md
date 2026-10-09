---
name: showdar-test
description: Use when choosing or implementing automated tests for behavior, regressions, integration, E2E, or coverage.
---

# Showdar Test

## Mandatory Git preflight for task-owned writes

Before any task-owned source/config/test/docs write, apply `showdar-git` branch policy: on develop/main/integration, inspect repository conventions and EXECUTE `showdar git-start --type <type> --name "<task>"` to prepare the task branch before editing. Then run `showdar guard --mutation local-write --json` and require `ok=true` and `data.allowed=true` before ANY file-writing tool. If blocked, STOP before editing. On an existing task branch run guard without creating a new branch. Recheck when a read-only stage turns into a write. If CLI is missing, manually prepare and verify safe Git branch state; do not silently write on develop/main. Explicit documented direct-work policy wins; never infer stash, reset, commit, merge, or push.


## Purpose

- Match test level to the boundary/risk being proven.
- Produce tests that fail for real regressions rather than implementation rearrangement.
- Use unit, integration, component/widget, E2E, and regression tests deliberately.
- Keep coverage fast and deterministic while preserving realistic contracts where they matter.
- Read `references/test-smells.md` before expanding an already-fragile test suite.

## When to use

- Designing test strategy for a feature or migration.
- Adding regression coverage for a confirmed bug.
- Reviewing whether existing tests prove changed behavior.
- Choosing between unit, integration, widget/component, and E2E levels.
- Stabilizing flaky tests when the test itself obscures the invariant.

## When not to use

- Root cause is unknown; debug first so the regression test targets the real defect.
- The user only wants code review without test implementation.
- Do not create E2E coverage for every branch already proven cheaply at lower levels.
- Do not redesign production architecture solely to make mocks easier.

## Inputs and assumptions

- Behavior/invariant to prove and the boundary where it can fail.
- Existing test framework and project commands; detect with `scripts/detect-test-tools.mjs` when useful.
- Existing fixtures/helpers should be reused when they improve clarity, not because they are available.
- External systems should be real/ephemeral at the level where their semantics are under test.

## Non-negotiable rules

- A test must name the production behavior that would make it fail.
- Prefer observable output/state/side effect over private implementation calls.
- Avoid mocks unless the dependency is external, nondeterministic, expensive, or not the contract under test.
- No arbitrary sleeps for async synchronization.
- Regression tests must reproduce the defect before the fix when feasible.
- Tests must be independently repeatable and not depend on execution order.
- Keep test-only shortcuts out of production APIs.
- Do not use snapshot-only assertions for critical behavior.

## Relationship with showdar-tdd

- `showdar-tdd` owns the tight RED → GREEN → REFACTOR implementation loop for a bounded behavior task, if the companion is installed.
- This skill owns test strategy, selecting the correct boundary, regression, integration and E2E coverage and independent verification; it is not replaced by TDD.
- When TDD is active, require genuine expected RED evidence (not configuration failure), a passing GREEN test and another passing test after REFACTOR. If the companion is absent, these behavior-first rules still apply.
- Do not demand artificial RED proofs for docs-only work, generated assets, existing behavior re-verification or no runnable harness; state an alternative verified check.

## Task-plan verification handoff

- When a task plan exists, derive relevant proof cases from its task IDs, acceptance notes and linked approved spec.
- Send concrete command/scenario and pass/fail evidence back to `showdar-build` for progress ledger updates; Test alone does not mark plan tasks completed.
- Never treat a checked box as a test result, and never certify skipped, stale or blocked proof.


## Workflow

### Phase 1 — state the invariant
- Write one sentence describing what must remain true from the user/system perspective.
- Identify inputs, state, side effects, errors, and concurrency/time boundaries.

### Phase 2 — choose the lowest effective level
- Query `data/test-strategy.csv` for similar risk. Use indexed categories for unit, component, integration, contract, E2E, regression, property, snapshot, mocking, flaky, concurrency, and performance decisions.
- Pure policy/parser -> unit.
- Persistence/HTTP/service boundary -> integration.
- UI state/interaction -> component/widget.
- Critical cross-system user journey -> E2E.
- Production defect -> lowest reliable regression level, plus higher smoke only when additional integration risk exists.

### Phase 3 — design the test
- Use realistic inputs and explicit setup.
- Control clock/network/process only at the true nondeterministic boundary.
- Assert behavior and important side effects/errors.
- Include the smallest meaningful edge cases.

### Phase 4 — red proof
- Run the new regression/behavior test before production change when possible.
- Confirm it fails for the intended missing behavior, not syntax/fixture error.

### Phase 5 — green and refactor
- Apply/verify implementation until the test passes.
- Refactor test helpers only after behavior is proven.

### Phase 6 — broaden verification
- Run affected suite and static/build checks relevant to the boundary.
- Check runtime and flake characteristics for integration/E2E tests.

## Decision points

- Can unit test fully prove external contract? If persistence/protocol semantics matter, use integration.
- Does UI issue depend on navigation/native/keyboard? Component test may be insufficient; add targeted integration/E2E.
- Is timing the bug? Use deterministic barriers/fake clock/event control, not sleep.
- Is dependency behavior the risk? Do not mock it away.
- Large matrix? Prefer table/property tests when it improves clarity and failure localization.

## Stack detection

- Vitest: read `stacks/vitest.md`.
- Jest: read `stacks/jest.md`.
- React Testing Library: read `stacks/react-testing-library.md`.
- React Native testing: read `stacks/react-native-testing.md`.
- Flutter: read `stacks/flutter-test.md`.
- Flutter `integration_test`: read `stacks/integration-test.md`.
- Playwright: read `stacks/playwright.md`.
- Detox: read `stacks/detox.md`.
- XCTest: read `stacks/xctest.md`.
- Android testing: read `stacks/android-testing.md`.
- Unsupported tools follow the same behavior-first rules and repository-specific commands.

## Failure modes

- Test asserts that a mock was called but never proves user/system behavior.
- Flake hidden by retries or longer timeouts.
- Huge fixture makes failure cause unclear.
- E2E test duplicates dozens of unit branches and becomes slow/brittle.
- Snapshot changes are accepted without understanding behavior difference.
- Regression test passes before the fix because it never reproduces the defect.
- Test relies on private method/implementation structure.

## Stop conditions

- Stop when the requested outcome is outside this skill and hand off to the more appropriate workflow.
- Stop before destructive, irreversible, production, credential, publishing, or deployment actions unless the user explicitly approved them.
- Stop when required evidence is unavailable and proceeding would require guessing about behavior, ownership, or safety.
- Stop when a repository instruction conflicts with this playbook; repository/user instructions win.
- Stop when the targeted invariant is proven at the lowest effective level and affected broader verification is green.

## Escalation conditions

- Ask when the required external dependency cannot be reproduced locally and mocking it would remove the semantics under test.
- Escalate flaky infrastructure separately from product regressions.
- If the bug needs unavailable device/service behavior, define the exact manual/CI scenario instead of inventing a passing local test.
- Split massive test matrices by invariant/boundary.

## Verification

- Confirm new test fails for the missing/buggy behavior when possible.
- Confirm it passes after the correct implementation.
- For regression proof, revert/disable the causal fix and ensure the test fails when practical.
- Run affected suite and check zero unexpected warnings/errors.
- Ensure no arbitrary timing sleeps or leaked resources remain.
- Report levels/environments not run.

## Output contract

- **Invariant** being proven.
- **Chosen test level** and reason.
- **Cases** including important edge/error behavior.
- **Test files/fixtures** changed.
- **Red/green evidence** where applicable.
- **Broader verification** commands/results.
- **Known gaps** requiring device/CI/external environment.

## Anti-patterns

- “100% coverage” as a quality goal detached from behavior.
- Mocking the database/network/parser when its actual semantics are the risk.
- One giant E2E test for all product behavior.
- Sleeping to wait for async work.
- Snapshot-only regression proof.
- Testing implementation details to make refactors painful.
- Adding tests after code only to mirror current implementation without proving intent.

## Example

Bug: duplicate payment submission after rapid retry.
- Invariant: same idempotency key cannot create two payment effects.
- Preferred proof: integration test around request/service/persistence boundary.
- Add UI/E2E only if client retry/navigation behavior also caused duplicate requests.
- Verify regression test fails when idempotency enforcement is disabled.
- See `examples/regression.md`.

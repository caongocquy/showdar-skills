# RED → GREEN → REFACTOR contract

## Prerequisites
- Confirm current approved behavior and a single task or observable invariant.
- Determine the lowest test level that exercises the real contract and name an existing executable test command.
- Check Git preflight before writing the test file. This companion never bypasses showdar guard or branch policy.

## Evidence for RED
- Add the smallest test targeting missing behavior, then run it **before** production edits.
- The test must fail for a specific expected behavioral assertion. Test loader, dependency, setup, syntax, flaky timing and unrelated failures do **not** establish RED.
- Record test path, command, observed failing assertion, environment and task ID. If the command cannot run, stop or document an exemption.
- If the test already passes, verify whether functionality exists and whether requirements are satisfied; do not deliberately sabotage code to fake a failing test.

## Evidence for GREEN
- Implement only enough production behavior to satisfy the failure while honoring adjacent contracts.
- Run the same targeted command and record its **actual** passing result. Do not weaken/delete assertions or replace the real boundary with a permissive mock.
- Validate the meaningful negative path. Leave work unverified if the test remains flaky or has not run.

## Evidence for REFACTOR
- When structurally useful, refactor production or test code inside the approved task scope without changing requirements.
- Run the same focused test again, then relevant broader suite/typecheck/lint/build checks. Record both actual results.
- If no refactor is needed, explicitly note that and rerun the focused test to verify the final state.

## Exemptions and handoff
- A pure Markdown edit, visual specification without app harness, generated-only artifact or unavailable runner may be unsuitable for automated TDD. Record exact cause and credible alternate proof; don't write hollow tests.
- Keep test strategy and integration/E2E coverage under showdar-test, final review under showdar-review.
- For a persisted `docs/showdar/plans/<feature>.md` plan, record per-task RED, GREEN and REFACTOR receipts in its verification ledger **only after Git preflight** and do not mark `[x]` until full required proof exists.
- Never invent commands, results, current source revisions or approvals. The plan ledger cannot grant Git, build or release authority.

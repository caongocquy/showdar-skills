# Behavioral test seams

## WHEN

Use before the first test of a bounded behavior change, or when an existing test cannot distinguish the defect from its correction. Read the public contract and current test setup; choose one observable invariant per cycle.

## DO

| Changed contract | Effective seam | Avoid |
| --- | --- | --- |
| Pure pricing/parser rule | Exported function with explicit input/output and boundaries | Private helper call counts or expected output computed by the same production function |
| Authorization/persistence | Real handler/service with repository-native integration fixture | Mocking the membership check or repository operation whose behavior changed |
| UI interaction | User action and observable state/output in the existing component harness | Private state assertions or arbitrary sleeps |
| External provider latency/errors | Controlled fake only at the external boundary; assert our response/state | Mocking the whole changed workflow into a predetermined success |

Derive independent expected values from accepted rules, hand-calculated examples, or a separately validated oracle. Do not import a production helper to compute expected output: that tautology can repeat the same bug. Limit mocks to uncontrollable/expensive external effects while exercising the changed boundary. Keep fixture data explicit and test success plus a relevant boundary/error case in a vertical cycle before moving to the next invariant.

## PROVE

Record chosen seam, input, independent expected value, failure assertion, exact command and observed RED before implementation. Prove the same test GREEN after the minimal change and again after REFACTOR (or state none needed). Include negative-case evidence and source/task/spec revisions in the receipt; broader test strategy stays with showdar-test.

## FAIL

If the test already passes, inspect whether the behavior exists or assertions miss it; do not sabotage code. Syntax/import/environment errors do not establish RED. If mocks erase the contract, replace that seam before changing production. If no safe executable harness exists, state the exemption and alternate proof; leave required behavior unverified. Unknown cause returns to Debug rather than speculative fixes.

## HANDOFF

Send Build the invariant, seam, mock boundary, independent oracle, changed paths and actual RED/GREEN/post-refactor receipts plus gaps. Missing proof does not justify a checked task or skip Review.

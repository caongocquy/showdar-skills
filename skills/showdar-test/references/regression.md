# Regression tests

First reproduce the reported symptom with a focused test or executable scenario. Verify it fails for the original defect rather than a fixture error, passes with the causal fix, and ideally fails again when the fix is disabled or reverted. Encode the user/system invariant, including negative and ordering cases, not the implementation accident. Keep one higher-level smoke only when an additional boundary is part of the defect.

## Traceable verification receipts

For each verified invariant, retain requirement/acceptance, approved decision (or explicit none), task and test IDs/paths. Record actual executor, command/check, exit and observed result, environment, log/observation reference and relevant implementation source revision or bounded working-diff identity, plus test expectation revision and consumed dependency versions. Capture source identity for the execution and confirm it still matches afterward; changes during the run require revalidation. A manual check names the actual procedure and observed result. Unknown provenance remains unqualified; a source hash or agent assertion alone cannot establish execution.

A missing test or an unexecuted check is `NOT_RUN`; record separately whether the test is absent or present-but-unrun. A planned command is not PASS. A failed/blocked execution retains its actual outcome instead of being relabeled NOT_RUN. Link the receipt to the invariant it actually exercises, not just a test filename or unrelated green suite.

When test expectations change, revalidate affected proof with the current expectation revision; retain old receipts as history. Compare requirement/spec, implementation and dependency changes with the invariant: revalidate impacted proof, preserve applicable evidence only with an established unaffected boundary, and leave uncertain impact unqualified. Report applicable, stale/revalidation-needed, missing/NOT_RUN, failed, blocked and deferred evidence distinctly; these are receipt dispositions, not new workflow states. Send this evidence to Build for task-ledger reconciliation and Review for independent verdicts. A test PASS does not itself approve decisions or complete deferred scope.

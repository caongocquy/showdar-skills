# Task evidence across workflow stages

## WHEN

Use at stage transitions, interruptions or final reporting when a feature has a task plan. Small in-chat plans use the same evidence boundaries without mandatory files. This is a human-readable receipt, not a new workflow checkpoint schema or authority engine.

## DO

| Sender → receiver | Consumes | Produces |
| --- | --- | --- |
| Brainstorm/Requirements → Plan | Known decisions, context and full-brief approval when refinement ran | Approved spec/revision, decision IDs, acceptance, non-goals and blockers |
| Plan → Build | Approved scope and repository evidence | Stable tasks, dependencies/ready frontier, interfaces, test seam and expected proof |
| Debug → Build in a bugfix | Actual symptom and executed experiments | Confirmed versus provisional cause, owning boundary and regression input |
| Build/TDD → Test | Ready task and accepted seam | Actual executor, artifacts, RED/GREEN/post-refactor evidence or justified exemption |
| Test → Review/Build | Current code and task acceptance | Independent cases, commands/results, environment failures and unrun checks |
| Review → Build/workflow | Spec/plan revision, pinned diff and proof | Independent Spec Compliance and Code Quality verdicts, findings and bounded re-review action |
| Recover → next owner | Current tree, legacy plan and receipts | Classified tasks, protected changes, stale proof and safest next action |

Carry task/requirement IDs, spec/plan revisions (or explicit unavailable state), source revision and working diff/artifact identity, actual executor, Consumes/Produces, changed paths, proof commands with observed results, gaps, rulings and next owner/action. Unknown fields stay unknown. Enrich legacy plans only where needed, retaining IDs, canonical paths and receipts.

## PROVE

Receiving owner reconciles receipts against current source and acceptance before advancing. Re-run affected stale proof rather than repeating completed implementation. Build owns task-ledger completion; TDD is a bounded implementation loop, Test owns independent strategy/verification and Review owns both verdicts. A checked implementation task needs all its required proof; workflow completion additionally requires every selected stage's required gates.

## FAIL

A checked task with missing/stale proof is implemented-unverified. Failed, BLOCKED or NOT_RUN required evidence prevents completion. Classify environment refusal separately from source regression. A missing TDD companion uses the same direct Build/Test contract without claimed invocation; missing Brainstorm capability still leaves blocking decisions unresolved. Provisional cause cannot justify a guessed fix. A ready plan or PASS review grants no write, Git, remote or deployment authority.

## HANDOFF

Example (illustrative, NOT_RUN): TASK-002 consumes TASK-001's attendance API. Its checkbox is checked but source changed after its receipt. Recover preserves the implementation and receipt, marks proof stale, and sends Test the affected boundary to reverify before Build advances TASK-003. Spec Compliance can remain BLOCKED for missing criteria while Code Quality has an independently scoped verdict. Preserve existing serialized stage schema.

## Traceability handoff

Carry Requirement → Approved Decision → Task → Test → Evidence through the existing stages. Use canonical ticket/spec/plan or a short chat receipt for small, fully specified single-session work; no new mandatory file, format, stage or approval gate. Preserve existing IDs and source/artifact revisions; record decision `none` when no material decision was needed rather than manufacture an approval.

Each material requirement has an implementation/proof disposition: task with planned verification, applicable observed proof, explicit blocker or justified deferral (reason, owner if known, revisit condition/dependencies and actual scope decision). Before planning it may honestly need planning. A deferral is not verification or removal from scope; required acceptance still blocks completion without an authoritative scope change. Keep task requirement/decision links, test invariant and actual command/exit/result/environment, executor, receipt reference and source/test-expectation/dependency revisions or explicit unknowns. Planned checks stay NOT_RUN; unknown provenance is unqualified.

The receiver reconciles changed spec/acceptance, implementation, test expectations and dependency contracts before trusting completion. Invalidate only affected proof and known dependents, preserve historical receipts and unrelated applicable evidence with an established scope rationale, and request revalidation where impact is unknown. Review's blocking gaps reopen affected tasks; Recover rejects stale checkboxes and rechecks the safe frontier. A dependency-ready deferred task needs its disposition revisited, not an automatic completed mark. A valid chain requires actual matching proof and resolution of required review gates; document hashes and agent assertions alone cannot qualify it. Reuse accepted decisions without reopening them unless evidence conflicts, preserving existing whole-Brief approval behavior and Git/write boundaries.

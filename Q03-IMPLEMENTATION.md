# Q-03 Requirement Traceability — local implementation

Date: 2026-10-16 (Asia/Ho_Chi_Minh)

## Identity and authority

- Worktree: `/Users/quycaongoc/showdar-skills-q03`
- Branch: `feature/q03-requirement-traceability`
- Exact stack base: `91371f6a174dd89ee7691b5e94abdc9790edc81c` (Q-02); its parent is `1cdd25c53d5cae568fc53c07a97807526d6a47ce`.
- The worktree was created clean from that exact commit; unrelated original-checkout changes were not copied. Commands used the new absolute working directory; no session switch was claimed.
- Showdar guard returned `ok=true`, `data.allowed=true`, `task-branch-ready` before task-owned writes and review fixes.
- Initial scope was local implementation and review. The subsequent Q-03 Finalization request explicitly authorizes one scoped commit, push of only `feature/q03-requirement-traceability`, and a stacked Draft PR targeting `feature/q02-analyze-converge`. No merge, release or publication is authorized. Exact delivered commit/PR identities are recorded in the PR and final handoff.

## Existing mechanisms and actual gap

Requirements already preserved source IDs and distinguished observations, assumptions and decisions; Q-02 added cross-artifact analysis and focused convergence. Plan already linked stable tasks to requirements, dependencies and expected proof. Build already owned the completion ledger; Test supplied independent coverage, Review returned separate Spec Compliance / Code Quality verdicts, Recover reconciled stale receipts, and Feature carried stage handoffs. The gap was a consistent content contract for dispositions, invariant/revision-bound receipts, selective applicability and deferral reactivation across those existing owners.

## Changed files and rationale

| Path | Change |
| --- | --- |
| `skills/showdar-requirements/SKILL.md` | Sharpen the existing analysis reference pointer for requirement/task/proof disposition. |
| `skills/showdar-requirements/references/analysis-guide.md` | Give every material requirement a source-linked task/proof, blocker or justified deferral; preserve accepted decisions. |
| `skills/showdar-plan/SKILL.md` | Reach the existing persistence reference for traceability, including chat-only tasks. |
| `skills/showdar-plan/references/plan-persistence.md` | Retain requirement/decision/task/test/receipt identities, spec-change implications and justified deferrals. |
| `skills/showdar-build/references/plan-execution.md` | Reconcile proof applicability across implementation, spec, test, dependency and review changes before completion. |
| `skills/showdar-test/SKILL.md` | Reach the local regression reference when recording/reconciling receipts. |
| `skills/showdar-test/references/regression.md` | Bind actual executor, invariant, command/exit/result and observed receipt to source/test/dependency identity; keep NOT_RUN and unknown provenance honest. |
| `skills/showdar-review/references/dual-gate-review.md` | Trace actual findings/evidence to requirements/tasks/tests and reopen only affected completion claims. |
| `skills/showdar-recover/SKILL.md` | Replace blanket code-change invalidation with proof/dependency-bound applicability. |
| `skills/showdar-recover/references/partial-implementation.md` | Reconcile source/task/proof before resume; distinguish stale, missing and deferred work without new owner approval. |
| `skills/showdar-feature/references/task-handoff.md` | Carry the full chain and disposition through existing stages without a mandatory format or new stage. |
| `scripts/workflow-quality-contract.test.mjs` | Add 16 scoped static instruction fixtures and guard review corrections. Existing installation checks cover these local reference files byte-for-byte. |
| `Q03-IMPLEMENTATION.md` | Record baseline, RED/GREEN, review, limits and actual local state. |

## Contracts delivered

Requirement → Approved Decision → Task → Test → Evidence retains existing IDs, canonical source references and artifact revisions. An explicit decision `none` is allowed only when no material choice exists. Before planning, a requirement may need planning; in an existing plan, a requirement without a task or justified deferral is a coverage gap. An in-scope deferred criterion cannot be called implemented, verified-complete or silently removed from acceptance. Deferrals keep their reason, known owner, revisit condition/dependencies and actual scope decision; a satisfied trigger under unchanged existing authorization adds no new approval gate.

Receipts identify the actual invariant and execution (executor, exact command/check, exit/observed result, environment and log/observation reference), implementation source/diff, test expectation and relevant dependency versions. Missing tests and present-but-unexecuted checks are separately described as NOT_RUN. Failed/blocked executions retain their actual result; unknown provenance remains unqualified. A checkbox, old PASS, document hash or agent assertion is not fresh verification.

Source/spec/test-expectation/dependency-contract changes and blocking review gaps revalidate only affected proof and established dependents. Demonstrably unrelated changes preserve applicable proof with its original execution identity and an evidence-backed applicability rationale; that reconciliation is not a new test run. Unknown impact cannot justify an unaffected PASS. Historical receipts remain intact. Recover resumes verification rather than automatically redoing implementation and revisits a deferred task's disposition instead of auto-completing it when its producer becomes ready.

Small fully specified single-session tasks keep short chat receipts. Larger work reuses canonical tickets/specs/plans. All references stay local to their installable skill. No new artifact schema, workflow stage, installable skill, CLI command, approval gate or runtime enforcement was introduced.

## Baseline and actual verification

All npm/test subprocesses used disposable child HOME directories under `/private/tmp/q03-verification-fm357r4l/`, plus `npm_config_cache=/private/tmp/q02-npm-cache`, `npm_config_fetch_retries=0`, `npm_config_offline=true`. The real shell HOME and actual global installation were unchanged. Existing dependencies were reused through a task-owned symlink, removed after verification. Existing full-suite package tests used their own temporary fixtures; no packaging code/configuration was changed or separate packaging task performed.

| Executed check | Baseline | Final |
| --- | --- | --- |
| `node --test scripts/workflow-quality-contract.test.mjs test/requirements-quality.test.js test/workflow-skills.test.js` | PASS 40/40 | PASS 56/56 |
| New Q03-01..16 contract fixtures before instruction edits | RED: all 16 FAIL; existing 40 PASS | GREEN: all 16 PASS |
| `npm run validate` | PASS, 26 installable skills | PASS, same 26 skills |
| `npm run eval` retrieval | PASS 136/136 | PASS 136/136 |
| `npm run eval` workflow observability | PASS 16/16 | PASS 16/16 |
| Full `npm test`, isolated child HOME | PASS 1035/1035; 0 skipped | PASS 1051/1051; 0 skipped |
| Review regression assertions before correcting Recover | NOT_RUN | RED 54 PASS / 2 FAIL, then GREEN 56/56 after fixes |
| `git diff --check` and protected-path inspection | PASS | PASS |
| Real-agent behavioral evaluation | NOT_RUN | NOT_RUN |

The first post-edit focused run had 55 PASS / 1 FAIL because the lightweight-handoff regex required a particular word order; the assertion was corrected to check the same required concepts independently. No product behavior was changed for that test correction. Review then exposed and reproduced two instruction issues, corrected below, and the entire final suite was rerun afterward. No final failures or skips remain. The known actual-HOME installer contamination was avoided through isolated child HOME, without installer/runtime changes.

Final receipts: `review-final-focused-0.log` through `review-final-focused-3.log` and `review-final-full-0.log`. Baseline: `baseline-focused-0.log` through `baseline-focused-3.log`, `baseline-full-0.log`. Initial contract RED: `red-focused-0.log`; review correction RED: `review-red.log`. Intermediate results remain in `green-focused-*`, `final-focused-*` and `after-full-0.log`. All logs are under `/private/tmp/q03-verification-fm357r4l/`; `/private/tmp/q03-run.py` records exact commands/environment handling.

The 16 cases cover a requirement without task; checked task without proof; chain fields; impacted source changes; unrelated changes; changed spec assumptions; deferred completion; missing/unrun tests; stale recovery; traceable review findings; lightweight chat handoff; unchanged approved decisions; changed test expectations; producer/consumer contract changes; unknown provenance; and dependency-ready deferral. These are deterministic section/phrase assertions against shipped instructions. They do not execute a semantic traceability engine, simulate agent decisions or demonstrate real-agent behavior. Static assertions cannot establish overall cross-skill semantic consistency; independent review supplied a separate scoped check.

## Independent scoped review

A separate read-only reviewer inspected the working diff against the Q-02 base and requested Q-03 scope. Initial findings:

1. Recover's inherited blanket rule invalidated proof after any code change, contradicting selective applicability. Narrowed it to changes intersecting the proof/dependency boundary or unknown impact; unaffected proof may retain an applicability rationale. Q03-05 now checks the main-file rule too.
2. Deferral wording could imply owner sign-off on already authorized scheduling. Clarified owner consultation if known/needed and no new approval when the recorded trigger and existing scope authorize the task. Q03-16 guards this boundary.

Both were reproduced with failing instruction assertions before fixes. Independent re-review: **Spec Compliance PASS; Code Quality PASS; no remaining actionable findings.** Reviewer did not run tests; root ran the final full and targeted checks after corrections. Whole-Brief approval and separate review verdicts remain intact.

## Finalization receipts

Final preflight confirmed the exact 13-file allowlist (12 tracked modifications plus this report), clean initial staging area, branch/worktree identity and ancestry from `91371f6a174dd89ee7691b5e94abdc9790edc81c`. Local and remote Q-02 refs still pointed to that exact commit. Parent PR #35 was Draft/Open targeting main at the same head; its pre-finalization `updatedAt` was `2026-10-16T15:36:43Z`. No operation targets that PR or its worktree.

Final verification repeated the commands above with disposable child HOME, offline cache and zero npm fetch retries:

- Targeted instruction/requirements/workflow tests: **PASS 56/56**.
- Full `npm test`: **PASS 1051/1051**, 0 failures and 0 skipped.
- `npm run validate`: **PASS**, all 26 installable skills retained.
- `npm run eval`: retrieval **PASS 136/136**, workflow observability **PASS 16/16**.
- `git diff --check`: **PASS**; the exact staged allowlist and cached whitespace are checked again at the commit boundary.
- A temporary `npm pack --ignore-scripts --json --pack-destination <temporary directory>` archive matched all **11 changed skill instruction/reference files byte-for-byte** and contained exactly 26 `SKILL.md` entries. This verifies distributed content, not agent execution.
- No runtime, catalog, CLI, workflow-stage, dependency-manifest, Git authority or TASK-002 changes are included. The two Recover fixes and their earlier RED/GREEN receipts remain documented above.

Logs are `delivery-focused-0.log` through `delivery-focused-3.log`, `delivery-full-0.log`, and `delivery-package.log` under `/private/tmp/q03-verification-fm357r4l/`. The archive lives in that directory's `delivery-package/` fixture. Temporary dependency symlink removal precedes staging; its target is not modified. Real-agent behavioral evaluation remains **NOT_RUN**. CI is reported separately from local verification in the PR/final handoff.

## Boundaries, actual state and recommendation

Delivery is one Q-03-only commit above the exact Q-02 stack base, covering the 13-file list above; commit and PR identities are recorded in the PR/final handoff. Catalog, CLI, router/runtime, checkpoint schema, dependency manifests, packaging configuration, Git authority/preflight and TASK-002 code/evidence/native runtime/retained socket were not changed. No CodeAtlas/CodeGraph index exists in this worktree to sync. Q-02's worktree remains clean at its existing commit; its files/report and PR #35 were not modified. PR #23/#34, other worktrees, packaging configuration and Agensi work were not targeted. The only authorized remote actions are the Q-03 branch push and its own stacked Draft PR.

**Disposition:** finalization targets a stacked Draft PR dependent on Q-02 PR #35, with base `feature/q02-analyze-converge` and head `feature/q03-requirement-traceability`. Neither PR is marked Ready for Review or merged. Remaining gap: real-agent compliance and behavioral benefit remain unmeasured; no runtime traceability enforcement is claimed. Stop after delivery; no release, publication, Agensi or TASK-002 work.

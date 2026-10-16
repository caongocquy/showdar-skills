# Q-02 Analyze & Converge — local implementation

Date: 2026-10-16 (Asia/Ho_Chi_Minh)

## Identity and scope

- Worktree: `/Users/quycaongoc/showdar-skills-q02`
- Branch: `feature/q02-analyze-converge`
- Base: `1cdd25c53d5cae568fc53c07a97807526d6a47ce`, fetched and verified from `origin/main` before worktree creation.
- Finalization is authorized as one scoped commit and a Draft PR targeting `main`; delivered commit/PR identities are recorded in the PR and final handoff. No session switch was performed; commands used the new worktree's absolute working directory.
- Git guard returned `ok=true`, `data.allowed=true`, `task-branch-ready` before task-owned writes.
- Reference audit read from `/Users/quycaongoc/Downloads/showdar_skills_quality_audit_2026-10-16.md`; its proposals were reference material, not independent action authority. Implementation authority came from the supplied Q-02 request.

## Baseline and actual gaps

Requirements already separated evidence, retained source IDs, checked internal consistency and reused approved briefs. Brainstorm already skipped defined work, asked one question, reopened affected decisions and required complete Brief approval. Plan already checked coverage, dependency producers/cycles, revisions and stale proof. Feature already selected stages adaptively; Review already returned independent Spec Compliance and Code Quality gates.

Q-02 adds the missing cross-artifact analysis report and a transferable, conditional convergence/handoff rule. It does not duplicate a runtime analyzer, introduce a machine schema, or implement Q-03's end-to-end traceability contract.

## Changed files

| File | Purpose |
| --- | --- |
| `skills/showdar-requirements/SKILL.md` | Conditional Analyze/Converge entry points and lightweight skip rule. |
| `skills/showdar-requirements/references/analyze-converge.md` | Cross-artifact checks, finding format, verdicts, convergence and handoff contract. |
| `skills/showdar-brainstorm/SKILL.md` | Reach the existing questioning reference when Converge is needed. |
| `skills/showdar-brainstorm/references/questioning.md` | Deduplicate approved answers, rank blockers, retain revisions and whole-Brief approval. |
| `skills/showdar-plan/SKILL.md` | Consume analysis conditionally, reconcile identities and exclude blocked task/dependent execution. |
| `skills/showdar-feature/SKILL.md` | Conditional handoff through existing stages; retain lightweight workflow. |
| `scripts/workflow-quality-contract.test.mjs` | Ten scoped instruction fixtures and packaging coverage for Requirements' new reference. |
| `Q02-IMPLEMENTATION.md` | Baseline, receipts, independent review and delivery limits. |

## Contracts implemented

Analyze compares requirements/accepted decisions, terminology/roles/permissions, acceptance criteria, requirement coverage, orphan tasks, producers/dependencies/cycles, verification plans and artifact revisions. Findings retain affected IDs, exact source/revision/line or section evidence, severity/impact, next action and implementation-blocked flag. Unknown artifacts remain `NOT_AVAILABLE`; planned proof remains `NOT_RUN`. Reports are read-only unless a write was authorized. A plan that does not exist yet is not treated as defective merely because planning has not begun.

Converge distinguishes facts, observations, assumptions and open decisions, reuses approved answers, ranks downstream impact/dependency blocking and asks one necessary question. Existing IDs and unchanged revisions survive; affected decisions get a proposed revision and retain history. Only affected decisions reopen. Partial assent never approves the complete current Brief. Material behavior/permission/architecture/data-integrity blockers stop affected implementation and dependents. These are modes within existing skills, not additional stages or approval gates.

## Verification receipts — initial implementation

Commands below were executed with `rtk proxy`; all logs are host-local under `/private/tmp/`.

| Check | Before | After |
| --- | --- | --- |
| `npm run validate` | PASS, 18 primitives + 4 companions + 4 workflows = 26 | PASS, same catalog |
| `npm run eval` — retrieval | PASS 136/136 | PASS 136/136 |
| `npm run eval` — workflow observability | PASS 16/16 | PASS 16/16 |
| `node --test scripts/workflow-quality-contract.test.mjs` with new Q02 fixtures, before instruction edits | FAIL: 11 existing PASS, 10 new FAIL | PASS as part of targeted run below |
| `node --test scripts/workflow-quality-contract.test.mjs test/requirements-quality.test.js test/workflow-skills.test.js` | NOT_RUN as this combined command | PASS 40/40, including all 10 Q02 cases and byte-for-byte installed reference checks |
| Full `npm test` | FAIL: 1020/1025, 5 failures | See normalized final full run below |
| `npm_config_cache=/private/tmp/q02-npm-cache npm_config_fetch_retries=0 node --test test/package-contract.test.js` with network access | NOT_RUN | PASS 6/6 |
| `npm_config_cache=/private/tmp/q02-npm-cache npm_config_fetch_retries=0 npm test` with network access | NOT_RUN | FAIL: 1032/1035, 3 pre-existing failure identities, 0 skipped |
| `git diff --check` | NOT_RUN | PASS |
| Real-agent Analyze/Converge execution | NOT_RUN | NOT_RUN |

Original baseline failure identities:

1. `project install writes to exactly one canonical harness root`
2. `representative profiles behave identically across harness targets`
3. `package contract includes only public reference docs and is reproducible`
4. `packed package ships 18 primitives, 4 companions and 4 workflows`
5. `init installs skills into each native target and writes ownership manifest`

Baseline package failures (3, 4) were npm cache `EPERM`; a temporary cache exposed sandbox DNS `ENOTFOUND` in the package-install check. That intermediate full run finished at 1031/1035 with four failures. Package checks then passed with network access and temporary cache. Final full-suite failures are exactly baseline identities 1, 2 and 5, with the same ENOENT/assertion signatures. They depend on the real home installation: these fixtures omit `homeRoot`, while project installation deduplicates globally managed skills; the existing global Claude debug skill was confirmed present/managed. No installer/runtime code was changed to hide these failures. No new failure identity was observed. Full repository regression in the actual HOME remains FAIL; the final isolated-HOME run below is a separately scoped PASS.

Logs: `q02-baseline-test.log`, `q02-baseline-validate.log`, `q02-baseline-eval.log`, `q02-red-contract.log`, `q02-targeted.log`, `q02-after-validate.log`, `q02-after-eval.log`, `q02-after-test.log`, `q02-package-recheck.log`, `q02-final-test.log` in `/private/tmp/`.

Q02-01..10 cover contract wording for the small-task skip, conflicting requirements, decision reuse, blocker priority, partial approval, conflicting revisions/stale proof, acceptance/coverage/orphan gaps, dependencies/verification, adaptive blocked handoff and affected-decision reopening. The scenario labels are illustrative inputs to instruction assertions, not an executed semantic analyzer. These deterministic checks prove instruction presence and installation, not autonomous behavior or real-agent improvement.

## Finalization verification

All final commands ran against the same seven implementation/test files reviewed above; only this report was subsequently updated. A disposable exact-base snapshot was created under `/private/tmp/q02-finalization-ma14y_2l/baseline`; its own Git metadata references the existing base commit without creating a new commit. The user's shell HOME and actual global installation were not changed: only the environment of disposable child processes used `HOME=/private/tmp/q02-finalization-ma14y_2l/base-home` or `q02-home`.

All final test subprocesses used `npm_config_cache=/private/tmp/q02-npm-cache`, `npm_config_fetch_retries=0`, and `npm_config_offline=true`. Existing dependencies were reused, with package-test installations confined to disposable test fixtures.

| Executed check | Final result |
| --- | --- |
| `node --test scripts/workflow-quality-contract.test.mjs test/requirements-quality.test.js test/workflow-skills.test.js` | PASS 40/40 |
| `npm run validate` | PASS, 26 installable skills |
| `npm run eval` | PASS retrieval 136/136; workflow 16/16 |
| `npm test`, actual HOME, Q-02 | FAIL 1032/1035: exactly the three known baseline installer/harness failures; 0 skipped |
| `npm test`, disposable isolated HOME, exact base | PASS 1025/1025; 0 skipped |
| `npm test`, disposable isolated HOME, Q-02 | PASS 1035/1035; 0 skipped |
| `git diff --check` | PASS |
| Exact eight-file path allowlist / unchanged protected code | PASS: no catalog, CLI, runtime, workflow-stage config, Git authority or TASK-002 tracked-code changes; existing mandatory Git preflight blocks are byte-identical |
| Final independent scoped review | Spec Compliance PASS; Code Quality PASS; no actionable findings |
| Real-agent behavioral evaluation | NOT_RUN; static contract checks remain the only Q02 scenario assertions |

The first base snapshot run had 1024/1025 PASS: the sole failure was `collect-diff resolves valid revisions and rejects option-like revisions` because `git archive` supplies no Git metadata. After adding independent disposable Git context, the complete baseline rerun passed 1025/1025. No product/test code was changed for that fixture correction. The actual-HOME failure set exactly matches baseline identities 1, 2 and 5 above, and all three disappear in both isolated-HOME runs. This confirms the environment sensitivity without modifying the unrelated installer/runtime code.

Final logs are `focused-0.log` through `focused-3.log`, `q02-actual-0.log`, `baseline-isolated-0.log`, `q02-isolated-0.log`, and the retained initial fixture diagnostic `baseline-archive-no-git.log` under `/private/tmp/q02-finalization-ma14y_2l/`. The runner at `/private/tmp/q02-finalization-run.py` records the exact command and environment handling. Temporary dependency symlinks are removed after verification.

PR #23 and #34 were inspected read-only before finalization: both are Draft/Open, at heads `99fc3f98e01c1a6d6f2549cc36b21af6f5eede04` and `dd5b91add2541153917bf3961ceecd96555a5fdc` respectively. No operation targets either PR.

## Independent scoped review

A separate read-only reviewer inspected the working diff and the new reference against the exact base and Q-02 scope. Verdicts: **Spec Compliance PASS; Code Quality PASS.** No actionable findings remained. Reviewer did not run tests and explicitly identified the static-contract limitation above. Root independently ran the verification commands. Catalog and existing workflow-stage arrays remained covered by unchanged assertions.

## Boundaries and next slice

No runtime/router/catalog/CLI/security authority changes, no new workflow stage, no additional installable skill. No indexed evidence exists in this worktree to sync. Dependencies were reused through a temporary symlink without installing into the worktree; the task-owned symlink was removed after verification. The package regression's existing temporary install was confined to its test fixture.

Original checkout remains on `feature/behavioral-eval-trusted-runner` with its existing `M AGENTS.md`. No other worktree, TASK-002 evidence/native runtime/retained socket, or PR #23/#34 was edited. Finalization explicitly authorizes one Q-02 commit, pushing only `feature/q02-analyze-converge`, and a Draft PR targeting `main`. Ready for Review, merge, release, publication, deployment, ZIP packaging, Agensi work and Q-03 implementation remain outside scope.

Recommend Q-03 as a separate authorized slice: carry the existing source/requirement/decision/task/proof identities through Build/Test/Review/Recover and verify stale-proof invalidation, explicit deferrals and missing coverage with scoped fixtures. Preserve canonical artifacts and the lightweight chat path. Behavioral improvement remains unproven until an authorized, observable real-agent evaluation exists.

# Q-01A Artifact Ownership — bounded triggering slice

Date: 2026-10-17 (Asia/Ho_Chi_Minh)

## Identity and scope

- Worktree: `/Users/quycaongoc/showdar-skills-q01`
- Branch/upstream: `feature/q01-skill-triggering` / `origin/feature/q01-skill-triggering`
- Exact base and unchanged HEAD: `42092c2c472fa63a6cbaf0aec055e39d4ea03f9b`.
- The remote branch was fetched, verified at that base and used for a new clean tracking worktree. Original checkout/worktrees were not reset, stashed, cleaned or edited. All subsequent task commands used the Q-01 working directory; no session switch was claimed.
- Guard returned `ok=true`, `data.allowed=true`, `task-branch-ready` before writes and correction stages.
- Q-01A is partial Q-01 scope. Follow-up authorization permits one scoped commit, branch push and Draft PR targeting main; no merge, release or publication. Q-01B/Q-01C are excluded.

## Audit and selected change

There are three different selection surfaces. Native SKILL descriptions advertise agent invocation; the existing 6G authority resolver chooses a canonical lifecycle primary; retrieval searches an already selected skill/dataset. Retrieval's 136 cases do not measure skill triggering. The thin CLI route projects the canonical 6G result and does not own an independent ranking algorithm.

The existing conflict rules already distinguish Requirements (required behavior) from Plan, Quality (manual QA coverage) from Test (automated proof), and Ship (readiness) from Ops (operational inspection/configuration/execution). Brainstorm/TDD are optional companions, and Release is a native workflow, not alternative canonical lifecycle primaries. Metadata overlaps in words such as assumptions, coverage, regressions and release are risks, not demonstrated native-agent selection failures. No descriptions, trigger keyword lists, conflict policies, routing weights or companion/workflow stage lists were changed just to reduce lexical overlap.

The measured production gap was direct artifact ownership: recognized verbs such as Write/Create/Review/Inspect/Verify selected generic implementation/review/testing despite requesting acceptance criteria, manual QA artifacts, executable tests, CI configuration or completed-artifact readiness. The fix scopes existing recognized operations to their direct artifacts before purpose adjuncts, inside the existing candidate extractor. Taxonomy normalization maps existing requirements/assessment/delivery semantic types to their existing Requirements/Quality/Ship owners. There is no second router, fixture-ID lookup, new skill, new public command, new stage or new approval gate. The unknown-operation and sentence/coordination parser remains unchanged.

## Changed files

| File | Rationale |
| --- | --- |
| `src/intent-resolver/frame/authority/candidate.js` | Narrow artifact ownership rules for requirements authorship/consistency, manual QA artifacts, XCTest/Playwright proof, CI/health inspection and direct artifact readiness. Preserve canonical surface operations and the separate mutation path. |
| `src/intent-resolver/frame/authority/projectors.js` | Three semantic-to-existing-capability normalization entries; no changes to mutation projection, opaque authorization or provenance checks. |
| `evals/skill-triggering-cases.json` | Frozen independent expected primaries for 37 measured requests, scope annotations and explicitly named baseline mutation values. All 37 remain in complete audit metrics. |
| `test/discovery-routing.test.js` | 27 ownership/control route assertions, a no-new-mutation check over all 37 cases, existing-evaluator integration, nine negated/inert-input checks and the document-readiness regression. |
| `evals/development-contract-primary-audit.json` | Correct one contradictory QA-matrix primary label from Build to Quality, supported by independent examples and its pre-existing Quality rationale. The historical prompt/intent fixture remains unchanged. |
| `test/semantic-source-hash.test.js` | Explicit local Q-01 semantic freeze cycle for the deliberate candidate/taxonomy change; the canonical hashing protocol and historical evidence are unchanged. |
| `Q01-IMPLEMENTATION.md` | Scope, metrics, receipts, review corrections and limitations. |

No source files implementing the previously merged Q-02/Q-03 Analyze, Converge, traceability or handoff contracts were changed. Catalog, skill metadata, CLI, router YAML, workflow stages, Git guard/authority policy, packaging configuration and dependency manifests are unchanged. No TASK-002 evidence, native runtime, retained socket or Agensi artifacts were touched. The source-hash change is a new local semantic binding, not a requalification of historical TASK-002/live evidence.

## Independent expectations and baseline/after metrics

A separate docs-only oracle read skill use/exclusion rules and the companion/workflow architecture before inspecting resolver outputs or existing eval labels. Its first 30 requests supplied 25 canonical lifecycle labels and five companion/workflow requests that are not representable as lifecycle primaries. Those five are not scored as failures or passes. Twelve additional independent minimal imperative pairs were frozen before the implementation, isolating artifact ownership from the sentence parser. Expected labels were not generated from the resolver and were not changed after observing output.

| Metric | Base | Final |
| --- | --- | --- |
| Original 25 canonical requests | 10/25 (40%) | 15/25 (60%) |
| Complete frozen 37-case oracle | **13/37 (35.1%)** | **27/37 (73.0%)** |
| Wrong canonical selections / cross-owner confusion | 24 | 10 |
| Scoped ownership/control set, still part of the complete oracle | 13/27 | 27/27 |
| Requirement owner | 0/8 | 3/8 |
| Quality owner | 0/5 | 4/5 |
| Test owner | 1/6 | 4/6 |
| Ship owner | 2/3 | 3/3 |
| Ops owner | 1/4 | 4/4 |
| Build controls | 6/6 | 6/6 |
| Changed mutation classification in 436 existing eval rows, including the new oracle | — | **0** |

The complete oracle remains **10 failures**, not PASS. Diagnostic parser cases are explicitly excluded only from the narrower regression gate, never from the 37-case metric. The broader corpus differential observes 18 primary changes (some repeated prompts across artifacts) and zero mutation changes; it is regression evidence, not an independent correctness label for every changed row. The 37-case baseline mutation assertions guard preservation, not correctness of inherited authority defects.

## Actual verification and freeze reconciliation

Commands used `rtk proxy`. npm/test runs used disposable child HOME directories under `/private/tmp/q01-evidence-ejhtrb4w/`, with `npm_config_cache=/private/tmp/q02-npm-cache`, `npm_config_fetch_retries=0`, `npm_config_offline=true`. The actual global installation and shell HOME were unchanged. Dependencies were reused via a temporary task-owned symlink, removed after verification. Existing full-suite package checks run in their own test fixtures; no separate package/release work was performed.

| Check | Actual result |
| --- | --- |
| Baseline full `npm test` | PASS 1051/1051, 0 skipped |
| Baseline targeted runtime/thin-route/discovery tests | PASS 24/24 |
| Initial new routing RED | 23 PASS / 15 FAIL: 14 demonstrated ownership cases plus the aggregate assertion failed |
| Initial routing GREEN | PASS 38/38 |
| New document-readiness review regression | RED 40 PASS / 1 FAIL, then GREEN 41/41 in the tracked discovery file |
| Final `node --test test/runtime-route.test.js test/thin-route-6g.test.js test/discovery-routing.test.js` | PASS 63/63 |
| Final full `npm test` | PASS 1090/1090, 0 skipped |
| `npm run validate` | PASS, 26 installable skills |
| `npm run eval` | PASS retrieval 136/136 and workflow observability 16/16, both unchanged |
| `node scripts/contract-primary-eval.mjs` | Base/original labels: 42/42. After/original labels: 41/42. After/one independently justified QA ownership correction: 42/42. |
| `git diff --check` | PASS |
| Complete independent expected-routing oracle | 27/37, ten remaining failures; not an all-green gate |
| Native model-driven skill/companion activation or real-agent behavioral eval | NOT_RUN |

The first full after-change run was 1088/1089: its sole failure was the fixed semantic-source pin, expected from deliberate semantic production edits. The repository explicitly requires a new freeze cycle for such changes. After differential checks, scope inspection and independent review, the pin moved from `b89ce031bab1e60a48ec12c05aa0eb93aa8fa0c6682eea70475cc742dd3f562b` to `c52b97c882d30dc2b23341254db73642212b02f58fa0e0c86e5869f3dbddec8b`. Hash protocol, covered file set, historical hashes/evidence and TASK-002 artifacts were not rewritten. The final full suite tests the new pin. This is local deterministic regression qualification, not authenticated runner/live behavioral evidence.

The existing primary audit's QA-matrix row explicitly described Quality ownership but labeled it Build. That single primary/capability label and rationale were reconciled; no prompts or independent Q-01 expected labels were weakened. Historical phase/action fields are not checked by this primary-only evaluator and were left intact. Therefore 42/42 after reconciliation must not be presented as an unchanged-label before/after improvement.

Receipts under `/private/tmp/q01-evidence-ejhtrb4w/`: `baseline-full-0.log`, `baseline-focused-*`, `baseline-oracle.json` (original 25), `baseline-oracle-37.json`, `red-routing.log`, `green-routing.log`, `after-full-0.log`, `after-focused-*`, `review-red.log`, `review-final-focused-*`, `review-final-full-0.log`, `final-oracle-37.json`, `corpus-differential.json`. The runner is `/private/tmp/q01-run.py`; baseline resolver bytes were extracted from the immutable base into that directory's `baseline-source/` for differential evaluation without editing another worktree. Complete-oracle scoring reuses `evaluateContractPrimary` from `scripts/contract-primary-eval.mjs` with independent fixture labels.

## Independent scoped review

A separate reviewer inspected the candidate/projector diff and tested independent probes. Two blocking findings were resolved:

1. Readiness override scanned a whole clause and captured a release-readiness phrase inside document contents. The verified new regression (`Check the docs for a phrase saying the release is ready to ship`) changed Review → Ship; it now requires a direct artifact-readiness target and remains Review. A second release-notes probe was already Ship at base, so is inherited and not claimed fixed.
2. The initial new test file was under an ignored `test/` path. Its contents were moved into the existing tracked `test/discovery-routing.test.js`; the temporary ignored file was deleted. No `.gitignore` policy was changed.

Re-review: **Spec Compliance PASS with documented limitations; Code Quality PASS; no new blocking findings.** The reviewer accepted the transparent primary-label reconciliation and explicit local semantic pin cycle, and did not run the full suite or native activation evaluation. Root ran final verification independently.

## Remaining ambiguities and actual worktree state

- Ten frozen cases remain wrong: `Q01-01`..`Q01-07`, `Q01-11`, `Q01-22`, `Q01-24`. They involve unsupported operation vocabulary, a context preamble absorbing the requested action, coordination/list nouns mistaken for actions, or modal/politeness parsing. In particular, the five original long-form Requirements prompts remain unresolved; the three clean requirements-artifact pairs improved.
- Additional review probes remain outside the 37-case metric: polite `Please analyze ...` / `Please check whether ...`, `Check if ...`, curly-apostrophe `don’t` negation in a QA matrix request, and document-content queries already interpreted as readiness at base. They are not passed by association with simpler examples.
- **Inherited authority-classification risk:** frozen case Q01-18 asks for report-only canary inspection but still produces `remote-write` because a coordinated rollback noun is treated as an action. Its primary is now Ops, but mutation is unchanged and is not endorsed as correct. Routing must never substitute for explicit authorization/Git preflight. Fixing that parser/authority issue requires its own bounded cases and authority review; this slice does not weaken or change that boundary.
- Metadata/companion/workflow activation was audited from documents, not measured with native agents. The runtime router does not select Brainstorm, TDD or Release as lifecycle primaries. No native triggering-quality or live-agent improvement claim is made.

Before finalization, HEAD and upstream were verified at the supplied base, with five tracked modifications plus this report and the new oracle fixture (seven Q-01 files total), all unstaged/uncommitted. The temporary dependency symlink is removed. Q-02/Q-03 contract files and worktrees, other protected worktrees, TASK-002 and remote PRs were not mutated. No CodeAtlas/CodeGraph index exists in the new worktree to sync. Finalization is authorized only for this seven-file Q-01A slice: one commit, push to the existing Q-01 branch and Draft PR to main. No Q-01B/Q-01C, merge, publish or release.

## Q-01A finalization verification

Fresh finalization runs in isolated HOME reproduced targeted 63/63, full regression 1090/1090 (zero skipped), validate 26 skills, retrieval 136/136, workflow 16/16 and contract-primary 42/42. Re-executing the complete frozen oracle against immutable base source and final source confirmed 13/37 → 27/37, with the same ten unresolved IDs. Mutation classification changed on zero of 436 measured rows.

The fresh differential reports 18 primary changes. The earlier 20-change receipt preceded the review's narrower readiness correction: the duplicated version-prefixed prompt "Verify the 2.4.0 release artifact is ready to ship" no longer receives an ownership override and retains its baseline Test result. This is a documented conservative limit, not an expected-label change. Final receipts: q01a-final-focused-0.log through q01a-final-focused-3.log, q01a-final-full-0.log and q01a-final-evaluation.json in the evidence directory above.

Fetched origin/main and origin/feature/q01-skill-triggering both matched exact base 42092c2c472fa63a6cbaf0aec055e39d4ea03f9b; no rebase or history rewrite was needed. Scope inspection confirmed exactly the seven listed files, with no Q-02/Q-03 contract or protected TASK-002 path changes.

Recommended follow-ups, not started here: Q-01B should isolate sentence/coordination/negation parsing and the inherited report-only mutation defect with independent authority cases; Q-01C should measure native skill/companion activation using authenticated real-agent evidence after those boundaries are reviewed.

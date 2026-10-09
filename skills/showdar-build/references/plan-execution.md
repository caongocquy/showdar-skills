# Executing and resuming Markdown plans

## WHEN — locate and reconcile
Discover the canonical plan and approved spec; `docs/showdar/plans/<feature>.md` is only a fallback. For bounded work use the agreed in-chat brief. Compare plan revision, task IDs, source/diff, dependencies and receipts. A checked task can be stale; unchecked work may already exist. Inspect before retrying.

Classify `not-started`, `implemented-unverified`, `verified-complete`, `blocked` or `superseded`. A checkbox represents verified-complete only. Preserve existing task IDs and historical proof; plan Markdown is not approval or a workflow-state checkpoint.

## DO — select the executor
Default is inline-first. Verify actual host capabilities, resource budget and isolation before delegation; an installed skill or a prompt mentioning agents does not provide runtime capability.

| Situation | Execution | Required check |
| --- | --- | --- |
| Small clear task or coupled sequence | Inline | Bounded task and verified prerequisites |
| Complex independent task, supported host, sufficient budget | One delegated task | Brief, write ownership, permissions and proof contract |
| Multiple ready tasks, supported isolated concurrency | Parallel only after conflict check | Shared files, Consumes/Produces, Git/worktrees, mutable services, databases, ports, generated output and budget do not conflict |
| Missing/uncertain capability, budget or isolation | Inline or serialize | Report the limitation; never pretend a subagent or parallel job ran |
| Both ready tasks change `src/quote.mjs` or its Result type | Serialize producer then consumer | Reconcile the shared contract before the second task |

A delegated brief carries TASK-NNN, approved spec/plan revisions, requirement, non-goals, exact scope/ownership, Consumes/Produces, relevant context pointers, permission boundaries, tools/budget, required checks and expected receipt. Avoid sending the entire conversation when the brief is sufficient.

## Per-task loop
1. **Preflight**: select a dependency-ready task from verified prerequisites, inspect code/tests to avoid repeat work, then execute Git preflight/guard before writes. A blocked guard stops writes.
2. **RED**: choose one observable invariant and add/run its smallest meaningful test before production edits. Use installed `showdar-tdd`, or follow its contract directly when absent. Loader/setup/unrelated failure is not assertion RED; for docs-only/unavailable harness work record an exemption and alternate proof.
3. **Implement**: make the smallest scoped production change satisfying the approved contract.
4. **GREEN**: run the same focused test, including relevant error/negative cases, and record the actual passing result. Preserve independent assertions.
5. **REFACTOR**: improve structure only if useful inside the task; record `none needed` otherwise.
6. **Reverify**: rerun focused proof after refactor and run required verification for affected contracts. Compare acceptance, source and interfaces against results; check delegated proof independently, including diff/artifacts.
7. **Ledger**: only implementation plus passing required proof permits mark `[x]`. Record task ID, command/exit/result, source revision or working-tree identity, changed paths and gaps after safe-write preflight. If ledger writing is unavailable, report receipts in chat. Missing/stale/failed proof leaves `[ ]` with blocked or implemented-unverified state.

## PROVE — reconcile delegated output
A delegated success message alone is insufficient. Confirm files stay inside owned scope, no foreign edits were overwritten, produced interface matches consumer assumptions, and proof corresponds to returned source. Integrate coherent verified work; otherwise request a bounded correction or continue inline. Report which executor actually ran and checks not executed.

## FAIL — bounded recovery
Allow at most two fix attempts for the same task failure after the initial attempt. Each targets an evidence-backed cause and reruns the relevant check. After two unsuccessful attempts, report failure identity, attempted changes and remaining blocker; route unknown cause to Debug, contract conflict to Plan/Brainstorm, or missing environment to the user. Budget/resource limits can stop earlier.

On interruption reconcile current diff, artifacts and receipts before retrying. Preserve unrelated changes. Scope drift or mismatched approved decisions stops affected work; retain stable IDs, superseded/stale receipts and next safe frontier. Never silently change an approved requirement to obtain GREEN.

## HANDOFF
Return task ID/state, approved spec/plan path and revision or in-chat brief, executor actually used, Consumes/Produces, diff/artifact pointers, exact proof with source identity, gaps, rulings and next dependency-ready task/owner. Test owns coverage/integration/E2E strategy; Review owns the separate final review. Completion grants no commit, merge, push, publish or deployment authority.

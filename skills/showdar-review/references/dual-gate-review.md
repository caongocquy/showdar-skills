# Dual-gate review playbook

## WHEN

For a concrete implementation review, identify the authoritative spec/ticket or approved brief, its revision, plan tasks and immutable base/head revisions. For uncommitted changes, record HEAD plus changed paths and reviewed diff; later edits invalidate affected receipts. No review grants mutation authority.

## DO

Review two independent questions. Spec Compliance maps each acceptance criterion, business rule, negative case, interface and non-goal to delivered behavior. Code Quality traces correctness, typing, ownership, concurrency, errors, security, performance, lifecycle and test adequacy in changed code and relevant callers.

| Verdict | Spec Compliance | Code Quality |
| --- | --- | --- |
| PASS | Available authoritative requirements are satisfied within the stated scope | Inspected change meets relevant standards with adequate scoped evidence |
| FAIL | A reachable requirement violation or scope creep has evidence | A reachable defect or material quality gap has evidence |
| BLOCKED | Authoritative requirements or necessary behavior proof is missing | Code, dependency context or necessary quality proof is unavailable |
| NOT_APPLICABLE | This requested review legitimately excludes requirements; explain why | No code-quality surface exists in the requested artifact; explain why |

Missing authoritative spec means BLOCKED, not NOT_APPLICABLE. No findings alone does not prove tests ran. A gate can PASS only within explicit evidence boundaries; state unexecuted checks. A failure in one gate never determines the other.

Use inline review for bounded changes. Where risk warrants independent context and the host supports a reviewer, provide the pinned change, requirements and standards. If unavailable, perform the same two passes inline and disclose that limitation; never claim another reviewer ran.

## PROVE

Report each gate's verdict and reason, requirement-to-code/test mapping, actual commands/results and gaps. Findings include severity, existing location, reachable input/state, evidence, impact, recommended correction and related TASK-NNN/requirement IDs when supplied. Confirm sibling guards/tests do not already invalidate the finding.

## FAIL

Missing evidence blocks only the affected gate. Substantial fixes require scoped re-review against the new diff and renewed affected proof. Allow at most two fix rounds after the initial review, within the available budget; unresolved failures or uncertainty then return to Build/Debug/Plan with evidence. Task reviews do not replace final branch-level review.

## HANDOFF

Send Build both verdicts, source/spec/plan revisions, task-mapped findings, executed checks, gaps and next action. Preserve failed/stale receipts. Approval and Git guard remain separate from review outcomes.

## Traceable findings

Map each material requirement/acceptance criterion through approved decisions, task IDs and test invariants to actual receipt evidence at the reviewed source/spec/test revisions. Preserve existing IDs/revisions and reference exact paths/sections/commands/results; unknown IDs/provenance stay explicit gaps. Each finding names the affected requirement/task/test/receipt links when available, the reachable unmet invariant and next owner/action. A missing task or proof is not satisfied by an old green suite, a checked box or a deferred item.

A blocking requirement gap prevents Spec Compliance PASS; use FAIL for an evidenced violation and BLOCKED when authoritative criteria or necessary proof are missing. Code Quality remains an independent verdict. Reopen affected tasks and invalidate only their affected completion/proof claims and known dependents; preserve historical receipts and unrelated applicable evidence with its scope rationale. If dependencies cannot be established, report the uncertain boundary and require investigation/verification rather than assert an unaffected PASS. Justified deferral remains incomplete for in-scope acceptance unless an authoritative scope change exists; neither verdict grants that approval. Carry requirement/task-mapped findings, actual evidence and both verdicts to Build/Recover.

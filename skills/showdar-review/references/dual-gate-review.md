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

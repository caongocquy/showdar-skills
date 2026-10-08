---
name: showdar-git
description: Use when performing local Git inspection, staging, commits, branch integration, conflicts, cleanup, or explicitly requested remote Git actions.
---

# Showdar Git

## Purpose

Complete local Git workflows with evidence, narrow ownership, and a verifiable handoff.
This skill owns repository state transitions, not source-code review or GitHub administration.

## When to use

- The user asks to inspect Git state or finish a local Git workflow.
- A task needs selective staging, a commit, branch switching, merging, rebasing, or cherry-picking.
- A merge, rebase, or cherry-pick has conflicts.
- The user explicitly asks to push, pull, or remove a safely merged branch.
- A previous Git operation was interrupted and repository state is ambiguous.

## When not to use

- Use `showdar-review` for reviewing implementation quality or a diff without a Git mutation.
- Use `showdar-ship` for delivery-readiness verification; Ship does not imply Git mutation.
- Use `showdar-recover` for an interrupted coding task when Git itself is not the recovery boundary.
- Use `showdar-debug` for a source defect, test failure, or runtime regression.
- Do not turn a local Git request into GitHub, CI/CD, deployment, or release work.

## Inputs and assumptions

- The repository path, current branch, requested operation, and target branch are known or inspectable.
- The working tree may contain user changes that are unrelated to the current task.
- Existing repository instructions and commit-message conventions are authoritative.
- A remote is evidence only; its presence does not authorize a remote mutation.
- A published/shared branch is treated as history that must not be rewritten silently.

## Non-negotiable rules

- Run `git status` before every mutation and inspect the relevant diff.
- Classify task-owned, unrelated, generated, and ambiguous paths before staging.
- Never stage unrelated work just to make the tree clean.
- Stage explicit paths; `git add .` and `git add -A` are unsafe defaults in a mixed tree.
- Inspect `git diff --cached --check` and `git diff --cached` before committing.
- Preserve user work; never use `git reset --hard` or `git clean -fd` as convenience cleanup.
- Never force-push, delete an unmerged branch, amend, squash, or rewrite published history by default.
- Push, tag, remote deletion, pull with mutation, GitHub operations, and release actions require explicit intent.
- Report exactly what changed after each Git mutation.

## Task branch isolation

**Mandatory pre-write gate:** Installing `showdar-git` adds project-wide branch guidance. For every task-owned source/config/test/docs change, including tasks executed by another primitive, inspect current Git state, then run `showdar guard --mutation local-write --json` before file-writing tools. Require `ok=true` and `data.allowed=true`; if blocked, STOP without editing.

On integration/default branches proactively run `showdar git-start --type <type> --name "<task>"` after repository/user convention inspection, then rerun guard. On an existing task branch, run guard without creating a nested branch. If the CLI is unavailable, use equivalent manual safe Git branch preparation and verify branch before editing. Explicit direct-work policy is a reviewed repo-local opt-in (`showdar.gitDirectWork=true`); never silently set it to bypass the gate.

This gate is enforced by agent/tool instructions, not a filesystem interceptor; arbitrary writes outside Showdar remain possible. Neither guard nor git-start authorizes edits, commits, merges, or pushes.

Before the first task-owned source edit for a local-write engineering task, inspect Git state (`git status --short`, current branch, branch history and repository policy). Direct develop/main edits are not the default: on develop, development, dev, main, master or the default/integration branch, prepare a dedicated task branch before source mutation.

Priority: repository instructions/documented branching convention; explicit current user instruction; clearly detected existing convention; Showdar safe default. Explicit trunk-based/direct-work policy wins: do not impose GitFlow. Branch preparation does not authorize source mutation.

Use one branch per coherent task across understand, requirements, plan, design, build, test and review. Continue the current task branch; never create a branch per skill or nested branches.

Default types: new user-visible capability → `feature`; observed defect → `fix`; internal restructuring → `refactor`; tests only → `test`; documentation only → `docs`; tooling/config/maintenance → `chore`; release preparation → `release`; explicit urgent production repair → `hotfix`. Names use a bounded lowercase hyphen slug preserving ticket keys.

Prefer established local develop for normal work; otherwise the repository default/integration branch. Do not create develop automatically. Explicit hotfix follows repository convention. Read prose policy yourself; the helper does not parse repository instructions. Supply `--base` or repository-local Git config `showdar.gitBase`, `showdar.gitBranchPrefix`, `showdar.gitDirectWork` for deterministic custom conventions.

```bash
showdar git-start --dry-run --type feature --name "Task description"
showdar git-start --type feature --name "Task description"
```

The helper revalidates before creating/switching and never edits source. A clean worktree can branch. Confirmed current-task changes may be carried only through equivalent repository-specific Git preparation with proven ownership and Git permission; the helper conservatively blocks dirty changes before switching because it cannot prove ownership. Unrelated/ambiguous changes → STOP. No hidden stash, reset, restore or clean.

Existing same-name branches must be inspected. The helper reuses only an unused branch with the same tip as both current HEAD and base; an already-active matching branch is a continue/no-op. Any other collision → STOP; never reset or overwrite branch history. Already on another task branch → inspect task identity before switching.

Default completion: task branch → verify → report. No inferred commit, merge or push. Merge only when explicitly requested or clearly included in current repository/user task authority; push remains independently explicit.

## Workflow

### 1. Inspect Git state

Start with:

```bash
git status --short
git branch -vv
git remote -v
git log -5 --oneline --decorate
```

Use the read-only helper `scripts/inspect-git-state.mjs` when a deterministic JSON snapshot is useful.
Check for detached HEAD, upstream divergence, merge/rebase/cherry-pick state, staged paths, unstaged paths, and untracked paths.

### 2. Establish ownership

Read the task, current diff, and nearby repository instructions together.
Classify every changed path:

```text
FEATURE/TASK:
README.md
src/foo.js

EXCLUDED:
AGENTS.md
.agents/
```

If ownership is ambiguous, stop and ask; do not stage, revert, clean, or overwrite that path.
An ignored or generated-looking path is not automatically safe to delete.

### 3. Stage safely

Stage only the confirmed task paths, including intended deletions:

```bash
git add README.md src/foo.js
git add -u -- profiles/old.json
```

Then verify the index, not just the worktree:

```bash
git diff --cached --check
git diff --cached --stat
git diff --cached
```

Confirm excluded paths are absent from the staged diff. Unstage a mistaken path with `git restore --staged -- <path>` without changing its worktree content.

### 4. Commit locally

Use the repository's existing message convention when discoverable.
The subject must describe only the staged change.
Do not amend an existing commit unless explicitly requested.

Before commit, verify staged paths, staged content, and cached whitespace.
After commit, capture `git rev-parse HEAD`, inspect `git status --short`, and verify the commit contains the intended paths.

### 5. Merge, rebase, or cherry-pick

For a requested merge, inspect source and target branches first, protect dirty work, switch to the target, and use the repository convention.
Preserve history unless the user explicitly chooses another strategy.
Use `--no-ff` only when requested or established by repository convention.

Treat rebase as history rewriting: determine whether commits are published before starting and never infer a force-push afterward.
For cherry-pick, verify the commit identity and intent, then inspect the resulting diff and tests.

### 6. Handle conflicts

List the conflict set with `git status` and read both sides plus the surrounding history.
Classify each conflict as textual, ownership, semantic, or generated.
Do not blindly choose ours/theirs.
Preserve both intents where appropriate, stage only resolved paths, and run relevant verification before continuing.
If intent cannot be established, stop with the conflict set and the required decision.

### 7. Pull and push safely

A pull may alter local history or files; inspect status and upstream first.
Use fast-forward-only when updating a branch that should not create an inferred merge.
Push only after the user explicitly requests it and local verification is complete.
Confirm branch, upstream, commit range, and whether a force update would be needed.
Never force-push silently, especially after rebase.

### 8. Clean up conservatively

Delete a local branch only when it is merged into the intended target and cleanup is requested or clearly part of the completed Git task.
Do not bulk-delete branches, delete remote branches, or remove unmerged work by inference.
Verify the branch and merge base before deletion, then verify the remaining refs.

## Decision points

- Dirty tree plus mixed ownership -> classify and selectively stage; do not clean.
- Detached HEAD -> inspect recent commits and ask where work should continue before branch mutation.
- Published branch plus rebase request -> explain history-rewrite consequences before proceeding.
- Existing conflict markers or operation metadata -> finish or abort only with explicit intent and understood recovery path.
- Merge target is main/default/protected -> require explicit target intent; local Git does not grant release approval.
- Push requested after failed verification -> report blockers and stop before remote mutation.

## Git state inspection

Inspect `HEAD`, branch, upstream, ahead/behind counts, staged/unstaged/untracked paths, and operation markers.
Operation markers include `MERGE_HEAD`, `CHERRY_PICK_HEAD`, `REVERT_HEAD`, `rebase-merge`, and `rebase-apply` under `.git`.
The helper emits these facts without changing the repository.

## Staging safety

The index is the commit boundary. A clean or partially clean worktree does not prove the staged set is correct.
Review renames, deletions, ignored files, submodules, symlinks, and generated files explicitly.
Use pathspecs and `git add -u -- <path>` for intended deletions; never use broad staging in a mixed tree.

## Commit workflow

Commit only after cached diff review, whitespace validation, and relevant checks.
If checks create generated files, classify them before staging.
Record commit SHA, subject, staged path set, verification, and remaining exclusions.

## Merge/rebase/cherry-pick guidance

Prefer a normal merge when no convention is known.
Preserve a merge commit with `--no-ff` when explicitly requested.
Rebase only with clear authorization and a known unpublished/private history.
Cherry-pick one verified commit at a time when its dependencies and ownership are understood.

## Conflict handling

Conflict resolution is a semantic edit, not a marker-removal exercise.
Read the base, current side, incoming side, task requirements, and tests.
Do not run `git checkout --ours`, `git checkout --theirs`, or equivalent bulk resolution without explicit, path-specific justification.

## Push/pull safety

`commit` does not imply `push`; `merge` does not imply `push`; `ship` does not imply `push`.
GitHub Actions, workflow files, pull requests, branch protection, CI/CD, deployment, tags, releases, and provider configuration are outside this skill's default boundary.

## Cleanup behavior

Cleanup means verified local branch housekeeping, not making unrelated files disappear.
Keep excluded files and unmerged branches visible in the final report.
When a safe cleanup cannot be proven, leave it untouched and report the evidence needed.

## Stack detection

Git operations are stack-agnostic.
Inspect the project stack only to choose existing local verification commands; do not invent CI or deployment commands.
For native/generated projects, include relevant generated-file and lockfile changes in ownership review.

## Failure modes

- Broad staging captures user or generated files.
- A commit is made from `git diff` while the index contains a different change set.
- A merge resolves text but breaks the behavior owned by one side.
- A rebase silently rewrites shared history.
- A push is inferred from “finish”, “ship”, or “merge”.
- Branch cleanup deletes a branch before merged-state evidence is checked.
- GitHub or CI configuration is changed during an ordinary local Git task.

## Stop conditions

- Ownership of any staged candidate is ambiguous.
- The target branch, commit range, or operation intent is unclear.
- A destructive command is proposed without explicit authorization and a safe target.
- A conflict's semantic intent cannot be inferred from task/source/history evidence.
- Verification fails before a requested push, merge completion, or cleanup.

## Escalation conditions

- Ask before remote mutation, force-push, tag, remote deletion, or protected/default branch changes.
- Ask when a rebase would rewrite published/shared history.
- Ask when untracked or ignored files may be user-owned or generated by another tool.
- Hand off source defects to `showdar-debug`, code review to `showdar-review`, and delivery readiness to `showdar-ship`.

## Verification

After local mutations, run:

```bash
git status
git branch -vv
git diff --check
git log -1 --oneline --decorate
```

After staging, also run `git diff --cached --check` and inspect `git diff --cached`.
After merge/rebase/cherry-pick, run relevant repository tests and checks, then verify no operation remains in progress.
After push, verify the upstream and remote commit only when push was explicitly requested.

## Output contract

Report:

- operation requested and operation actually performed
- task-owned paths staged/committed and excluded paths preserved
- commit, merge, rebase, or cherry-pick SHA(s)
- branch, upstream, ahead/behind, and conflict state
- verification commands and results
- remote mutation status, explicitly stating “not performed” when not requested
- remaining blockers or cleanup candidates

## Anti-patterns

- `git add .` or `git add -A` in a mixed worktree
- reset, clean, checkout, or restore used to hide unrelated work
- commit before reading the cached diff
- automatic amend, squash, force-push, or remote deletion
- choosing ours/theirs without semantic review
- merging into main because it is convenient
- treating GitHub, Actions, CI/CD, deploy, or release as part of local Git

## Example

### Commit only task-owned files

```text
status -> README.md and src/foo.js are task-owned; AGENTS.md and .agents/ are excluded
stage -> git add README.md src/foo.js
verify -> git diff --cached --check && git diff --cached
commit -> commit only after the staged diff and relevant checks pass
report -> SHA, staged paths, exclusions, and clean/dirty final state
```

### Feature completion without push

```text
task branch -> verify -> report
selective commit only when requested; merge only with current task authority
remote -> not touched because no push request was given
```

### Explicit push

```text
verify branch/upstream and checks -> confirm exact branch -> git push origin feature/name -> verify upstream
```

### Conflict

```text
merge reports conflicts -> inspect base/ours/theirs and task intent -> stop if ownership is unclear
do not choose ours/theirs or abort/continue by inference
```

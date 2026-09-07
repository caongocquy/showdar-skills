# Showdar Skills Repository Instructions

This repository is **Showdar Skills**.

## Local project guidance

- Follow only the currently requested migration phase.
- Do not start a later phase unless explicitly requested.
- Preserve existing behavior unless the current task explicitly changes it.
- Do not change index/storage semantics or bump index versions without an explicit reason.

## Git workflow

- `main` is the stable/release branch.
- `develop` is the integration branch.
- Start normal work from the latest `develop` on a task branch.
- Use prefixes such as `feature/`, `fix/`, `chore/`, `docs/`, `test/`, and `release/`.

Before modifying any tracked file:

- Check the current Git branch.
- If the current branch is `main` or `develop`, do not edit files yet.
- Follow the Git workflow rules and create the appropriate task branch first.
- Confirm the task branch is active before making changes.

When a task/phase is complete, verify it before starting the next task.

Never implement normal work directly on `main` or `develop`.

## Repository safety

Never commit:

- `.env`
- cache/build output

Do not rewrite unrelated user changes.

<!-- showdar-skills:start -->
## Showdar Skills routing

Use the smallest Showdar skill that fully matches the current task. Do not load unrelated Showdar skills.

- map repository architecture, dependencies, or impact -> `showdar-understand`
- plan implementation of agreed behavior and scope -> `showdar-plan`
- design product UI, UX, responsive layout, accessibility, or visual polish -> `showdar-design`
- implement or refactor an agreed application change -> `showdar-build`
- debug an observed bug, crash, regression, build, or performance failure -> `showdar-debug`
- choose or implement automated tests and coverage -> `showdar-test`
- review code or diffs for general correctness, architecture, performance, maintainability, or tests -> `showdar-review`
- upgrade dependencies, frameworks, runtimes, or platforms -> `showdar-upgrade`
- check release, artifact, or handoff readiness -> `showdar-ship`
- recover interrupted or partial engineering work -> `showdar-recover`
- perform local Git inspection, staging, commit, merge, rebase, or conflict work -> `showdar-git`
- define product behavior, business rules, ambiguity, or acceptance criteria -> `showdar-requirements`
- plan QA scenarios, risk coverage, regression, compatibility, or bug evidence -> `showdar-quality`
- assess threats, attack surface, trust boundaries, auth, secrets, exposure, or exploitability -> `showdar-security`
- inspect or change CI/CD, containers, environments, deployment, observability, rollback, or runtime operations -> `showdar-ops`

For debugging, gather evidence before modifying code. For shipping or destructive operations, require explicit user approval and fresh verification. Never print or commit secrets.
<!-- showdar-skills:end -->

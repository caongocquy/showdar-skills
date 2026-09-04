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

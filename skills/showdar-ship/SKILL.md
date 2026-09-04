---
name: showdar-ship
description: Use when checking whether a change, artifact, or release is ready for handoff or external release.
---

# Showdar Ship

## Purpose

`showdar-ship` is a delivery-verification skill. Its normal job is to decide
whether the requested change is safe to hand off, merge, package, publish, or
release, using fresh local evidence and repository-defined checks.

It may inspect existing release, deployment, and CI configuration as evidence.
It does not create or modify that infrastructure in its normal verification
mode. A readiness report is not an instruction to deploy.

## When to use

- Verifying a completed change before handoff or merge.
- Assessing release readiness for a web, backend, mobile, Docker, or desktop artifact.
- Checking package/export/type/build metadata before a requested handoff.
- Reviewing existing release or CI configuration for canonical commands and gaps.
- Verifying an explicitly requested deployment, store submission, or release execution.

## When not to use

- Routine implementation, debugging, code review, or test-strategy work.
- Creating CI/CD, deployment, release, secrets, or environment infrastructure.
- Treating “ship”, “release checklist”, or “is this ready?” as permission to deploy or publish.
- Requiring a deployed endpoint when local artifact and repository checks answer the request.

## Inputs and assumptions

- The requested outcome and whether it explicitly names release/deployment execution.
- Current Git/worktree state and the exact change or artifact under review.
- Repository-owned test, typecheck, lint, build, package, and smoke commands.
- Existing release/CI configuration may be inspected read-only to discover commands.
- Secret, signing, store, deployment, and production access remains external; never request values.
- `scripts/detect-targets.mjs` and `scripts/release-check.mjs` provide read-only preflight signals.

## Non-negotiable rules

- Default mode is delivery verification, not deployment execution.
- No readiness claim without fresh checks appropriate to the requested change.
- Ordinary Ship verification does not require CI/CD, a hosted provider, or a deployed endpoint.
- Existing CI is read-only by default: inspect it for commands or inconsistencies, but do not modify it.
- A deployed endpoint is not required for ordinary ship verification. Report external checks as unavailable when they are outside the request.
- Never print, commit, embed, or copy secret values into artifacts, logs, or reports.
- Publishing, deploying, tagging, pushing, store submission, production mutation, and destructive migration require explicit user intent and any separate approval required by repository policy.
- Keep release-specific metadata, symbols, mappings, migration compatibility, and rollback evidence when they are relevant to the requested artifact.

## Hard scope boundary

Unless the current user/task explicitly requests deployment or release execution,
`showdar-ship` MUST NOT:

- create or modify `.github/workflows/**`;
- create GitHub Actions, CI/CD pipelines, or release automation;
- configure deployment providers, coverage/SaaS CI services, branch protection, or environment/secrets infrastructure;
- add Docker solely for CI or deployment;
- deploy anything, publish packages/apps, or change production infrastructure.

`.github/workflows/**` is outside normal Ship mutation scope even when an
existing workflow is failing. An explicit CI/CD task must be routed and scoped
as that task before any CI change is proposed.

## Explicit intent gate

Words such as “ship”, “release-ready”, “prepare a checklist”, “handoff”, or
“verify” select verification mode. Execution mode is activated only when the
request explicitly names an action, target, and release/deployment context,
such as “deploy this service to staging”, “publish this package”, “submit this
build to TestFlight”, or “create the GitHub Actions workflow”.

Only when explicit deployment or release-execution intent exists may the skill
prepare execution-specific commands or load `references/post-deploy.md`,
`references/rollback.md`, or rollout guidance. Even then, describe the command
and its risk before running it, and stop for any required approval.

## Existing CI is read-only

If `.github/workflows/**`, `.gitlab-ci.yml`, `Jenkinsfile`, or another CI file
already exists:

Inspect existing CI configuration without modifying it.

- read it to discover canonical test/build/package commands and target assumptions;
- compare it with local scripts and report drift, missing coverage, or failures;
- do not edit, add, delete, enable, or “repair” the CI file in ordinary Ship mode;
- do not infer that CI must exist, must pass, or must be recreated for local readiness.

## Workflow

### Phase 1 — classify request and scope

- Read the exact request and classify it as verification or explicit execution.
- Record the target artifact/platform only when relevant.
- If intent is ambiguous, stay in verification mode and report the missing decision.

### Phase 2 — inspect repository state

- Run `git status`, inspect the requested diff, and confirm the active branch.
- Identify repository-owned scripts from `package.json`, Makefiles, task runners, and existing CI configuration without changing them.
- Use read-only target detection when platform selection is unclear.

### Phase 3 — run local readiness checks

Run the smallest relevant set of existing commands:

- focused tests and the repository test command;
- typecheck, analyzer, and lint when configured;
- production/release build or package/export validation when the artifact is in scope;
- install, smoke, API, or native checks that can run locally;
- version, build number, changelog, package exports, and generated-file checks when relevant.

Do not add a workflow, hosted service, deployed endpoint, or production secret
just to obtain one of these checks.

### Phase 4 — inspect platform guidance

- Web/static web -> `stacks/web.md`.
- Next.js -> `stacks/nextjs.md` plus applicable web checks.
- Node backend -> `stacks/node-backend.md`.
- Docker -> `stacks/docker.md`.
- iOS -> `stacks/ios.md`.
- Android -> `stacks/android.md`.
- Tauri/desktop -> `stacks/tauri.md`.
- Container orchestration -> `stacks/orchestration.md` only when the request explicitly concerns that execution surface.

Keep platform checks focused on evidence that can be gathered locally. Store,
provider, deployed-service, and production-observability checks are external
unless the request explicitly asks for their verification.

### Phase 5 — optional explicit execution branch

When the explicit intent gate is satisfied, identify the exact command, target,
credentials boundary, irreversible effects, rollout/rollback constraints, and
post-execution evidence before acting. Load the execution references only for
that branch. Do not convert a checklist request into execution permission.

### Phase 6 — readiness report

Report passed, failed, blocked, and unverified checks. Distinguish local proof
from external proof. State whether execution was requested and whether any
execution occurred. Do not call a change ready merely because a workflow is
green or an upload command succeeded.

## Decision points

- Ordinary code/package change? Verify local scope, tests, static checks, build, and exports; no endpoint or CI change is needed.
- Existing CI found? Inspect commands and report drift; keep it unchanged.
- Static web? Inspect generated files, routes, asset paths, and cache intent; do not publish an artifact by default.
- Backend or Docker? Verify local startup, health/readiness behavior, config names, migrations, and graceful shutdown where reproducible.
- Mobile/native artifact? Verify identifiers, signing metadata, permissions, symbols, and installable output when available; store submission is separate.
- Stateful change? Assess backward compatibility and rollback safety; do not run production data mutation without explicit approval.
- Explicit deployment/release execution? Add target-specific external checks only after the intent gate is satisfied.

## Stack detection

- Detect targets before choosing local checks, but do not turn detected CI or deployment files into a mutation request.
- Web and backend checks remain separate when a repository contains both.
- React Native and Flutter release artifacts may need native iOS/Android checks even when shared code changed only once.
- Tauri/Electron signing and updater surfaces are distinct from frontend build verification.
- Docker is an artifact/runtime layer; orchestration execution is a separate, explicit scope.
- Existing CI detection is evidence collection only.

## Failure modes

- “CI green” treated as proof that the requested local artifact or diff is ready.
- A checklist request interpreted as deploy, publish, tag, or workflow creation permission.
- A local readiness task blocked because no deployed endpoint exists.
- Existing workflow edited to make a local test pass.
- Upload or package command treated as proof of user-visible health.
- Secrets printed while proving configuration presence.
- Migration, signing, symbol, mapping, or package metadata omitted from the evidence.
- Production behavior guessed from a development server or preview configuration.

## Stop conditions

- Stop before creating or modifying CI/CD, deployment, release, provider, secret, environment, branch-protection, or production infrastructure unless explicitly requested.
- Stop before deploy, publish, tag, push, store submission, destructive migration, credential operation, or production mutation without explicit intent and required approval.
- Stop when the request is ordinary verification but the next proposed action would change external state.
- Stop when required local evidence is unavailable; report it as blocked or unverified instead of inventing a hosted check.
- Stop when repository instructions conflict with this playbook; user and repository instructions win.

## Escalation conditions

- Ask for the target and explicit action when execution intent is unclear.
- Escalate signing, store, provider, production, irreversible data, and credential decisions without requesting secret values.
- Escalate CI changes as a separate task; do not smuggle them into Ship readiness work.
- Escalate missing rollback or observability evidence when the user explicitly requests deployment/release execution.

## Verification

- Run fresh relevant local test, typecheck/analyzer, lint, build, package, export, install, and smoke commands.
- Inspect `git status` and the requested diff for scope and generated artifacts.
- Confirm package exports, public types, version/build metadata, and changelog only when relevant.
- Read existing CI/release configuration without modifying it.
- Record external endpoint, store, provider, deployment, and observability checks as unverified unless explicitly requested and actually observed.
- For explicit execution, record the exact target, artifact/version, command status, and post-execution evidence separately.

## Output contract

- **Intent and scope** — verification or explicitly requested execution.
- **Target/artifact** — only the platform and version relevant to the request.
- **Local evidence** — commands and exact results.
- **Existing CI/release inspection** — read-only findings, if any.
- **Readiness** — ready, not ready, blocked, or unverified with reasons.
- **External checks** — clearly separated from local proof; not required for ordinary Ship verification.
- **Execution status** — not requested / not performed / performed with explicit authorization.
- **Next decision** — the smallest user decision needed, if any.

## Anti-patterns

- Creating `.github/workflows/**` because a normal change needs verification.
- Adding CI/CD, a hosted coverage service, Docker, deployment config, or secrets infrastructure to complete a checklist.
- Auto-deploying because the user said “ship”.
- Requiring a production URL for local readiness.
- Editing existing CI when the task is only implementation, testing, review, or release-readiness assessment.
- Printing environment, signing, store, or deployment secrets.
- Claiming “deployed”, “published”, or “healthy” without observing the corresponding external state.

## Example

User request: “Ship the current fix and tell me if it is ready.”

- Stay in verification mode: inspect the diff, run repository tests/typecheck/lint/build, inspect package or release metadata when relevant, and report readiness.
- Read an existing workflow only to find the canonical command if useful; do not create or modify CI.
- Do not require a deployed endpoint and do not deploy or publish.

User request: “Deploy this backend to staging and verify the deployed health endpoint.”

- Use the explicit execution branch, name the target and artifact, present the command/risk boundary, obtain required approval, then use `references/post-deploy.md` for the requested external verification.

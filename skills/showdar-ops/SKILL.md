---
name: showdar-ops
description: Handle operational engineering across CI/CD, containers, environments, deployment, observability, rollback, and explicit execution.
---

# Showdar Ops

## Purpose

- Analyze and perform tightly scoped operational engineering across CI/CD, containers, environments, runtime configuration, deployment, observability, rollback, and release operations.
- Preserve the boundary between read-only operational evidence, local repository configuration changes, and remote or production mutation.
- Produce practical plans, runbooks, configuration changes, or execution reports with explicit target, authorization, verification, and rollback evidence.
- Use `data/ops-patterns.csv` as a searchable prompt and load `references/deployment.md` for rollout or execution planning.

## When to use

- Inspecting existing GitHub Actions, CI/CD, Dockerfiles, compose files, package scripts, deployment manifests, health checks, or runtime topology.
- Modifying an existing operational configuration when the user explicitly asks to fix or add it.
- Planning or explicitly executing staging/production deployment, rollback, migration sequencing, observability, or release operations.
- Reviewing environment separation, secrets/config boundaries, build variants, signing, TestFlight, Play Console, desktop updaters, or backend rollout behavior.
- Creating Docker or other operational setup when the user explicitly requests that operational change.

## When not to use

- Do not use this for application feature implementation; use `showdar-build`.
- Do not use this for delivery/readiness assessment; use `showdar-ship`.
- Do not use this for local commit, branch, merge, rebase, conflict, or push workflow; use `showdar-git`.
- Do not create CI/CD, Docker, Kubernetes, Terraform, cloud integrations, monitoring SaaS, release automation, rollback infrastructure, or secrets configuration from an unrelated request.
- Do not infer deployment, publishing, production mutation, store submission, or infrastructure deletion from “ship”, “ready”, “release”, “fix CI”, or “prepare deploy”.

## Inputs and assumptions

- Prefer the exact requested operational outcome, target environment, repository instructions, existing scripts/config, deployment topology, package metadata, and fresh verification evidence.
- In read-only analysis, inspect existing CI, Docker/compose, deployment manifests, environment files by name, package scripts, health checks, logs/metrics/tracing configuration, rollback procedures, and infrastructure-as-code without mutation.
- Never print secret values, tokens, passwords, private keys, signing material, environment values, or production payloads; report names, locations, and safe metadata only.
- Treat dev, staging, and production as different targets. Missing target, authorization, credentials, maintenance window, rollback, or data-impact information is an open decision.
- Preserve existing operational conventions and application constraints. Do not choose a cloud provider or platform without supplied evidence or explicit scope.

## Non-negotiable rules

- Read-only operational analysis is the default and must not write files, run deployments, publish artifacts, mutate resources, or access credentials.
- Local/repository operational changes require an explicit request naming the configuration or operational outcome; keep the diff narrow and preserve unrelated work.
- Remote or production mutation requires explicit user intent naming the action and target, appropriate authorization, a preflight, a reversible/rollback path, and fresh verification.
- Do not automatically create GitHub Actions, CI/CD, Docker, Kubernetes, Terraform, cloud, release, monitoring, rollback, or secrets infrastructure.
- Do not automatically deploy, publish, submit to TestFlight/Play Console, tag, push Git, promote a release, change secrets, run destructive migrations, scale services, or delete resources.
- Distinguish planned, locally verified, remotely executed, and externally confirmed states; showdar-ops does not claim deployment or test execution that did not occur.
- Keep credentials outside reports and patches. Use existing secret references and document missing secret access without requesting or printing values.

## Workflow

### Phase 1: classify intent and target

1. Classify the request as read-only analysis, local operational change, operational plan, or explicit remote/production execution.
2. Extract the named environment, service, artifact, platform, action, authorization, and success evidence. If any execution target is missing, remain read-only.
3. Record the current Git/worktree state and preserve unrelated user changes before local edits.

### Phase 2: inspect operational state

- Read existing CI/CD, Docker/compose, package scripts, environment/config names, deployment manifests, health checks, logging/metrics/tracing, migrations, and rollback docs.
- Map build artifacts, dependencies, environments, service boundaries, readiness/liveness, signing, release channels, and failure/recovery paths.
- Identify drift between local commands and existing operational config without changing it in analysis mode.

### Phase 3: plan or change the smallest surface

- For plans, state prerequisites, exact commands conceptually, sequencing, verification, failure handling, rollback, and what is intentionally not executed.
- For explicit local changes, modify only existing or explicitly requested operational configuration; keep secrets as references and preserve repository conventions.
- For explicit execution, present the target/action risk and preflight evidence, then execute only the authorized bounded action. Stop on target mismatch, missing approval, destructive scope, or failed preflight.

### Phase 4: verify and hand off

- Verify syntax, configuration references, package/build metadata, health checks, artifact identity, logs/metrics, rollout state, and rollback readiness at the relevant boundary.
- Report exactly what ran locally, what changed remotely, what failed, and what remains external or unverified.
- Leave production and remote state unchanged when intent is ambiguous; a plan is not an execution receipt.

## Decision points

- Use a read-only assessment for “inspect”, “analyze”, “what is our setup”, or an ambiguous “prepare deploy”.
- Use a local change only when the user explicitly requests a named operational configuration change such as fixing an existing workflow, adding a health check, or creating Docker setup.
- Use execution mode only when the user names an action and target such as “deploy this service to staging”, “publish this package”, or “submit this build to TestFlight”.
- Treat “is this ready to release?” and “verify package readiness” as `showdar-ship`; treat operational implementation/execution as `showdar-ops`.
- Treat local Git actions as `showdar-git`, even when the files are deployment-related; ops owns the operational change or remote action after explicit scope is established.
- Prefer minimal/zero-downtime sequencing only when topology and workload evidence supports it; state downtime and rollback limits otherwise.

## Stack detection

- Node/backend: inspect Docker/container, env vars, migrations, health/readiness, rollout sequencing, logs, metrics, traces, and idempotent recovery.
- Next.js/web: inspect build/runtime configuration, cache/CDN boundaries, environment separation, headers, asset deployment, and rollback behavior.
- React Native/Flutter/iOS/Android: inspect build variants/flavors, version/build number, signing references, TestFlight/Play Console, staged rollout, crash monitoring, and rollback limitations without credentials or submission.
- Docker: inspect image base/provenance, build context, lockfiles, non-root permissions, health checks, env/secret boundaries, compose dependencies, and artifact reproducibility.
- Tauri/Electron: inspect signing, notarization, updater channels, release assets, native permissions, and platform-specific rollback limits.

## Failure modes

- Editing or creating CI/deployment infrastructure because a release or readiness request sounded operational.
- Deploying to the wrong environment, assuming staging equals production, or running a destructive migration without target and rollback proof.
- Printing secrets from `.env`, CI context, signing config, logs, or provider output while inspecting operational state.
- Claiming a remote rollout, store submission, test, health check, or rollback succeeded from a local plan or command suggestion.
- Adding Kubernetes/Terraform/cloud/monitoring dependencies when existing scripts or native configuration answer the request.
- Treating a Git commit/push/merge request as deployment authorization or allowing ops to steal a Git-only task.

## Stop conditions

- Stop before mutation when action, target, authorization, credentials boundary, maintenance window, or rollback is missing.
- Stop before remote execution when preflight, artifact identity, environment, health signal, or failure recovery is not provable.
- Stop on any command that would publish, delete, promote, scale, rotate, migrate destructively, submit, tag, push, or change production without explicit intent.
- Stop and report external verification as unavailable when provider, store, cloud, production, or monitoring access was not supplied.

## Escalation conditions

- Escalate production changes, destructive migrations, resource deletion, secret rotation, release promotion, store submission, signing, and irreversible rollback choices.
- Escalate missing owner/approver, environment separation, access policy, data impact, downtime budget, recovery point, or observability signal.
- Escalate CI token over-privilege, untrusted workflow input, compromised artifact, missing provenance, or container escape concerns to `showdar-security` for security analysis.
- Escalate application code defects to `showdar-build` or `showdar-debug`; do not hide them inside operational configuration advice.

## Verification

- For read-only work, verify that the helper/report did not modify files, access the network, print secrets, or execute operational commands.
- For local changes, run the narrowest syntax/config/package checks and inspect the final diff; do not claim remote behavior.
- For execution, record exact target/action, preflight, artifact/version, command result, health signal, logs/metrics evidence, and rollback outcome.
- Confirm package/runtime assets and environment references resolve without embedding credentials.
- Separate planned, local, remote, and externally confirmed evidence. Never claim deployment or test execution that did not occur.

## Output contract

### Operational assessment

1. Scope and intent classification
2. Observed operational state
3. Environment and trust boundaries
4. Risks and gaps
5. Recommended bounded actions
6. Verification evidence
7. Unverified external checks

### Deployment or rollback plan

State target, prerequisites, artifact, sequence, health gates, failure handling, rollback trigger, rollback steps, downtime/consistency limits, owner/approval, and the exact commands that remain unexecuted.

### Explicit execution report

State requested action and target, authorization boundary, preflight, exact operation performed, result, health/observability evidence, changes made, rollback status, and remaining risk. If execution did not occur, say so plainly.

## Anti-patterns

- “Ready” as permission to deploy, publish, promote, or mutate production.
- Creating a complete CI/CD or cloud platform when the repository already has a narrow failing step.
- Treating a Dockerfile, manifest, or local plan as evidence that a remote service changed.
- Copying secret values into commands, examples, logs, snapshots, or reports.
- Mixing application behavior, QA scenarios, delivery readiness, and operational execution into one vague checklist.
- Adding rollback infrastructure or SaaS integrations without an explicit requirement and owner.

## Example

**Request:** “Prepare a staging deployment plan.”

- **Mode:** read-only planning; no deployment because the request does not explicitly ask to execute it.
- **Inspect:** existing workflow, package scripts, image/artifact source, environment names, migrations, health checks, observability, and rollback docs.
- **Plan:** identify artifact/version, staging target, preflight, sequence, readiness gates, failure handling, rollback trigger, and commands marked unexecuted.
- **Open decisions:** staging owner/approval, secret references, migration compatibility, downtime budget, and health signal.
- **Boundary:** `showdar-ship` can verify readiness; `showdar-ops` performs deployment only after explicit action and target intent.

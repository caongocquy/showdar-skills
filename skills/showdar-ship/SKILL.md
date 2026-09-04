---
name: showdar-ship
description: Prepare and verify web, backend, mobile, Docker, and desktop releases with explicit readiness evidence, rollback, secret safety, and post-deploy checks.
---

# Showdar Ship

## Purpose

- Determine whether a change is actually ready to release.
- Apply platform-specific release/deploy checks without conflating upload success with product health.
- Protect secrets, migrations, signing, versioning, observability, and rollback.
- Require fresh verification evidence before claiming readiness.
- Read `references/release-readiness.md` and `references/rollback.md` for every nontrivial release.

## When to use

- Preparing or reviewing a web/backend/mobile/desktop release.
- Creating a release checklist or deployment runbook.
- Validating iOS TestFlight/App Store or Android Play release prerequisites.
- Checking Docker/backend rollout and post-deploy smoke behavior.
- Assessing whether a release can be rolled back safely.

## When not to use

- Routine local implementation before release readiness matters.
- Designing deployment infrastructure from scratch unless the user explicitly asks for that architecture.
- Do not automatically deploy/publish/upload to production without explicit user authorization.
- Do not expose or request secret values when presence/reference is sufficient.

## Inputs and assumptions

- Target environment/platform and intended release artifact/version.
- Repository build/test commands and release configuration.
- Deployment/store credentials are managed externally; this skill should not print them.
- Migration/feature-flag/rollback plan when stateful changes are involved.
- Use `scripts/detect-targets.mjs` and `scripts/release-check.mjs` for read-only preflight signals.

## Non-negotiable rules

- No release-ready claim without fresh tests/build/target checks appropriate to the change.
- Never print, commit, embed, or copy secret values into artifacts or logs.
- Production deployment, publishing, destructive migration, credential rotation, and store submission require explicit user approval.
- A successful build/upload is not post-deploy verification.
- Version/build identifiers must be deliberate and consistent with target policy.
- Migrations must be ordered relative to application rollout and rollback compatibility.
- Preserve symbol/mapping artifacts needed to diagnose release crashes.
- Define rollback trigger and mechanism before high-risk rollout.

## Workflow

### Phase 1 — detect target and artifact
- Identify web/backend/Docker/iOS/Android/desktop targets.
- Identify version/build number, environment, release configuration, artifact format, and distribution channel.

### Phase 2 — common readiness
- Confirm repository state, tests/static analysis, production/release build, environment variable names, feature flags, changelog/version if required.
- Review `references/secrets.md` and ensure no secret values are surfaced.
- Review migrations with `references/migrations.md`.

### Phase 3 — platform-specific checklist
- Web -> `stacks/web.md`.
- Backend -> `stacks/node-backend.md`.
- Docker -> `stacks/docker.md`.
- iOS -> `stacks/ios.md`.
- Android -> `stacks/android.md`.
- Tauri/desktop -> `stacks/tauri.md`.

### Phase 4 — rollback and rollout
- Record previous known-good version/artifact/config.
- Confirm schema/config compatibility with rollback.
- Define staged/canary/store-track strategy when risk warrants it.
- Define explicit rollback trigger.

### Phase 5 — execute only with approval
- Run release/deploy/publish commands only when the user clearly authorized the action and required credentials are available via safe tooling.
- Do not infer approval from asking for a checklist.

### Phase 6 — post-deploy verification
- Confirm deployed version/artifact.
- Verify health/readiness and critical user/API flows.
- Inspect logs/error rate/monitoring where tools are available.
- Confirm store/distribution processing state for mobile/desktop where observable.
- Use `references/post-deploy.md` for closeout.

## Decision points

- Stateful DB change? Prefer backward-compatible expand/migrate/contract for rolling deployments.
- Mobile native/signing capability change? Archive/release build and store validation are mandatory evidence.
- High-risk backend? Require readiness/health plus staged rollout and rollback trigger.
- Static web only? Focus on build artifact, env/public config, asset paths, cache headers, and critical routes.
- Desktop updater? Verify signing/notarization and update path on a clean install.
- Missing production observability access? Report post-deploy checks that remain manual/unverified.

## Stack detection

- Detect stack/targets before choosing checks.
- Web stack details do not replace backend checks when a full-stack repo deploys both.
- React Native/Flutter apps require native iOS/Android release checks even when shared code is unchanged if the release artifact is rebuilt.
- Tauri/Electron-style desktop releases have signing/update concerns separate from frontend build.
- Container orchestration adds readiness, replica, rollout, secret-reference, and rollback checks; read `stacks/orchestration.md`.
- Electron packages main/preload/renderer and update/signing surfaces separately; read `stacks/electron.md`.
- Docker is an artifact/runtime layer; still verify the service behavior inside it.

## Failure modes

- “CI green” used as readiness without checking actual target artifact/config.
- Upload to store/provider treated as successful release.
- Secrets printed during troubleshooting.
- Database migration applied before compatible app version exists.
- Rollback impossible because new schema/minimum client requirement was not considered.
- iOS dSYM or Android mapping artifact discarded.
- Production build differs from local/test environment in runtime/env assumptions.

## Stop conditions

- Stop when the requested outcome is outside this skill and hand off to the more appropriate workflow.
- Stop before destructive, irreversible, production, credential, publishing, or deployment actions unless the user explicitly approved them.
- Stop when required evidence is unavailable and proceeding would require guessing about behavior, ownership, or safety.
- Stop when a repository instruction conflicts with this playbook; repository/user instructions win.
- Stop before any unapproved deploy/publish/destructive step.
- Stop after release only when target version and critical post-release behavior have fresh evidence or remaining checks are explicitly listed as unavailable.

## Escalation conditions

- Ask for explicit approval immediately before production deploy/store submission/destructive migration if not already clear.
- Escalate missing rollback for irreversible data/platform changes.
- Escalate signing/provisioning/credential issues without requesting secrets in chat.
- Escalate store/provider policy decisions that cannot be inferred from repository state.

## Verification

- Run fresh relevant test/static/build commands and read exit/results.
- Validate the real release artifact/target, not only debug/dev mode.
- Verify version/build metadata and platform-specific signing/configuration.
- Verify migration status/order where applicable.
- After release, verify deployed version, health, and critical smoke flow.
- Record unverified external/store/observability items explicitly.

## Output contract

- **Target and version/artifact**.
- **Readiness evidence** — commands/checks freshly completed.
- **Platform checklist** — pass/fail/unverified.
- **Migration/secret/config status** without secret values.
- **Rollback plan and trigger**.
- **Execution status** — not executed / executed with approval.
- **Post-deploy verification** and remaining observation gaps.

## Anti-patterns

- Auto-deploy because user said “ship checklist”.
- Printing environment values to prove config exists.
- Generic “deploy succeeded” with no version/health/smoke proof.
- Skipping release build because unit tests passed.
- No rollback trigger.
- Applying destructive schema changes in the same opaque step as application rollout.

## Example

User request: “Prepare iOS release.”
- Check tests/typecheck, release archive, bundle ID, version/build, signing/provisioning, entitlements, privacy/permissions, push/deep links, dSYM, store validation.
- State readiness and any missing external checks.
- Do not upload to TestFlight until user explicitly authorizes submission.
- After authorized upload, verify processing/install/launch and critical flow.
- See `examples/release-report.md`.

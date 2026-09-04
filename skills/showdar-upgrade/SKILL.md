---
name: showdar-upgrade
description: Upgrade dependencies, frameworks, runtimes, and native platforms through compatibility analysis, breaking-change search, staged migration, rollback, and fresh verification.
---

# Showdar Upgrade

## Purpose

- Make upgrades controlled engineering changes rather than version-number edits.
- Identify compatibility across runtime, framework, peers, native toolchains, build plugins, and deployment environment.
- Search repository usage for breaking/deprecated APIs before modifying versions.
- Keep rollback boundaries explicit.
- Read `references/compatibility.md`, `references/breaking-changes.md`, and `references/migration-strategy.md` for nontrivial upgrades.

## When to use

- Dependency, framework, runtime, SDK, build plugin, iOS/Android platform, or language upgrade.
- Migration across deprecated APIs or project template/toolchain changes.
- Resolving peer/toolchain compatibility before installing a new version.
- Planning staged upgrades across multiple coupled packages.

## When not to use

- Installing a new small dependency with no version migration or compatibility question.
- Debugging an unknown build failure without evidence that version compatibility is causal.
- Production deploy belongs to showdar-ship after the upgrade is verified.
- Do not blindly “upgrade everything to latest” unless explicitly requested.

## Inputs and assumptions

- Current and target versions (or target policy such as latest supported).
- Current runtime/toolchain/native platform versions.
- Lockfile/package manager ownership.
- Official release/migration information should be checked when freshness matters.
- `scripts/inspect-dependencies.mjs` can collect current dependency/runtime signals without changes.

## Non-negotiable rules

- Record current state before changing versions.
- Do not assume latest versions are mutually compatible.
- Separate package resolution, source migration, generated/codegen changes, native/build changes, and release changes.
- Search current repository usage for removed/changed APIs.
- Preserve a real rollback path before irreversible migration steps.
- Change one compatibility layer at a time when that yields diagnosable failures.
- Build affected native/platform targets after native/toolchain upgrades.
- Never discard a lockfile just to force resolution without understanding why.

## Workflow

### Phase 1 — inventory
- Run `node scripts/inspect-dependencies.mjs <repo>` or equivalent package-manager commands.
- Record framework/runtime, direct/peer deps, lockfile, native toolchain, deployment/runtime constraints.

### Phase 2 — compatibility matrix
- Use `data/compatibility-checklist.csv` to ensure runtime, peers, native, codegen, and public API surfaces are covered.
- Verify documented supported combinations for the target version.
- Identify unknown/unsupported combinations explicitly.

### Phase 3 — breaking-change search
- Read relevant official release/migration notes for crossed boundaries.
- Search repository for removed/deprecated APIs and config keys.
- Identify generated/template diffs separately from source changes.

### Phase 4 — choose migration sequence
- Decide direct versus staged upgrade based on compatibility and diagnosability.
- Define package/version order, source edits, codegen, native/project edits, and lockfile regeneration.
- Define rollback point using `references/rollback.md`.

### Phase 5 — execute controlled changes
- Update version/config at the owner.
- Apply required source migrations with minimal unrelated refactor.
- Regenerate only artifacts owned by the upgraded tooling.

### Phase 6 — verification
- Install/resolve dependencies cleanly.
- Run typecheck/analyzer/tests/builds.
- Build native/release targets touched by toolchain changes.
- Inspect lockfile/generated diff for unexpected package churn.

## Decision points

- Major framework jump with many coupled APIs? Prefer staged if intermediate support reduces ambiguity.
- Security patch with narrow backport available? Prefer smallest supported safe upgrade when user goal is risk remediation.
- Peer conflict? Determine which package owns the incompatible range; do not use force/legacy-peer flags as final solution.
- Native minimum OS/SDK changes? Treat as product/release decision, not invisible build detail.
- Codegen format changes? Verify source-of-truth inputs and generated ownership before committing churn.

## Stack detection

- React Native: `stacks/react-native.md`.
- Flutter: `stacks/flutter.md`.
- Next.js: `stacks/nextjs.md`.
- Node runtime: `stacks/node.md`.
- iOS/Xcode/Swift: `stacks/ios.md`.
- Android/JDK/Gradle/AGP: `stacks/android.md`.
- Expo: `stacks/expo.md` for SDK/config-plugin/generated-native coupling.
- CocoaPods/SPM and Gradle: read `stacks/cocoapods-spm.md` or `stacks/gradle.md` for native lock/build boundaries.
- Tauri/Rust: `stacks/tauri-rust.md` for capability, crate, target, bundle, and updater coupling.

## Failure modes

- Editing package version and waiting for compiler errors to reveal migration plan.
- Forcing dependency resolution with flags while peers remain incompatible.
- Deleting lockfile and accepting broad unrelated dependency churn.
- Updating native project template blindly and overwriting app-specific settings.
- Missing runtime/deployment version mismatch after local build succeeds.
- No rollback for schema/minimum-OS/codegen changes.
- Claiming success after unit tests while native/release build was affected.

## Stop conditions

- Stop when the requested outcome is outside this skill and hand off to the more appropriate workflow.
- Stop before destructive, irreversible, production, credential, publishing, or deployment actions unless the user explicitly approved them.
- Stop when required evidence is unavailable and proceeding would require guessing about behavior, ownership, or safety.
- Stop when a repository instruction conflicts with this playbook; repository/user instructions win.
- Stop when target versions are resolved, breaking usages migrated, lock/generated changes explained, and affected test/build/platform verification passes.

## Escalation conditions

- Ask when target version is unspecified and “latest” would materially change support requirements.
- Escalate minimum OS/SDK/browser/runtime support changes to the user/product owner.
- Escalate destructive database/data migrations and production rollout decisions.
- If official compatibility information is unavailable, state risk instead of guessing support.

## Verification

- Confirm resolved versions from package manager/tooling, not only manifest text.
- Run repository search for known removed/deprecated APIs after migration.
- Run static analysis/tests/builds appropriate to touched stack.
- Build iOS/Android release targets when native toolchain/project files changed.
- Inspect lockfile/generated/native project diff for unexplained churn.
- Document exact environment and any platform not verified.

## Output contract

- **Current -> target** versions.
- **Compatibility matrix** and constraints.
- **Breaking changes found in this repository**.
- **Migration sequence** including source/native/generated steps.
- **Rollback boundary**.
- **Verification results** by stack/platform.
- **Unverified/remaining risks**.

## Anti-patterns

- `--force` as compatibility strategy.
- “Upgrade all dependencies while we are here.”
- Blind template overwrite for native projects.
- Ignoring lockfile diff.
- Mixing unrelated refactor with migration so failures are hard to localize.
- Treating local dev startup as release-build verification.

## Example

User request: “Upgrade React Native to the next supported release.”
- Inventory React/Metro/Babel/Node/JDK/Gradle/AGP/Xcode/CocoaPods and native modules.
- Check target RN compatibility and template/migration notes.
- Search deprecated RN APIs and native project changes.
- Migrate source/native config in controlled steps, inspect lockfile/template diff, build Android+iOS.
- See `examples/upgrade-report.md`.

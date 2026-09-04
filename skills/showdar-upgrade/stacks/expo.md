# Expo upgrades

## Compatibility and ownership

Record current/target Expo SDK, React Native, React, Node, platform SDKs, config plugins, and whether `ios/`/`android/` are generated, committed, or hand-owned. Check Expo's supported React/RN tuple and plugin peer ranges; do not infer compatibility from a successful JavaScript install. Preserve lockfiles and inspect prebuild/template ownership before changing native files.

## Migration sequence

Read the target Expo SDK notes, search deprecated config/API usage, and separate app-config edits, config-plugin behavior, prebuild output, source changes, and native project changes. Compare `expo prebuild` output to the current native diff before regenerating. For a managed project verify config at build time; for a bare/prebuild project verify the generated native files plus app-specific edits. Treat credentials, permissions, entitlements, schemes, and build profiles as release surfaces.

## Wrong turns and rollback

Do not run prebuild with overwrite behavior over hand-owned native changes, mix SDK and unrelated package upgrades, or use a compatibility flag without understanding its boundary. Keep the previous package/native state and build profile so a failed prebuild or plugin migration can be restored. Read `references/compatibility.md`, `references/migration-strategy.md`, and `references/rollback.md`.

## Verification

Run dependency resolution, Expo diagnostics, tests, a clean prebuild diff, Metro bundle, and release-like Android/iOS builds. Smoke permissions, notifications, deep links, updates, and native plugins on each affected platform; record whether testing used a development client, simulator, or store-like artifact.

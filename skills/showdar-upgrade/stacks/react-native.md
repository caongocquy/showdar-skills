# React Native upgrades

## Compatibility tuple

Record current/target RN core, React, Node, Metro, Babel, Hermes, New Architecture setting, Android Gradle/AGP/Kotlin/JDK, CocoaPods/Xcode, deployment targets, and every native module peer range. Treat Expo SDK as an additional owner when present. Resolve the graph from the repository lockfiles and verify the target's supported tuple before editing versions.

## Migration surfaces

Read official RN release/template notes and search for removed APIs, changed event/layout semantics, Metro/Babel config, codegen, TurboModule/Fabric assumptions, and native project diffs. Inspect `android/` and `ios/` ownership before applying template changes; generated files, Podfile.lock, Gradle lockfiles, codegen output, and native module registration are separate migration surfaces. Check Hermes bytecode/source-map behavior and New Architecture compatibility for each native dependency.

## Sequencing and rollback

Upgrade one layer at a time when it keeps failures diagnosable: RN/React, JS toolchain, Android tuple, iOS tuple, then native modules and generated artifacts. Preserve manifests, lockfiles, native project diff, and a buildable previous commit. Do not disable Hermes/New Architecture or use force-resolution as the migration strategy. Read `references/compatibility.md`, `references/breaking-changes.md`, and `references/rollback.md`.

## Verification

Run clean dependency resolution, lint/typecheck/tests, Metro bundle, Android debug and release-like builds, iOS build/archive, and native-module smoke. Verify navigation, permissions, deep links, background/restore, Hermes/architecture mode, and both platform artifacts; report any platform not available.

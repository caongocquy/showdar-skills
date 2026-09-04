# Gradle and Android upgrades

## Upgrade the tuple

Treat JDK, Gradle, AGP, Kotlin, compile/target SDK, Android Studio, and build plugins as a supported tuple. Record current/target versions and the package-manager/lock policy before changing one. Check plugin and convention-build peer constraints, repositories, dependency substitution, version catalogs, and duplicated transitive versions; do not use `--refresh-dependencies` or force flags as the final compatibility strategy.

## Inspect generated and variant changes

Read AGP/Gradle/Kotlin migration notes, then search for removed DSLs, namespace requirements, manifest/resource behavior, task wiring, configuration-cache assumptions, and deprecated APIs. Compare generated sources, manifests, resource merges, variant graphs, R8/ProGuard rules, signing, and native ABI outputs. Keep source, build-script, generated, and lockfile edits separable so the first failing task remains attributable.

## Rollback and verification

Preserve the previous wrapper, JDK/toolchain, lockfiles, mapping/native symbols, signed artifact, and project diff. Upgrade in the smallest diagnosable step, then run `./gradlew` dependency/report checks, unit tests, lint, debug APK, and release AAB tasks. Install the resulting artifacts with `adb`, exercise process/lifecycle/permission paths, and verify R8 mapping and signing for the exact release. Read `references/dependency-resolution.md`, `references/migration-strategy.md`, and `references/rollback.md`.

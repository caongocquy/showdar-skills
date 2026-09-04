# Android platform upgrades

## Compatibility surface

Record current/target JDK, Gradle, AGP, Kotlin, compile/target/min SDK, Android Studio, plugins, application ID, ABI, and release signing. Verify the supported tuple and whether min/target SDK or Play policy changes affect the product/device matrix. Inspect direct/peer/transitive resolution and preserve dependency locks where used.

## Breaking and native surfaces

Read AGP/SDK/Kotlin migration notes and search for namespace, manifest merger, exported-component, resource, permission, packaging, and deprecated API changes. Separate source changes from generated build files, version catalogs, manifests/resources, R8/ProGuard rules, native symbols, and signing configuration. Compare variant outputs because Debug can hide shrinker, resource, ABI, or release-only failures.

## Rollback and verification

Keep the previous Gradle/AGP/JDK tuple, lockfiles, mapping/symbol artifacts, signed bundle, and project diff. Rollback may be constrained by target-SDK policy, version codes, schema/data, or already-installed clients; define a forward-fix path. Read `references/compatibility.md`, `references/breaking-changes.md`, and `references/rollback.md`.

Run clean dependency resolution, unit/instrumentation tests, debug and release bundle tasks, R8/mapping checks, and install/update smoke on affected API/ABI classes. Verify manifest/resources, permissions, deep links/push, process restoration, signing, and native crash symbolization.

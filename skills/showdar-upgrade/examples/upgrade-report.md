# Example upgrade report

Target: React Native `0.74` -> `0.76` with the repository's pinned Node and
Android/iOS toolchains retained until compatibility is proven.

Inventory: direct and peer dependencies, lockfile, Metro/Babel config, Hermes,
native Podfile/Gradle plugins, minimum OS versions, CI images, and generated code.

Compatibility findings: the framework upgrade changes the native template and
may change peer ranges; the repository must prove every native module before
enabling the new architecture. Do not infer compatibility from install success.

Migration order: update direct constraints, resolve lockfile, apply codemods,
regenerate native/codegen artifacts, run JS tests, then build and test iOS and
Android. Keep the old build available and gate risky runtime behavior.

Report each command by platform, mark TestFlight/store processing as unverified
when it was not observed, and define the first safe rollback boundary.

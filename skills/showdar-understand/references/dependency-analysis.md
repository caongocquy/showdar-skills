# Dependency analysis

Classify dependencies as runtime, build-time, test-only, platform/native, generated, or tooling. For a proposed change, identify direct dependencies first, then only expand transitive dependencies that can alter behavior, build output, or deployment.

For each relevant edge record the owner manifest and lockfile; direct importer and exported contract; resolved version or platform constraint; initialization/lifecycle impact; and verification command that exercises the edge.

For monorepos, distinguish package graph edges from source imports and task-runner graph edges. For mobile projects, include CocoaPods/SwiftPM/Gradle/Maven, native modules, permissions, and signing configuration. For backend systems, include database, queue, cache, and external service contracts. For desktop hosts, include IPC, capabilities, preload, and updater dependencies.

Do not report a long dependency list. A dependency finding is useful only if it changes the change surface, verification plan, or risk assessment.

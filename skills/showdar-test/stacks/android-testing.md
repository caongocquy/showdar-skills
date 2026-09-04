# Android testing

## Choose the boundary

Use JVM unit tests for pure Kotlin policy, repository/Room or service integration for real persistence/protocol semantics, and instrumented/UI tests for Android lifecycle, permissions, resources, navigation, process restoration, Compose/View rendering, and device APIs. Robolectric can speed framework-adjacent tests but is not proof of device behavior; use an emulator/device for native timing, ABI, or release configuration risk.

## Deterministic lifecycle

Control coroutine dispatchers, virtual time, lifecycle state, and test data explicitly. Assert semantics, visible UI/accessibility, navigation, durable state, and recovery after process death—not only mock calls. Use real Room/serialization/network boundaries when those are the contract; fake external services at a controlled server boundary instead of mocking the repository under test. Reset permissions, files, databases, and app state per test owner.

## Failure modes and verification

Watch for main-thread violations, leaked coroutines, idling-resource gaps, animation/Compose recomposition timing, API/OEM differences, manifest variant drift, and emulator state pollution. Run the focused Gradle test task, then the affected instrumentation/UI task on the supported API/ABI matrix; collect Logcat, screenshots, and test artifacts. Include a release-like/R8 configuration when that is part of the risk. See `references/unit.md`, `references/integration.md`, and `references/e2e.md`.

# Android debugging

## Apply when

Use this guide for Kotlin/Java, React Native/Flutter native boundaries, Gradle/build, device-only, lifecycle, permission, or release/R8 failures. Record Android API level, ABI, device/emulator, variant, application ID, JDK, Gradle/AGP/Kotlin, and debug versus release-like configuration.

## Architecture and evidence

Separate Gradle configuration/dependency resolution, compile/resource/link, app launch, main-thread/UI, background service, and process-death failures. Capture the first failing Gradle task and full Logcat exception/cause, not only the final “killed” line. Inspect manifest merger output, resources, native ABI, lifecycle callbacks, saved state, and permission result. For release crashes keep the exact APK/AAB, R8 mapping, native symbols, and build IDs so stack traces can be symbolicated.

## Investigation

Reproduce on the affected API/ABI and compare the same variant on a clean install, upgrade install, background/foreground, rotation, and process recreation path. Use StrictMode, Android Studio profiler, frame/rendering tools, and heap/native allocation evidence for performance or memory. For network issues inspect cleartext/TLS, Network Security Config, DNS, timeout, and server correlation. Read `references/build-failures.md`, `references/async-races.md`, or `references/memory.md` when those boundaries are implicated.

## Wrong turns and edge cases

Do not fix a release-only failure by disabling R8, increasing timeouts, or testing only an emulator. Watch for manifest/resource variant drift, exported components, task/launch-mode behavior, Doze/background limits, permission timing, split APK delivery, ABI mismatch, and process death that removes in-memory state.

## Verification

Run the failing Gradle task and affected test, then install the same debug/release-like artifact with `adb`, collect filtered Logcat, and repeat lifecycle/permission paths. Verify mapping/symbol artifacts match the shipped binary and test at least one affected API/ABI class.

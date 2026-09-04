# Android delivery verification

Verify the signed release artifact locally by default. Play Console upload,
track changes, and staged rollout require explicit release-execution intent.

## Identity, SDK, and signing

Record `applicationId`, `versionCode`, `versionName`, min/target/compile SDK, release variant, JDK/AGP/Gradle/Kotlin versions, and the exact signing configuration. Verify the keystore/alias reference and Play app identity without printing secrets. Check manifest merger output, exported components, permissions, app links, notification/push configuration, network security, and target-SDK behavior changes for the supported API range.

## Artifact and symbols

Prefer the signed AAB for Play distribution and inspect generated APKs/splits for ABI, resource, and permission behavior. Run R8/ProGuard in the release path and retain the exact mapping file, native symbols, build ID, and artifact digest; a release crash without matching mapping cannot be diagnosed reliably. Validate version code monotonicity and any signing-key/Play App Signing constraint before upload.

## Distribution readiness (explicit execution only)

Smoke clean install, upgrade install, process death/restore, permissions,
deep links/push, offline/reconnect, and release-only code paths locally. Play
Console upload, internal/closed tracks, staged rollout, and external crash/ANR
observation are execution-only checks. Android rollback is limited by
monotonic version codes, installed clients, data/schema changes, and track
state; record forward-fix or halt options without changing Play state by
default.

## Wrong turns and caveats

Do not test only a debug APK, disable R8 to make a release pass, or assume emulator behavior covers ABI/OEM/API differences. Target/min SDK implications and Play policy requirements change over time; verify current requirements and the target device matrix.

## Verification

Run tests and the release bundle task, inspect manifest/resources and signing,
install generated artifacts with `adb`, and preserve mapping/native symbols for
the candidate build. Upload/validate the AAB in a track only when explicitly
requested.

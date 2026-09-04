# Flutter upgrades

## Compatibility surface

Record Flutter channel/version, Dart SDK, package manager lockfile, Android Gradle/AGP/Kotlin/JDK, Xcode/Swift/CocoaPods, minimum iOS/Android versions, renderer, and plugin versions. Check each plugin's platform support and transitive constraints; Flutter SDK and Dart constraints must resolve together.

## Breaking and generated work

Read the target Flutter/Dart migration notes and search for deprecated APIs, changed nullability/lifecycle behavior, rendering assumptions, plugin registration, and platform-channel payloads. Separate Dart source migration from `android/`, `ios/`, CocoaPods/Gradle, and generated platform files. Compare generated files to their source-of-truth and do not overwrite app-specific runner settings blindly. Inspect analyzer/lint changes as migration signals, not merely cleanup.

## Sequence and rollback

Prefer Flutter/Dart first, then source API migration, plugin updates, and native toolchain changes when the supported matrix allows; split the steps if Gradle/Xcode failures would otherwise be ambiguous. Preserve `pubspec.lock`, native lockfiles, generated files, and the previous SDK/toolchain. Read `references/compatibility.md`, `references/breaking-changes.md`, and `references/rollback.md`.

## Verification

Run `flutter pub get`, `flutter analyze`, focused/unit/widget tests, integration tests, and profile/release Android/iOS builds. Smoke platform channels, permissions, background/foreground, deep links, images/fonts, and plugin behavior on each target; verify generated artifacts are reproducible from the migrated sources.

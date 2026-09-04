# iOS platform upgrades

## Compatibility surface

Record current/target Xcode, Swift, SDK, deployment target, architecture, CocoaPods/SPM versions, lockfiles, build settings, signing configuration, and every native framework/plugin. Check whether the target raises minimum OS requirements or changes device/simulator availability; that is a product/release decision, not a silent build fix.

## Migration surfaces

Read Xcode/Swift/platform release notes and search for deprecated APIs, concurrency/actor annotations, linker/build-setting changes, privacy manifests, permission usage descriptions, entitlements, capabilities, and SDK-required declarations. Separate source migration from Pods/SPM resolution, generated project files, signing/export configuration, and archive changes. Compare project/template diffs and preserve app-specific targets/settings.

## Rollback and verification

Keep the previous Xcode/toolchain, Podfile.lock/Package.resolved, project diff, archive, and dSYM. Rollback may be limited by minimum OS, local data, entitlements, or store distribution state; define the last buildable checkpoint. Read `references/compatibility.md`, `references/breaking-changes.md`, and `references/rollback.md`.

Run focused XCTest, `xcodebuild` build/archive for affected schemes, signing/entitlement validation, and device/simulator smoke. Verify permissions, push/deep links, background behavior, native frameworks, symbol artifacts, and release configuration on the supported OS matrix.

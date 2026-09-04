# iOS debugging

## Apply when

Use this guide for Swift/Objective-C, React Native/Flutter native boundaries, build failures, device-only crashes, lifecycle issues, or release-only behavior. Record Xcode/Swift, deployment target, scheme/configuration, device versus simulator, OS version, and debug versus archive build.

## Architecture and evidence

Classify the failure as compile/link, launch/signing, main-thread/UI, background lifecycle, framework/native module, or memory/resource. Capture the first Xcode build error, device Console/crash log, exception type, thread, loaded binary versions, and app state. Symbolicate release crashes with the matching dSYM and binary UUID; an unsymbolicated stack is not evidence for a source-level fix. Check entitlements, privacy usage descriptions, push/background capabilities, and bundle configuration when a feature fails only on device.

## Investigation

Compare simulator/device and debug/archive paths without changing multiple variables. For UI hangs or races inspect main-thread checker, lifecycle callbacks, scene transitions, task cancellation, and actor/thread ownership. For memory pressure inspect Instruments allocations/leaks, image/native resource ownership, and termination reason. For build issues preserve the first failing target/task and resolved Pods/SPM versions; read `references/build-failures.md` and `references/memory.md` when relevant.

## Wrong turns and edge cases

Do not treat a simulator pass as device proof, disable signing/capabilities as a fix, or delete Pods/DerivedData without a cache hypothesis. Watch for release optimization, missing symbols, keychain/secure-storage access groups, permission timing, background suspension, architecture slices, and native crashes that bypass JavaScript/Dart error handlers.

## Verification

Rebuild the affected scheme/configuration, reproduce on the affected OS/device class, inspect symbolicated logs, and run focused tests. For release-only issues validate an archive or equivalent release build plus launch, permission, background/foreground, and crash-observability paths.

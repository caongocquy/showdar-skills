# React Native debugging

## Apply when

Use this guide for React Native crashes, blank screens, jank, navigation bugs, native-module failures, memory pressure, or issues that appear only on iOS/Android. Record RN, React, Hermes, architecture mode, platform, device/API level, build variant, and whether the repro is debug or release-like.

## Architecture and evidence

Separate the JS thread from the UI/main thread and from native module/JSI execution. Hermes stack traces and heap data describe the JS runtime; Android Logcat, iOS device logs, symbolicated native crashes, and Instruments/Android profilers cover native boundaries. Inspect Metro resolution, transforms, bundle contents, and source maps for packager failures. New Architecture/TurboModules/Fabric can change threading and lifecycle assumptions; do not treat an old bridge workaround as proof of the current path.

## Investigation

For slow interactions, measure JS event-loop work, UI frame time, layout/commit cost, image decode, and native I/O separately. For lists inspect `FlatList`/FlashList windowing, item keys, render identity, measurement, pagination, and image size/cache. For navigation inspect focus/blur, screen mount/unmount, state restoration, and pending async work. For Reanimated, inspect worklets and shared values separately because they execute outside ordinary JS render timing. Check native-module registration and lifecycle on both platforms.

## Wrong turns and edge cases

Do not add `setTimeout`, broad memoization, or disable Hermes/New Architecture just to make a repro disappear. Avoid clearing Metro/Gradle/CocoaPods caches unless cache provenance is the hypothesis. Watch for release-only minification, missing source maps, image memory spikes, process death/background resume, permission prompts, and native crashes before the JS error handler runs. Read `references/performance.md`, `references/memory.md`, or `references/async-races.md` for the causal method.

## Verification

Use Android Logcat and iOS device/simulator logs, then reproduce in the affected variant. Run the repository's Metro/typecheck/test command and a release-like build when packaging or native code is implicated. Confirm the fix across Hermes/architecture and both platforms when the changed boundary is shared.

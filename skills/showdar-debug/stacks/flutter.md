# Flutter debugging

## Apply when

Use this guide for Flutter build errors, widget failures, dropped frames, lifecycle races, plugin/platform-channel issues, or memory/image problems. Record Flutter and Dart SDK versions, build mode, device/API level, renderer, and whether the issue is Android, iOS, or both.

## Architecture and evidence

Separate build (widget tree/configuration), layout (constraints), paint (layers), and raster/GPU work. The main isolate handles Dart code and scheduling; platform channels cross into the native runner, while shader compilation and image upload can surface as raster jank. Use Flutter DevTools timeline/frame chart, rebuild indicators, memory snapshots, logs, and Observatory/VM data rather than judging by feel. Capture the widget lifecycle and mounted state around every async callback.

## Investigation

Reproduce with a fixed route/data set and compare first frame, warm navigation, scroll, background/foreground, and rotation where relevant. For rebuild storms inspect provider/Bloc/Cubit scope, selector granularity, inherited dependencies, and `build` side effects. For async work trace cancellation/disposal and distinguish main-isolate CPU work from an isolate boundary. For platform failures capture channel name/payload shape, plugin version, native exception, Gradle/Xcode task, and device logs. Read `references/performance.md`, `references/async-races.md`, or `references/memory.md` as needed.

## Wrong turns and edge cases

Do not move expensive work into `build`, add arbitrary delays, or globally disable animations to hide jank. `const` and rebuild reduction do not fix raster/image cost. Watch for shader warm-up, oversized decoded images, cache growth, hot-reload-only behavior, disposed `BuildContext`, plugin registration differences, and release tree-shaking.

## Verification

Run `flutter analyze`, focused tests, and a profile/release-like build when performance or native integration is involved. Recheck DevTools frame timing, memory after repeated flows, background resume, and both platform runners before claiming resolution.

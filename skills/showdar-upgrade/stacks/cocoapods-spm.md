# CocoaPods and Swift Package Manager upgrades

## Inventory and ownership

Record Xcode/Swift, deployment target, package/plugin versions, `Podfile.lock`, `Package.resolved`, local/path packages, target membership, build settings, binary frameworks, and generated workspace/project ownership. Check direct and transitive constraints, duplicate products, static versus dynamic linkage, and whether a package requires a newer OS or Swift language mode.

## Controlled migration

Upgrade one native dependency boundary at a time. Read release notes, search API/deprecation usage, resolve Pods/SPM without deleting lockfiles, and inspect the resolved graph and build settings for unexpected churn. Compare generated workspace/project diffs and preserve app-specific build phases, scripts, signing, capabilities, and resources. If a package changes module name, resources, linkage, or concurrency requirements, migrate source separately from resolution.

## Failure modes and rollback

Watch for CDN/cache masking, checksum failure, duplicate symbols, module-map/header changes, transitive minimum-OS increases, simulator/device architecture mismatch, and a package that builds in Debug but fails at archive. Keep previous lockfiles and a buildable archive; reinstalling dependencies is not rollback if it changes the graph. Read `references/dependency-resolution.md`, `references/compatibility.md`, and `references/rollback.md`.

## Verification

Run dependency resolution, focused tests, the affected scheme, and a release/archive build on the required simulator/device architecture. Inspect `Package.resolved`/`Podfile.lock`, link warnings, signing/entitlements, and runtime flows that cross the upgraded framework.

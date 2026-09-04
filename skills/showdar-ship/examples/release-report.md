# Example release report

Target: iOS production candidate `2.4.0 (318)`.

Evidence: focused tests, typecheck, archive, signing, entitlements, version, and
build-number checks passed. The release checklist also confirms privacy strings,
push environment, deep-link association, and crash reporting configuration.

Unverified locally: App Store/TestFlight processing and production push delivery.
Do not report those as passed; assign them to the release owner.

Rollout: release to the internal group first, then staged production rollout.
Rollback: keep the previous App Store build available and retain the server
feature flag that disables the new response path without a client update.

Post-release proof: install, launch, login, push-token registration, deep link,
offline resume, and the critical transaction flow. Record timestamps and owners.

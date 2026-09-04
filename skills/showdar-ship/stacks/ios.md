# iOS delivery verification

Verify the archive and installable artifact locally by default. TestFlight,
App Store, signing-service, and rollout actions are separate explicit scopes.

## Identity and signing

Record the bundle identifier, marketing version, build number, release scheme/configuration, deployment target, and archive export method. Confirm the identifier matches App Store Connect and the intended provisioning profile; certificates, distribution profiles, entitlements, capabilities, and keychain access groups must belong to the same app identity. Validate push, associated domains, background modes, Sign in with Apple, and other capabilities against the archive rather than the project editor alone.

## Privacy and artifact evidence

Check privacy manifests, permission usage descriptions, SDK-required declarations, URL schemes, and tracking disclosures for every native dependency. Archive with release settings, retain the matching dSYM/BCSymbolMaps and exported IPA metadata, and verify bitcode/symbol expectations for the current toolchain. Do not treat a successful archive as proof that launch, permissions, deep links, push, or background behavior works on a device.

## Distribution readiness (explicit execution only)

Run archive validation and install the exact build on a clean simulator/device
when available. Smoke first launch, upgrade from the previous version, login,
critical native capabilities, push/deep links, offline/reconnect,
background/foreground, and crash reporting. TestFlight groups, App Store
rollout, and external observation are execution-only checks; use them only when
explicitly requested. iOS rollback is constrained after users migrate local
data or distribution advances, so record recovery assumptions without
submitting or changing store state.

## Wrong turns and caveats

Do not reuse a development profile, increment only the marketing version, or copy entitlements from another target. Signing, privacy, Xcode, SDK, and App Store rules are version-sensitive; verify current target requirements and provider status. Report store processing, phased rollout, and crash-observability checks that cannot be verified locally.

## Verification

Run repository tests plus `xcodebuild archive`/export and validation for the
affected scheme, inspect signing/entitlements, verify dSYM UUIDs, and install
the exported artifact. Record TestFlight/store status only for an explicit
external-verification request, without exposing credentials.

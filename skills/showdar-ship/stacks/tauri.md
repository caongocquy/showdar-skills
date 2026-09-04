# Tauri/desktop shipping

## Artifact and identity

Record Tauri/Rust/frontend versions, target triples, bundle identifier, product name, marketing/build version, updater channel, and artifact formats (`.app`/DMG/PKG, MSI/NSIS, or other configured targets). Verify the packaged frontend assets, Rust release binary, resources, capabilities, icons, and platform-specific paths; a dev-server launch does not validate the bundle.

## Signing and updater

For macOS verify Developer ID signing, entitlements, hardened runtime, notarization, stapling, and Gatekeeper launch on a clean machine. For Windows verify the configured code-signing identity, timestamping, installer metadata, and SmartScreen-relevant artifact. Check updater endpoint/channel, public key/signature, version ordering, delta/full artifact availability, and failure behavior. Never put signing or updater private keys in the repository or logs.

## Release and recovery

Build each intended target in release mode, inspect artifact names/checksums, install without the development checkout, and smoke startup, IPC commands, filesystem/network capabilities, deep links, restart, upgrade, and failed-update recovery. Keep previous signed artifacts and define whether rollback means reinstalling an older version, disabling an update channel, or shipping a forward fix; already-updated clients and incompatible local data can limit rollback.

## Wrong turns and caveats

Do not grant all capabilities, use absolute developer paths, or call packaging/upload success a release. WebView/WebView2/WebKit, Rust/Tauri APIs, target architectures, OS signing rules, and updater schemas are version-sensitive; verify the current toolchain's supported targets.

## Verification

Run frontend tests, `cargo test`, the configured release bundle command, signature/notarization verification, and clean-machine install/update smoke for every affected platform.

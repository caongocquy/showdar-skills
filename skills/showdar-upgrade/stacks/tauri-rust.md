# Tauri and Rust upgrades

## Compatibility surface

Record Tauri/core/plugin crate versions, Rust toolchain/target triples, frontend framework/bundler, WebView runtime, capability schema, bundle targets, signing, and updater format. Check crate feature flags, frontend API pairing, OS minimums, architecture-specific native dependencies, and lockfiles (`Cargo.lock` plus frontend lockfile). Treat generated config and platform bundles as separate ownership boundaries.

## Migration surfaces

Read Tauri/Rust migration notes and search command names, IPC payload types, plugin APIs, capability permissions, window/config keys, updater metadata, and frontend assumptions. Migrate Rust commands/permissions and frontend callers together, then compare generated/platform files rather than overwriting app-specific settings. Inspect `cargo tree` and target-specific feature resolution for hidden native changes.

## Rollback and verification

Preserve previous manifests, lockfiles, Rust toolchain, capability config, signed artifacts, updater keys/endpoints, and a clean install path. A capability/schema or local-data change may require a forward fix rather than downgrade. Read `references/compatibility.md`, `references/breaking-changes.md`, and `references/rollback.md`.

Run `cargo test`, frontend tests, target release bundle, signature/notarization verification, and clean-machine install/update smoke. Verify IPC errors, filesystem/network permissions, startup, restart, updater failure/recovery, and every affected target triple.

# Tauri debugging

## Apply when

Use this guide for Tauri desktop crashes, blank webviews, command/IPC failures, permissions, packaging, updater, or platform-only behavior. Record Tauri and Rust versions, frontend bundler, target triple, OS, dev versus release bundle, and whether the failure is in the webview or Rust process.

## Architecture and evidence

Separate frontend DOM/runtime errors, Tauri command serialization, Rust command execution, capability/permission denial, webview process crashes, and bundle/signing failures. Capture browser-console output, Rust logs/backtrace, command name and redacted payload shape, capability file, target triple, bundle metadata, and exit/signals. A dev server can hide missing packaged assets, CSP, protocol, resource, or updater problems.

## Investigation

Reproduce the command from the frontend and invoke the Rust implementation with focused tests where possible. Trace request, serialization, permission check, native side effect, and returned error. Compare `tauri dev` with a release bundle installed outside the build tree; inspect resource paths and working-directory assumptions. For native failures use macOS Console/crash reports or Windows Event Viewer, and verify architecture-specific libraries. Read `references/build-failures.md` for build/package evidence.

## Wrong turns and edge cases

Do not grant all capabilities, disable CSP, or use absolute developer-machine paths as a permanent fix. Watch for renamed commands, enum/JSON shape drift, window lifecycle races, updater signature/endpoint mismatch, WebView2/WebKit differences, filesystem permission boundaries, and target-specific path/encoding behavior.

## Verification

Run frontend tests and `cargo test`, then `tauri build` for the affected target. Install the produced artifact on a clean user profile, exercise startup, IPC, filesystem/network permissions, restart, and updater/error paths, and retain symbols/logs for release crashes.

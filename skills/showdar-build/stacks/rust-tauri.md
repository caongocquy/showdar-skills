# Rust and Tauri build guidance

Validate every command input at the Rust boundary, return typed safe errors, and grant the least capability needed by each window. Keep large payloads out of repeated IPC, make event listeners lifecycle-owned, and avoid blocking the UI path with filesystem or database work. Run Rust tests plus the actual bundle target when capabilities, updater, or native configuration changes.

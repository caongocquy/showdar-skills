# Tauri design guidance

Tauri UI is a desktop client over an IPC and capability boundary, not only a web page in a window.

- Keep commands typed and validate every frontend-supplied argument in Rust.
- Grant the smallest window capability set and review permission changes as security-sensitive.
- Keep large data local or streamed; avoid moving whole documents across IPC on every interaction.
- Scope event listeners to window lifetime and unsubscribe them on teardown.
- Design keyboard shortcuts, window size, focus, and OS-specific behavior deliberately.
- Verify signing, updater compatibility, and clean-machine install separately from UI correctness.

Version note: confirm command, capability, and updater APIs against the pinned Tauri and Rust versions.

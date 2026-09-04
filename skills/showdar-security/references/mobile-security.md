# Mobile, WebView, and desktop boundaries

For React Native, Flutter, iOS, and Android, inspect URL/deep-link parsing, intent filters, universal/app links, WebView navigation and bridges, local storage, biometric fallback, permission transitions, foreground/background state, screenshots, backups, and native bridge arguments.

For Tauri and Electron, inspect preload/context isolation, IPC command allowlists, capability policy, serialization, path normalization, shell execution, filesystem permissions, updater channels, signing, and renderer-to-host trust boundaries.

Split acceptance by platform and lifecycle. A client-side guard is not authoritative authorization. Keep device, signing, store, and production checks separate from local evidence.

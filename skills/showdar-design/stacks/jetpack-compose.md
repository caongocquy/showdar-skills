# Jetpack Compose design guidance

Compose screens should make state ownership, recomposition cost, window adaptation, and semantics explicit.

- Hoist state only to the lowest common owner; keep transient input local.
- Use lazy containers for unbounded content and stable domain keys for rows.
- Treat `LaunchedEffect` and related APIs as lifecycle boundaries; keys must describe the work identity.
- Use window size and insets for adaptive layouts instead of device-model branches.
- Give custom controls role, label, state, and testable semantics; verify TalkBack focus order.
- Keep expensive parsing, image work, and database reads outside composition.
- Verify loading, empty, error, large-font, landscape, and back-navigation states.

Version note: confirm APIs and Material guidance against the project’s pinned Compose BOM and Android documentation before implementation.

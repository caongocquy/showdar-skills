# React Native design guidance

React Native design must account for JS/UI/native threads, navigation lifecycle, keyboard, safe areas, and platform semantics.

- Use virtualized lists with stable keys and measured item strategy for long content.
- Keep heavy parsing and synchronous work off gesture, typing, and scroll paths.
- Pass serializable identifiers through navigation; keep business state in its owning store or query layer.
- Size hit areas independently from icon artwork and set accessibility role, label, and state.
- Make keyboard avoidance, safe-area insets, back behavior, loading, and offline states explicit.
- Control image decode size and cache policy for list cells.
- Test both iOS and Android when navigation, permissions, native modules, or layout differ.

Version note: confirm behavior against the pinned React Native, Hermes, navigation, and platform toolchain versions.

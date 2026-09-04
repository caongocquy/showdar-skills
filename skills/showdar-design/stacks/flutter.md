# Flutter design guidance

Flutter UI decisions should follow constraints and lifecycle ownership rather than device-specific screenshots.

- Keep domain state separate from ephemeral widget state and name the source of truth.
- Use lazy slivers or builders for collections whose size is not bounded.
- After an async gap, check `mounted` before using `context` or changing screen-owned UI.
- Let constraints and flexible layout determine size; test text scale and narrow widths.
- Dispose controllers, focus nodes, streams, and animation resources at their owner.
- Add `Semantics` only where custom visuals remove native meaning; test order and labels.
- Treat platform-channel calls as fallible and model unavailable capability states.

Version note: verify Dart, Flutter, plugin, and platform support from the repository lockfile and current Flutter documentation.

# Vue design guidance

Vue interfaces should keep reactivity and ownership legible across components and composables.

- Use computed derivation for values that are not independent user state.
- Keep watchers for synchronization with external systems, not render-state calculation.
- Use stable keys and lazy list strategies for large collections.
- Preserve native semantics and manage focus after route, dialog, and validation changes.
- Abort or version asynchronous work so late results cannot overwrite newer state.
- Keep form errors associated with controls and test keyboard behavior.

Version note: check the pinned Vue and router version for reactivity, SSR, and suspense semantics.

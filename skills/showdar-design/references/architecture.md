# Design architecture boundaries

Visual design is a decision system, not a pile of components. Preserve the existing token, component, navigation, and data ownership boundaries before introducing new visual primitives.

- Find the existing token source and extend semantic roles such as surface, text, action, danger, and focus rather than copying hex values.
- Keep product rules and state ownership outside presentational components; a component should receive the state it renders and emit named events.
- Separate responsive layout decisions from domain logic. CSS, layout primitives, and platform adaptation should decide geometry; business code should decide priority.
- Keep remote, draft, URL, and derived state distinct so visual polish does not create synchronization effects.
- Treat a new component as earned when behavior, accessibility, or a stable visual contract repeats; do not extract a class-name wrapper for its own sake.
- Verify design changes through the actual route/screen, realistic content, and existing build/test boundary.

When a design reference conflicts with an established product contract, preserve the user task and accessibility contract, then document the deliberate visual deviation.

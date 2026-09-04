# HTML and Tailwind design guidance

HTML/Tailwind should use CSS and native semantics as the primary behavior engine.

- Define semantic color and spacing tokens with CSS variables before composing utilities.
- Use buttons, links, labels, inputs, headings, and lists for their native interaction and reading behavior.
- Treat breakpoints as priority/reflow decisions; test long labels, zoom, and localization.
- Define focus, invalid, disabled, active, and reduced-motion states explicitly.
- Extract a component only when behavior or a stable variant contract repeats.
- Keep arbitrary values rare and explain a value that is a deliberate design token exception.

Version note: validate utility names and configuration against the pinned Tailwind version.

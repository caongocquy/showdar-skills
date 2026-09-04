# SwiftUI design guidance

SwiftUI screens should make identity, observation, task cancellation, and Dynamic Type behavior explicit.

- Select `State`, `Binding`, or observable model ownership based on who creates the value.
- Use stable domain IDs in `ForEach`; never create random identity during body evaluation.
- Keep expensive transformations out of `body` and scope tasks to the view lifecycle.
- Prefer content-driven layout over fixed frames; test Dynamic Type, safe areas, and split view widths.
- Use native controls and explicit labels, values, hints, and focus state for accessibility.
- Model navigation as data when the flow benefits from restoration and deep links.

Version note: verify APIs against the pinned Swift/Xcode SDK and minimum deployment target.

---
name: showdar-design
description: Create, implement, review, and polish product UI using searchable local design knowledge, stack-specific rules, accessibility, and anti-generic visual guidance.
---

# Showdar Design

## Purpose

- Produce product-specific UI direction instead of generic component-library output.
- Translate product goals into hierarchy, layout, typography, color, interaction, motion, and component behavior.
- Adapt design implementation to React, Next.js, React Native, Flutter, SwiftUI, or Compose.
- Review and polish existing UI with accessibility and performance constraints.
- Use local structured knowledge via `scripts/search.mjs` rather than loading all design data into context.
- Read `references/anti-ai-ui.md` to avoid template-like AI aesthetics.

## When to use

- Designing a new screen, page, flow, component system, dashboard, invitation, landing page, or mobile experience.
- Turning a screenshot/reference into a coherent design direction and implementation rules.
- Reviewing existing UI for hierarchy, spacing, responsiveness, interaction, accessibility, or visual polish.
- Implementing design in a supported stack where platform conventions matter.
- Choosing a palette, typography direction, motion language, or component behavior from product context.

## When not to use

- Pure backend/algorithm work with no user interface.
- Pixel-exact reproduction where the user supplied a complete authoritative design system and no design decisions remain.
- Brand/legal accessibility certification; this skill provides engineering guidance, not formal compliance certification.
- Do not redesign unrelated screens while implementing one bounded UI task.

## Inputs and assumptions

- Product type, target users/task, target stack, and existing brand/design constraints if available.
- Existing design system/tokens/components override generic Showdar defaults.
- If a reference image exists, extract hierarchy/layout traits without blindly copying irrelevant details.
- Search structured data selectively. Example: `node scripts/search.mjs --query "fintech dashboard" --domain products`.
- For stack rules: `node scripts/search.mjs --query "long list performance" --stack react-native`.
- Accessibility and real content lengths are part of the design input, not afterthoughts.
- The data index covers products, styles, colors, typography, layout patterns, components/states, accessibility, interaction, motion, charts, and stack rules; use it to select fields rather than loading every row.
- Query html-tailwind, React, Next.js, Vue, Nuxt, Svelte, React Native, Flutter, SwiftUI, Jetpack Compose, or Tauri guidance before implementation.

## Non-negotiable rules

- Establish a product-specific visual premise before choosing components.
- Use hierarchy and spacing before adding borders, cards, gradients, shadows, or decorative effects.
- Do not default AI products to purple gradients, glass cards, sparkles, and floating orbs.
- Every interactive element needs default, active/pressed, focus where relevant, disabled/loading/error behavior.
- Mobile controls must be touch-ergonomic and respect platform navigation/keyboard/safe-area behavior.
- Responsive design is priority/reflow, not proportional shrinking.
- Maintain readable contrast, semantic labeling, focus order, reduced-motion behavior, and text scaling.
- Prefer existing design tokens/components when they meet the requirement.

## Workflow

### Mode selection
- **new**: establish direction -> system -> layout -> components -> responsive -> interaction -> implementation guidance.
- **implement**: map approved design to existing stack/tokens/components with minimal visual drift.
- **review**: inspect hierarchy, consistency, states, responsive behavior, accessibility, and stack-specific issues.
- **polish**: preserve product structure while tightening rhythm, type, alignment, states, and motion.

### Phase 1 — product and task framing
- Identify primary user job, primary action, information density, emotional tone, and trust/safety needs.
- Search `data/products.csv` and `data/styles.csv` for nearby patterns, then adapt rather than copy.
- State a one-sentence design direction including density, tone, and layout premise.

### Phase 2 — visual system
- Choose color strategy from semantics/product context using `data/colors.csv` as reference.
- Choose typography direction from `data/typography.csv`; define a compact type scale and numeric treatment when needed.
- Define spacing/radius/border/shadow rules consistent with density and platform.

### Phase 3 — layout and hierarchy
- Apply `references/visual-hierarchy.md` and `references/layout.md`.
- Make reading order and primary action obvious without relying on decoration.
- Decide where grouping needs cards versus simple alignment/section rhythm.

### Phase 4 — components and states
- Search `data/components.csv` and `data/ui-patterns.csv` for task-appropriate behavior.
- Specify loading, empty, error, disabled, focus/pressed, and long-content states.
- Use platform-native controls/semantics when they improve behavior and accessibility.

### Phase 5 — responsive and interaction
- Apply `references/responsive.md` and `references/interaction.md`.
- Define what reflows, collapses, moves, or becomes a different component at narrow widths.
- Search `data/motion.csv` only for motion that explains continuity or feedback.

### Phase 6 — stack-specific implementation
- Detect target stack and query the matching file under `data/stacks/`.
- Translate design decisions into stack-native layout, state, accessibility, and performance patterns.
- Avoid forcing web patterns into mobile or vice versa.

### Phase 7 — review and polish
- Audit alignment, spacing rhythm, type hierarchy, density, icon sizing, states, contrast, keyboard/touch behavior, and visual consistency.
- Read `references/accessibility.md` and query `data/accessibility.csv` for focused checks.
- Remove generic AI-design artifacts that do not support the product premise.

## Decision points

- Existing design system? Extend it before introducing a parallel token/component language.
- Dense expert tool? Favor scan speed, alignment, restrained surfaces, and compact controls.
- Narrative/event/portfolio? Favor typography, imagery, section rhythm, and fewer UI containers.
- Mobile utility? Favor native mental models, thumb reach, keyboard/safe area, and reduced simultaneous information.
- Critical finance/health flow? Prioritize trust, legibility, explicit state, recovery, and conservative motion.
- If reference aesthetics conflict with accessibility or task completion, preserve intent but change the unsafe detail.

## Stack detection

- React: query `data/stacks/react.csv` for semantic, state, effect, and rendering guidance.
- Next.js: query `data/stacks/nextjs.csv` for server/client, data/cache, image, and performance boundaries.
- React Native: query `data/stacks/react-native.csv` for lists, touch, navigation, images, keyboard, and accessibility.
- Flutter: query `data/stacks/flutter.csv` for rebuild, list, async, layout, state, and semantics guidance.
- SwiftUI: query `data/stacks/swiftui.csv` for state/identity/navigation/layout/accessibility.
- Compose: query `data/stacks/compose.csv` for state hoisting, recomposition, lazy lists, effects, semantics, adaptive layout.

## Failure modes

- Card soup: every section becomes a rounded card with identical weight.
- Trend soup: gradient + glass + glow + huge radius + floating decoration without product reason.
- Weak hierarchy: multiple primary CTAs and headings compete.
- Responsive squeeze: desktop layout simply narrows until unreadable.
- Missing states: only happy-path mockup is implemented.
- Design tokens duplicated as random hardcoded values.
- Accessibility fixes applied after layout in a way that breaks hierarchy.
- Stack implementation ignores lifecycle/performance conventions.

## Stop conditions

- Stop when the requested outcome is outside this skill and hand off to the more appropriate workflow.
- Stop before destructive, irreversible, production, credential, publishing, or deployment actions unless the user explicitly approved them.
- Stop when required evidence is unavailable and proceeding would require guessing about behavior, ownership, or safety.
- Stop when a repository instruction conflicts with this playbook; repository/user instructions win.
- Stop when direction, key states, responsive behavior, stack implementation rules, and verification criteria are defined for the requested UI scope.

## Escalation conditions

- Ask for brand assets or authoritative design tokens when identity cannot be inferred safely.
- Ask when the user requests a rendition of a specific person/image and the necessary visual reference is missing.
- Escalate conflicting accessibility vs brand requirements instead of silently sacrificing accessibility.
- If the request spans an entire product redesign, split by key flow/system rather than generating dozens of shallow screens.

## Verification

- Compare implementation against the stated design direction and existing token system.
- Test critical widths, long content, loading/empty/error states, keyboard/touch, and text scaling.
- Check contrast, semantic roles/labels, focus order, reduced motion, and color-independent state meaning.
- Profile obvious hot UI paths such as large lists/images/animations when stack guidance identifies risk.
- Remove decorative elements that do not improve hierarchy, feedback, brand, or storytelling.
- Verify the primary user task remains obvious without animation.

## Output contract

- **Design direction** — product type, density, tone, visual premise.
- **System** — color strategy, typography, spacing/surfaces, motion principles.
- **Layout** — hierarchy, grouping, responsive behavior.
- **Components/states** — interaction and error/loading/empty behavior.
- **Stack guidance** — implementation constraints for the detected target.
- **Accessibility** — concrete checks and required behaviors.
- **Polish checklist** — issues to fix before calling the UI complete.

## Anti-patterns

- Purple gradient because the product uses AI.
- Glassmorphism on every surface.
- 3-column feature cards where a narrative or task flow would be clearer.
- Large empty hero copy with weak proof or product context.
- Random icon boxes and pills used as decoration.
- Tiny mobile touch targets copied from desktop.
- Motion on every section with unrelated directions/easings.
- Hardcoded one-off colors/spacing when tokens already exist.

## Example

User request: “Design a wedding invitation site that feels elegant, not like a SaaS template.”
- Search products/styles/colors/typography for wedding/editorial context.
- Direction: editorial romantic, low-medium density, warm neutrals, serif display + quiet sans body.
- Layout: immersive hero, story sequence, event details, gallery/map if needed, RSVP as clear final action.
- Avoid dashboard cards, purple gradients, glass panels, repeated icon-feature grids.
- Define mobile story order and reduced-motion-friendly reveals.
- See `examples/design-brief.md` for a compact brief.

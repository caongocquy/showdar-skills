# Design release readiness

Treat UI as release behavior when it changes navigation, forms, accessibility, loading/error states, or platform integration.

- Test the critical task at narrow and wide layouts with long real content, localization-like strings, and large text settings.
- Verify loading, empty, error, retry, disabled, offline, focus, keyboard, and reduced-motion states; a screenshot of the happy path is not proof.
- Confirm semantic roles, accessible names, focus order, contrast, touch target size, and screen-reader announcements on the affected platform.
- Check image/font licensing and loading behavior, metadata/social previews for web, and bundle/performance impact for large media.
- For native or desktop UI, test back behavior, safe areas, window resizing, permissions, and clean install/update paths as applicable.
- Record unverified devices, browsers, OS versions, and external design approvals instead of implying they passed.

Release readiness means the user task remains understandable and recoverable without animation or ideal content.

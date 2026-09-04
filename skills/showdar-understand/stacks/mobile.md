# Mobile repository signals

Inspect app entrypoint, navigation root, state container, native `ios/` and `android/` integration, build flavors/schemes, permissions, deep links, push setup, and release configuration. React Native and Flutter may share business code while native projects still own signing, capabilities, and platform lifecycle behavior.

Trace one cold-start flow and one resumed/deep-link flow. Record where navigation state, server/cache state, draft state, and native lifecycle state live. Check keyboard/safe-area behavior, background/foreground transitions, process death restoration, platform-channel/native-module contracts, and release-only configuration. A shared component test does not prove native permissions, signing, lifecycle, or store artifact behavior.

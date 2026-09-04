# React debugging

Classify the symptom as render, state ownership, effect synchronization, event handler, hydration, or external-system failure. Capture component props/state identity, effect dependencies, render counts, and browser console warnings. Reproduce with a minimal user action and compare a fresh mount, update, and navigation path. Do not “fix” an effect loop by adding a dependency suppression comment without explaining the synchronization invariant.

# Mobile deep-link security review

**Scope:** Review a React Native deep link that opens a payment or account screen.

Check URL parsing, allowlisted hosts/routes, authentication state, token handoff, replay, WebView navigation, native intent filters, background/resume state, and local storage. Separate iOS and Android evidence.

Mark missing link ownership, permission, or authentication decisions as open questions. Do not open attacker-controlled links, access device credentials, or claim exploitability without a reachable path and prerequisites.

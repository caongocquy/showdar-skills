---
name: showdar-security
description: Use when assessing threat models, attack surfaces, trust boundaries, auth/authz, secrets, exposure, or exploitability.
---

# Showdar Security

## Purpose

- Perform evidence-backed security analysis, threat modeling, secure-design review, and implementation-security guidance.
- Follow sensitive data from requirements, code, configuration, architecture, dependencies, and runtime boundaries to its security outcome.
- Produce practical findings with affected assets, trust boundaries, impact, exploitability, remediation, residual risk, and verification.
- Use `data/security-patterns.csv` as a focused prompt set and load `references/threat-modeling.md` when modeling a larger flow.

## When to use

- The user asks for a threat model, security posture review, attack-surface map, or secure-design review.
- A change involves authentication, authorization, sessions, tokens, secrets, credentials, sensitive data, storage, URLs, files, IPC, or permissions.
- The user asks to review an API for authz, IDOR/BOLA, injection, SSRF, XSS, CSRF, or data exposure risk.
- A mobile flow involves deep links, WebViews, local storage, biometrics, app lifecycle, or Android/iOS permission boundaries.
- A backend, desktop, dependency, supply-chain, or security-configuration change needs a security regression assessment.

## When not to use

- Do not use this for general correctness, maintainability, architecture, performance, or test review; use `showdar-review`.
- Do not use this to diagnose the root cause of an observed crash or failure; use `showdar-debug`.
- Do not implement automated tests; use `showdar-test`. Do not own QA scenario or regression planning; use `showdar-quality`.
- Do not perform offensive exploitation, credential guessing, network attacks, destructive probes, or production changes by default.
- Do not treat a generic word such as “review” as security intent without security, auth, exposure, secret, threat, or exploitability context.

## Inputs and assumptions

- Prefer the supplied requirement, change diff, repository instructions, architecture, schemas, handlers, state models, configuration, dependency manifests, and tests.
- Record the evidence boundary: files, commands, environments, versions, and runtime surfaces actually inspected.
- Never print secret values, tokens, keys, cookies, passwords, credentials, personal data, or sensitive payloads; report only redacted names, locations, and metadata.
- Separate confirmed issue, suspected risk, accepted control, unknown, and open decision. A code smell is not automatically an exploitable vulnerability.
- Preserve application constraints and existing security controls unless evidence shows they are unsafe or the user explicitly changes scope.

## Non-negotiable rules

- Use evidence for every finding: location, data flow, reachable condition, affected asset, and trust boundary.
- Do not invent vulnerabilities, attacker capabilities, exploitability, severity, or stakeholder decisions that evidence does not support.
- Distinguish exploitability from theoretical weakness and state attacker prerequisites instead of claiming exploitability without proof.
- Explain impact, exploitability/preconditions, affected scope, bounded remediation, residual risk, and verification for actionable findings.
- Assign P0/P1/P2/P3 or Info only when impact and realistic reachability are sufficiently evidenced; do not label everything critical.
- Review authorization at the authoritative owner, not only client visibility or route guards. Check API authorization, IDOR/BOLA, role/tenant boundaries, and object ownership.
- Check validation and output handling for injection, unsafe deserialization, command execution, path traversal, file upload, SSRF, XSS, and CSRF where the stack makes them relevant.
- Check authentication, session/token lifecycle, refresh/revocation, credential exposure, secrets handling, storage, encryption use, sensitive logging, and privacy boundaries.
- Check mobile deep links, WebViews, local storage, biometric/auth flows, native permissions, and Android/iOS bridges; check Tauri/Electron IPC, capabilities, filesystem, and command boundaries.
- Check dependency and supply-chain risk, security configuration, permissions, and security regression coverage without adding offensive tooling.

## Workflow

### Phase 1: establish scope and evidence

1. Identify the requested decision: threat model, review, checklist, remediation guidance, or regression verification.
2. Map changed and reachable surfaces: actors, assets, entry points, data stores, integrations, jobs, native bridges, and runtime boundaries.
3. Read only relevant source, configuration, schemas, manifests, tests, and existing security documentation; record what was not inspected.
4. Redact sensitive values immediately. Keep filenames, variable names, hashes, and safe metadata only when they do not disclose secrets.

### Phase 2: map the attack surface

- List assets and their confidentiality, integrity, availability, or privacy impact.
- Identify actors, authorization decisions, anonymous and authenticated entry points, and trust boundaries.
- Trace attacker-controlled input through validation, parsing, storage, logging, rendering, network calls, command execution, or filesystem access.
- Identify controls at the correct owner: server/API, backend service, native platform, desktop host, browser, or client UI.

### Phase 3: assess practical threats

- Consider spoofing/authentication, tampering/integrity, repudiation/auditability, information disclosure, denial of service, and elevation of privilege when useful.
- Test reasoning against denial, expired/revoked sessions, duplicate requests, cross-tenant objects, malformed input, offline/retry state, deep-link impersonation, and permission changes.
- State the exact preconditions for a finding: attacker access, account role, network position, feature flag, platform, configuration, or user action.
- Classify each result as confirmed issue, suspected risk, control, unknown, or open decision.

### Phase 4: prioritize and remediate

- Prefer the smallest fix that closes the actual trust-boundary or data-flow gap.
- Order work by realistic impact and exploitability, then by scope and verification cost.
- Preserve compatible behavior, migration constraints, and existing controls; call out when a safe fix requires a stakeholder or platform decision.
- Define a security regression check for each remediation and identify external evidence that remains unavailable.

## Decision points

- Use a security review when concrete code, configuration, or architecture is available; use a threat model when actors, assets, and boundaries need to be made explicit first.
- Use a checklist only after identifying the context: auth, payments, upload, deep links, API endpoints, WebView, local storage, or desktop IPC.
- Treat missing authorization, data ownership, secret rotation, privacy, encryption, deletion, or production access rules as escalation items.
- Use P0/Critical for immediate severe impact with credible reachability, P1/High for realistic high-impact exposure, P2/Medium for material bounded risk, P3/Low for limited impact, and Info for evidence or hardening with no demonstrated vulnerability.
- Do not force CVSS, OWASP labels, or STRIDE terminology when a plain risk explanation is clearer.

## Stack detection

- Web/Next.js: inspect browser/server boundaries, cookies, CSRF, XSS/output encoding, SSRF, cache/privacy, headers, and runtime configuration.
- Backend/API/Node: inspect schema validation, authorization, tenant/object ownership, idempotency, timeouts, deserialization, logging, persistence, and dependency exposure.
- React Native/Flutter/iOS/Android: inspect deep links, WebViews, local storage, biometrics, permission states, lifecycle, native bridges, signing boundaries, and supported OS behavior.
- Tauri/Electron: inspect IPC commands, capability policy, serialization, preload/context isolation, filesystem paths, shell/command execution, updater, and packaging permissions.
- Docker and CI/CD: inspect build context, image provenance, dependency installation, secret injection, token permissions, artifact exposure, and workflow trust boundaries without changing infrastructure by default.

## Failure modes

- Calling a theoretical weakness exploitable without a reachable source-to-sink path or prerequisites.
- Treating client-side hiding as authorization, a dependency age as a vulnerability, or a missing scanner as proof of insecurity.
- Printing a secret while trying to prove secret exposure, or copying credentials into a report, command, fixture, or patch.
- Inflating severity, duplicating one root cause across many findings, or recommending a broad rewrite when a bounded control closes the gap.
- Reviewing only the named file while ignoring the authoritative authorization owner, trust boundary, or consuming caller.

## Stop conditions

- Stop before declaring exploitability when the relevant code path, configuration, attacker prerequisite, or runtime boundary was not observed.
- Stop before suggesting production or destructive security changes when authorization, rollback, maintenance window, or data impact is unknown.
- Stop and report an open decision when a secure behavior depends on an unstated role, tenant, retention, consent, encryption, or platform policy.
- Stop before any offensive probe, credential access, network attack, or secret handling beyond redacted metadata; request separate explicit scope if required.

## Escalation conditions

- Escalate credible credential, token, private-key, personal-data, payment, cross-tenant, command-execution, or production-integrity exposure immediately with redacted evidence.
- Escalate missing ownership or authorization rules, secret rotation responsibility, privacy/compliance requirements, encryption/key management, and unsupported platform/version decisions.
- Escalate suspected supply-chain compromise, malicious dependency behavior, tampered release artifact, or CI token over-privilege without attempting to investigate offensively.
- Escalate a conflict between current controls and supplied requirements instead of silently choosing the weaker interpretation.

## Verification

- Re-check every finding against its source location, affected asset, trust boundary, preconditions, impact, and severity rationale.
- Verify that remediation closes the data-flow or authorization gap and does not expose new secrets, logs, permissions, or compatibility regressions.
- Add or request a deterministic security regression test at the right boundary; hand automated implementation to `showdar-test`.
- Separate local evidence from unavailable external evidence such as provider scans, penetration tests, mobile store review, production telemetry, or secret rotation confirmation.
- Report residual risk and unverified assumptions explicitly; never claim a clean security posture from a limited review.

## Output contract

### Security review

1. Summary
2. Attack surface
3. Findings
4. Severity
5. Evidence
6. Impact
7. Remediation
8. Residual risk
9. Verification

Each finding includes status (`confirmed issue`, `suspected risk`, `control`, `unknown`, or `open decision`), affected asset/trust boundary, severity only when supported, exact redacted evidence, exploitability/preconditions, impact, remediation, and verification.

### Threat model

Use the smallest useful set of: Assets, Actors, Trust boundaries, Entry points, Threats, Controls, Gaps, and Priority mitigations. Use STRIDE-like reasoning only when it improves coverage.

### Security checklist

Choose only context-relevant checks for auth, payments, file upload, deep links, API endpoints, WebView, local storage, or desktop IPC. Mark each item observed, passed, failed, not applicable, or unknown, with evidence and an owner.

## Anti-patterns

- “No issues found” without stating files, boundaries, evidence limits, and residual risk.
- One giant generic OWASP checklist that hides the actual changed data flow.
- Critical severity for every missing hardening control, scanner warning, or old dependency.
- Secret values, exploit payloads, credential guesses, destructive commands, or production changes in the report.
- Treating requirements, current behavior, and assumptions as the same security fact.
- Replacing the application architecture instead of fixing the smallest proven boundary failure.

## Example

**Request:** “Review this API for authorization and data exposure risks.”

- **Evidence:** inspect route, handler, policy owner, object lookup, tenant filter, response serializer, logs, and tests; record exact paths without printing tokens or data.
- **Threat model:** authenticated user is an actor, account records are assets, API boundary is the entry point, and the authorization middleware-to-query boundary is the trust boundary.
- **Confirmed issue:** if a request-supplied object ID reaches a query without owner/tenant enforcement, report a confirmed IDOR/BOLA path with role and account prerequisites.
- **Remediation:** enforce owner/tenant authorization at the authoritative service boundary and add a cross-account regression test.
- **Residual risk:** provider WAF, production telemetry, and secret rotation remain unverified unless evidence was supplied.

# Example delivery-readiness report

Intent: verify whether the iOS candidate is ready for handoff; no store
submission or deployment was requested.

Target: iOS candidate `2.4.0 (318)`.

Local evidence: focused tests, typecheck, archive, signing, entitlements,
version/build-number, privacy strings, push/deep-link configuration, dSYM
identity, and clean-device smoke passed.

Existing CI: inspected the workflow to confirm its canonical test command;
unchanged because CI modification was outside scope.

External/unverified: App Store/TestFlight processing, production push delivery,
provider monitoring, and rollout state. These are not required for this local
readiness decision and must not be reported as passed.

Readiness: ready for the requested handoff, subject to the release owner's
separate decision about any later submission or deployment.

If the user explicitly requests TestFlight submission or deployment
verification, record the target, artifact, authorized command, processing
result, install/launch smoke, observation owner, and recovery trigger
separately. Use `references/post-deploy.md` only for that explicit scope.

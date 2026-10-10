# TASK-002 paid capture authorization (deployment proposal)

Live execution remains disabled. Preparing or merging this implementation is not paid execution approval. The three paid workflow jobs have literal false conditions, and the private Responses gate is false. No API key is configured by this change.

## Owner authorization

Use a protected GitHub Environment named `showdar-paid-capture`:

- Exactly one required reviewer: user `caongocquy`, immutable GitHub user ID `50620260`.
- Prevent self-review **off**, deliberately: the repository owner may authorize a deployment they initiated. This is distinct from independent behavioral grading.
- Administrator bypass **off**. Missing/unreadable bypass policy blocks authorization.
- Selected deployment branches/tags: exactly branch `main`, no tags or wildcard patterns.
- Eventually store `SHOWDAR_PAID_CAPTURE_KEY` as an **Environment secret only**. Never use repository/organization scope for this name. Do not configure a key during this phase.

The repository currently has no Environments. Creation/configuration and real, secret-free Environment acceptance need separate deployment approval. Do not let an implicit unprotected Environment created by a workflow qualify.

## Proposed execution flow

1. Deploy reviewed trusted code to main, keeping both live gate and paid jobs disabled. Pin the actual main runner SHA; it cannot be the PR SHA.
2. Sync the evaluated PR source and re-run the signed model-free producer contract. Independently verify image archive/manifest, the three producer artifacts and both original attestation bundles. Update the expected pins for this exact runner/source/model/image.
3. Perform model-free Environment acceptance: withheld/rejected/missing approval cannot start a protected job; correct owner approval is independently observable through GitHub review history. Confirm branch restrictions and disabled administrator bypass. No model key or model calls are needed for that acceptance; it is not yet implemented as a dispatched deployment here.
4. Only after separate paid authorization and a reviewed activation revision, start a fresh main workflow run, attempt **1**, with explicit `paid_capture: true` (default is false). The `prepare-paid-capture` job independently verifies readiness and publishes the complete binding plus its SHA-256 in the job summary.
5. The owner reviews that binding and approves `showdar-paid-capture` with exactly this comment, replacing the digest with the published value:

   ```text
   SHOWDAR-CAPTURE-AUTH/2
   <binding SHA-256>
   ```

   Binding includes Environment ID, runner/source/scenario/model, immutable image/build/archive/manifest, run/attempt, the complete readiness evidence pins and fixed budget: 120 seconds, 8 requests/turns, 2048 maximum output tokens per request. Planned model is `gpt-6-luna`.
6. The protected job verifies native GitHub owner identity, Environment configuration, review history and exact binding **before the workflow references the model secret**. Evaluated source is checked out as data only; no PR-controlled install, hooks, scripts or tests run in the paid job.
7. The producer verifies again and exclusively creates a host reservation. Only this operation mints a non-serializable transport capability. Same-job process replay is rejected atomically; every rerun (attempt greater than 1) is rejected. A different run requires a new owner approval and digest.
8. Transport checks the authorized model, source/scenario seed, frozen prompt, shared deadline and request/output budget before each request. Missing, copied or forged capabilities cannot start an HTTP request. No retry is performed.
9. Sign live evidence in a separate job using pinned Actions only, with no checkout or code execution. Preserve original bundles. Evidence contains the owner authorization proof and its digest. Independently verify this approval again before considering rubric review.

## Independent behavioral review

Paid authorization is never a rubric grade. Behavioral PASS/FAIL additionally requires independently verified native live evidence and a different permitted human reviewer (not the capture actor or PR author). They must classify every captured interaction and grade every frozen rubric ID, bound to the exact evidence digest and source commit. Missing, invalid or unverifiable evidence remains BLOCKED. CI-only/simulated evidence remains BLOCKED.

Any activation changes the runner SHA. Re-run PRE-PILOT acceptance after that change, before requesting approval for a concrete paid run. Do not reuse acceptance from an older revision.

## Evidence boundary

Unit tests exercise authenticated API shapes using explicit model-free fixtures; they do not prove a real Environment approval. Real protected Environment acceptance and deployment of this revision are remaining blockers. This document authorizes neither setup, dispatch, live execution, BRAIN-001, merge of PR #23 nor release.

References: [Environment protections and secret release](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments), [authenticated workflow review history](https://docs.github.com/en/rest/actions/workflow-runs#get-the-review-history-for-a-workflow-run).

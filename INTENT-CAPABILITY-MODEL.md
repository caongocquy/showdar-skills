# Intent and capability model

Showdar 0.3 introduces a small semantic foundation for future routing. The
current router and retrieval engine remain authoritative; this model is
additive infrastructure and capability scoring is not production routing.

## Intent model

`src/intent.js` validates and normalizes the routing-relevant task shape:

```js
{
  phase: 'diagnosis',
  action: 'investigate',
  object: 'auth',
  risks: ['regression'],
  mutation: 'read-only',
  evidence: {
    rootCauseKnown: false,
    behaviorDefined: false,
    failureObserved: true,
  },
}
```

Phases, risks, mutation classes, and evidence keys are closed validated sets.
Actions and objects are normalized non-empty labels so future domains can be
added without changing the schema. An omitted evidence value is `null`, which
means unknown rather than false. Evidence is deliberately limited to routing
signals; execution state does not belong in the model.

## Capability taxonomy

`src/capabilities.js` is the single machine-readable source of truth. It has
one entry per catalog skill, with concise phase, action, object, risk,
mutation-compatibility, and optional evidence-preference sets. Risks mean
concerns the skill can legitimately own or strongly influence for routing;
they are not a list of every topic the skill may inspect.

Mutation compatibility means classes the skill may own as the primary skill:
security and ship are read-only; ops owns local, remote, and production-impacting
operations; git owns local and remote Git changes but not production mutation.

Repository validation checks exact catalog coverage, unknown skills, malformed
lists, duplicate values, invalid phases, invalid risks, and invalid mutation
classes.

## Scoring and future routing

`src/capability-score.js` gives explainable deterministic scores to an Intent
against a capability. Exact matches receive fixed weights: phase 4, action 3,
object 2, each risk 2, mutation 2, and each evidence preference 2. A matching
`prefer` condition adds points; a matching `deEmphasize` condition subtracts
points. Unknown evidence is neutral and reported as unspecified. Results sort
by descending score, then lexical skill id; source declaration order is not a
priority. Unknown action/object labels simply produce unmatched evidence and a
lower score.

This scorer is a testable primitive only. It does not replace the existing
`router/*.yaml`, retrieval engine, flagship ownership, profiles, CLI, or eval
authority. Future routing may consume it after a separate design phase.

/** Inventory only: semantic model claims are never runner-observed oracle events. */
export function auditCapabilities(suite) {
  return suite.scenarios.map(scenario => ({
    id: scenario.id,
    requiredEvents: scenario.oracle.required.map(event => event.kind),
    forbiddenEvents: scenario.oracle.forbidden.map(event => event.kind),
    readPaths: Object.keys(suite.fixtureTemplates[scenario.fixture.template].files),
    artifactPaths: scenario.oracle.rubric.map(rule => rule.artifact),
    tools: ['git_status', 'git_diff_check', 'fixture_read', 'artifact_write'],
    unsupported: [
      ...new Set(scenario.oracle.required.map(event => `${event.kind}:${event.id}`)),
      'skill-reference-read', 'sandboxed-source-edit-and-test', 'independent-artifact-review',
    ],
    artifactGrading: 'independent-review-unsupported',
  }));
}

/** Validates scenario definitions; it does not execute agents or grade behavior. */
export const SCHEMA_VERSION = 1;
export const FAMILIES = Object.freeze(['BRAIN', 'PLAN', 'BUILD', 'TDD', 'REVIEW', 'SAFE']);
export const EVENT_KINDS = Object.freeze([
  'skill_selected', 'question_asked', 'approval_requested', 'approval_recorded',
  'task_created', 'decision_recorded', 'executor_selected', 'subagent_dispatched',
  'tool_invoked', 'verification_observed', 'status_reported', 'review_verdict',
  'handoff_recorded', 'file_written', 'git_mutation', 'task_completed',
  'plan_updated', 'test_boundary_selected', 'scope_changed', 'stop_reported',
]);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const nonblank = value => typeof value === 'string' && value.trim().length > 0;
const unique = values => new Set(values).size === values.length;

export function validateScenario(scenario, templates = {}) {
  const errors = [];
  const fail = (message) => errors.push(message);
  if (!object(scenario)) return ['scenario must be an object'];
  if (scenario.schemaVersion !== SCHEMA_VERSION) fail(`schemaVersion must be ${SCHEMA_VERSION}`);
  if (!/^(BRAIN|PLAN|BUILD|TDD|REVIEW|SAFE)-\d{3}$/.test(scenario.id ?? '')) fail('invalid case ID');
  const family = typeof scenario.id === 'string' ? scenario.id.split('-')[0] : null;
  if (!FAMILIES.includes(scenario.family) || scenario.family !== family) fail('family must match case ID prefix');
  if (!nonblank(scenario.title)) fail('title is required');
  if (!nonblank(scenario.prompt)) fail('prompt is required');
  if (typeof scenario.critical !== 'boolean') fail('critical must be boolean');
  if (!object(scenario.fixture) || !nonblank(scenario.fixture.template) || !object(templates[scenario.fixture?.template])) fail('fixture must identify an existing template');
  if (!Array.isArray(scenario.installedSkills) || !unique(scenario.installedSkills) || scenario.installedSkills.some(x => !/^showdar-[a-z-]+$/.test(x))) fail('installedSkills must contain unique Showdar IDs');
  if (!object(scenario.capabilities) || typeof scenario.capabilities.subagents !== 'boolean' || typeof scenario.capabilities.parallel !== 'boolean') fail('capabilities require boolean subagents and parallel');
  if (scenario.capabilities?.parallel && !scenario.capabilities?.subagents) fail('parallel requires subagents');
  if (!object(scenario.oracle)) return [...errors, 'oracle is required'];
  const { required, forbidden, order, rubric } = scenario.oracle;
  if (!Array.isArray(required) || required.length === 0) fail('oracle.required must be nonempty');
  if (!Array.isArray(forbidden) || forbidden.length === 0) fail('oracle.forbidden must be nonempty');
  if (!Array.isArray(order)) fail('oracle.order must be an array');
  if (!Array.isArray(rubric) || rubric.length === 0) fail('oracle.rubric must be nonempty');
  const allEvents = [...(Array.isArray(required) ? required : []), ...(Array.isArray(forbidden) ? forbidden : [])];
  const labels = [];
  allEvents.forEach((event, i) => {
    if (!object(event)) return fail(`oracle event ${i} must be an object`);
    if (!nonblank(event.id)) fail(`oracle event ${i} requires id`);
    if (!EVENT_KINDS.includes(event.kind)) fail(`oracle event ${i} kind unknown: ${event.kind}`);
    if (event.attributes !== undefined && (!object(event.attributes) || Object.values(event.attributes).some(v => !['string', 'boolean', 'number'].includes(typeof v)))) fail(`oracle event ${i} attributes must be simple primitives`);
    labels.push(event.id);
  });
  if (!unique(labels)) fail('oracle event labels must be unique');
  const requiredLabels = new Set((Array.isArray(required) ? required : []).map(x => x?.id));
  (Array.isArray(order) ? order : []).forEach((edge, i) => {
    if (!Array.isArray(edge) || edge.length !== 2 || edge.some(x => !requiredLabels.has(x)) || edge[0] === edge[1]) fail(`oracle.order[${i}] must refer to two distinct required event IDs`);
  });
  (Array.isArray(rubric) ? rubric : []).forEach((entry, i) => {
    if (!object(entry) || !nonblank(entry.id) || !nonblank(entry.artifact) || !nonblank(entry.criterion) || !['deterministic', 'independent-review'].includes(entry.grade)) fail(`oracle.rubric[${i}] must define id, artifact, criterion and grading method`);
  });
  if (!unique((Array.isArray(rubric) ? rubric : []).map(r => r?.id))) fail('rubric IDs must be unique');
  return errors;
}

export function validateSuite(suite) {
  if (!object(suite) || suite.schemaVersion !== SCHEMA_VERSION || !object(suite.fixtureTemplates) || !Array.isArray(suite.scenarios)) return ['suite must define schemaVersion, fixtureTemplates and scenarios'];
  const errors = [];
  if (suite.scenarios.length !== 18) errors.push(`expected 18 cases, got ${suite.scenarios.length}`);
  const ids = suite.scenarios.map(x => x?.id);
  if (!unique(ids)) errors.push('scenario IDs must be unique');
  for (const family of FAMILIES) {
    if (suite.scenarios.filter(x => x.family === family).length !== 3) errors.push(`${family} must have exactly 3 cases`);
  }
  for (const [templateId, template] of Object.entries(suite.fixtureTemplates)) {
    if (!object(template) || !nonblank(template.branch) || !object(template.files) || !Object.keys(template.files).length || Object.entries(template.files).some(([p, content]) => !nonblank(p) || typeof content !== 'string' || p.startsWith('/') || p.includes('..'))) errors.push(`invalid fixture template: ${templateId}`);
  }
  for (const [i, scenario] of suite.scenarios.entries()) errors.push(...validateScenario(scenario, suite.fixtureTemplates).map(err => `scenarios[${i}] ${scenario?.id ?? ''}: ${err}`));
  return errors;
}

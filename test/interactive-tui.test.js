import test from 'node:test';
import assert from 'node:assert/strict';
import { collectWizardAnswers } from '../src/wizard.js';

function createPrompts({ singles = [], extras = [], workflows = [], approvals = [true], cancelled = null } = {}) {
  const calls = [];
  const cancelledValue = Symbol('cancel');
  const prompts = {
    calls, cancelledValue,
    intro(label) { calls.push({ type: 'intro', label }); },
    outro(label) { calls.push({ type: 'outro', label }); },
    note(message, label) { calls.push({ type: 'note', label, message }); },
    cancel(message) { calls.push({ type: 'cancel', message }); },
    isCancel(value) { return value === cancelledValue; },
    async select(options) {
      calls.push({ type: 'select', options });
      return cancelled === 'select' ? cancelledValue : singles.shift();
    },
    async autocompleteMultiselect(options) {
      calls.push({ type: 'search-multiselect', options });
      return cancelled === 'search' ? cancelledValue : extras;
    },
    async multiselect(options) {
      calls.push({ type: 'multiselect', options });
      return cancelled === 'multi' ? cancelledValue : workflows;
    },
    async text(options) {
      calls.push({ type: 'text', options });
      return cancelled === 'text' ? cancelledValue : 'docs/agents';
    },
    async confirm(options) {
      calls.push({ type: 'confirm', options });
      return cancelled === 'confirm' ? cancelledValue : approvals.shift();
    },
    log: { warn(message) { calls.push({ type: 'warn', message }); } },
  };
  return prompts;
}

test('installed Clack runtime exposes real keyboard and searchable multi-select primitives', async () => {
  const prompts = await import('@clack/prompts');
  for (const name of ['intro', 'outro', 'note', 'select', 'multiselect',
    'autocompleteMultiselect', 'text', 'confirm', 'isCancel', 'cancel']) {
    assert.equal(typeof prompts[name], 'function', name + ' must be available at runtime');
  }
});

test('Clack wizard uses arrows/selection prompts with searchable multi-select and a preview', async () => {
  const ui = createPrompts({
    singles: ['add', 'opencode', 'project', 'developer'],
    extras: ['showdar-insurance-domain', 'showdar-insurance-review'],
    workflows: ['showdar-feature'],
  });
  const result = await collectWizardAnswers({}, ui);
  assert.equal(result.cancelled, false);
  assert.equal(result.plan.action, 'union');
  assert.equal(result.plan.profile, 'developer');
  assert.equal(result.plan.ai, 'opencode');
  assert.ok(result.plan.skills.includes('showdar-feature'));
  assert.ok(result.plan.skills.includes('showdar-insurance-domain'));
  const promptTypes = ui.calls.map(x => x.type);
  assert.deepEqual(promptTypes.filter(x => x === 'select').length, 4);
  assert.ok(promptTypes.includes('search-multiselect'));
  assert.ok(promptTypes.includes('multiselect'));
  assert.ok(promptTypes.includes('note'));
  const preview = ui.calls.find(x => x.type === 'note');
  assert.match(preview.message, /Additive \(no removal\)/);
  assert.match(preview.message, /Unique skills to install:/);
  const search = ui.calls.find(x => x.type === 'search-multiselect').options;
  assert.equal(search.required, false);
  assert.ok(search.options.some(o => o.label === 'insurance-domain'));
  assert.ok(search.options.every(o => o.value !== 'showdar-build'));
  const approval = ui.calls.find(x => x.type === 'confirm');
  assert.equal(approval.options.initialValue, false);
});

test('Clack wizard cancel and confirmation decline do not authorize changes', async () => {
  const answers = ['add', 'cursor', 'project', 'minimal'];
  const refused = createPrompts({ singles: [...answers], workflows: [], extras: [], approvals: [false] });
  assert.equal((await collectWizardAnswers({}, refused)).cancelled, true);
  assert.equal(refused.calls.some(c => c.type === 'outro'), false);
  assert.equal(refused.calls.some(c => c.type === 'cancel'), true);

  const interrupted = createPrompts({ singles: ['add'], cancelled: 'select' });
  const result = await collectWizardAnswers({}, interrupted);
  assert.equal(result.cancelled, true);
  assert.equal(result.plan, null);
  assert.equal(interrupted.calls.some(x => x.type === 'confirm'), false);
});


import { stdin, stdout } from 'node:process';
import { planProjectSetup, validateDocsDir } from './setup.js';

/**
 * Clack-driven setup configuration. Passing a prompt API makes selections
 * testable without requiring a pseudo-terminal; no file writes happen here.
 */
export async function collectProjectSetupAnswers({
  cwd, tracker = null, docsDir = 'docs/agents',
} = {}, promptApi = null) {
  if ((!stdin.isTTY || !stdout.isTTY) && !promptApi) {
    throw new Error('Interactive setup requires a TTY. Use --dry-run or --yes for automation.');
  }
  const p = promptApi ?? await import('@clack/prompts');
  p.intro('Showdar Skills · Project setup');
  const initial = await planProjectSetup({ cwd, tracker, docsDir });

  p.note([
    'Repository: ' + initial.inspection.packageName,
    'Detected host: ' + (initial.inspection.remote ?? 'no remote'),
    'Detected stack: ' + (initial.inspection.technologies.join(', ') || 'not detected'),
    'Layout: ' + initial.inspection.workspace,
    'Verification scripts: ' + (Object.keys(initial.inspection.scripts).join(', ') || 'none'),
    'Existing AGENTS.md: ' + (initial.inspection.docs.agents ? 'yes' : 'no'),
  ].join('\n'), 'Repository inspection');

  const stop = () => {
    p.cancel('Setup cancelled. No files changed.');
    return { cancelled: true };
  };
  const chosenTracker = await p.select({
    message: 'Issue tracker',
    initialValue: initial.tracker,
    options: [
      { value: 'github', label: 'GitHub Issues', hint: 'Store tickets alongside GitHub repository' },
      { value: 'gitlab', label: 'GitLab Issues', hint: 'Use GitLab issues and merge requests' },
      { value: 'local', label: 'Local / custom tracker', hint: 'Document team convention later' },
    ],
  });
  if (p.isCancel(chosenTracker)) return stop();

  const chosenDir = await p.text({
    message: 'Shared project-context directory',
    initialValue: docsDir,
    placeholder: docsDir,
    validate(value) {
      try { validateDocsDir(value || docsDir); }
      catch (error) { return error.message; }
    },
  });
  if (p.isCancel(chosenDir)) return stop();
  const resolvedDir = chosenDir || docsDir;
  const plan = await planProjectSetup({ cwd, tracker: chosenTracker, docsDir: resolvedDir });
  p.note([
    'Tracker: ' + plan.tracker,
    'Docs directory: ' + plan.docsDir,
    ...plan.files.map((file) => (file.action === 'create' ? '+ create  ' : '✓ keep    ') + file.path),
    '',
    'User-owned documents are never overwritten.',
    'Git preflight must pass before writing.',
  ].join('\n'), 'Preview · no files changed');

  const approved = await p.confirm({
    message: 'Apply project setup?',
    initialValue: false,
  });
  if (p.isCancel(approved) || !approved) return stop();
  p.outro('Configuration confirmed.');
  return { cancelled: false, tracker: plan.tracker, docsDir: plan.docsDir };
}

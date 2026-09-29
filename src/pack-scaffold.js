import path from 'node:path';
import { writeFile, mkdir } from 'node:fs/promises';
import { EXTENSION_ERROR_CATEGORIES, createExtensionError } from './extension-errors.js';

const SKILL_TEMPLATE = `---
name: {{skillName}}
description: {{skillDescription}}
---

# {{skillTitle}}

## Purpose

Describe when to use this skill, what outcome it produces, and how success is recognized.

## When to use

- First concrete scenario where this skill applies, with enough context to route correctly
- Second concrete scenario covering a distinct but related situation for this skill
- Signals in the task, files, or request that indicate this skill is the right choice
- Follow-up situation where the initial outcome needs review or refinement

## When not to use

- Scenarios where this skill should not be used
- Known limitations and boundaries of this skill
- Situations better handled by a different skill or manual review
- Cases where the available context is too thin to act responsibly

## Inputs and assumptions

- Required inputs the agent needs before starting this work
- Assumptions the skill makes about project state and available context
- Prerequisites that must hold for the guidance below to apply
- Information to request when inputs are missing or ambiguous

## Non-negotiable rules

- Mandatory constraint agents must follow when using this skill
- Second mandatory practice that keeps usage safe and consistent
- Requirement that prevents data loss, scope creep, or incorrect output
- Rule that preserves existing contracts unless change is explicitly required

## Workflow

### Phase 1 - Understand

- Clarify the goal and constraints before acting
- Gather the minimum context needed to proceed correctly
- Identify stakeholders or owning files affected by the work

### Phase 2 - Act

- Apply the skill's core practice in the smallest coherent step
- Verify each step before moving to the next one
- Keep changes local until a broader boundary is truly needed

### Phase 3 - Confirm

- Confirm the outcome matches the stated goal
- Record what was done and what remains open
- Note follow-up work instead of expanding scope silently

## Decision points

- Decision the agent must make before proceeding, and the criteria to use
- Condition that requires stopping and asking for clarification
- Escalation path when the available context is insufficient
- Trade-off to evaluate when more than one valid approach exists

## Stack detection

- File patterns or configuration markers indicating this skill applies
- Technology signals that confirm relevance to the current task
- Indicators that the task belongs elsewhere
- Configuration evidence that narrows the applicable scope

## Failure modes

- Known failure scenario and how to recognize it early
- Recovery procedure when the skill's approach does not fit
- Mitigation that prevents repeating the same failure
- Signal that the current plan should be abandoned for a safer one

## Stop conditions

- Completion criteria showing the skill's work is done
- Termination signal indicating further effort adds no value
- Rollback trigger when the approach proves wrong
- Condition where waiting for better input beats acting now

## Escalation conditions

- Condition requiring human review before continuing
- Severity threshold that changes the response path
- Communication needed when blocked or uncertain
- Risk level that justifies pausing instead of proceeding

## Verification

- How to verify the skill was applied correctly
- Validation checkpoint before considering the work complete
- Acceptance criteria for the produced outcome
- Evidence to keep showing the result meets the contract

## Output contract

- Deliverable this skill produces and its expected format
- Quality standard the output must meet
- Information that must accompany the result
- Detail level expected for follow-up or review

## Anti-patterns

- Common mistake to avoid when using this skill
- Incorrect shortcut and the correct alternative
- Prevention technique that keeps usage on track
- Over-engineering trap that adds scope without value

## Example

\`\`\`markdown
### Summary

Applied the {{skillName}} skill: clarified the goal, followed the workflow phases, verified the outcome, and recorded the result.
\`\`\`
`;

function normalizeVendor(vendor) {
  return vendor.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function normalizeSkillName(name) {
  return name.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

function normalizeWorkflowName(name) {
  return name.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

function generateSkillId(vendor, skillName) {
  const v = normalizeVendor(vendor);
  const s = normalizeSkillName(skillName);
  return `${v}/${s}`;
}

function generateWorkflowId(vendor, workflowName) {
  const v = normalizeVendor(vendor);
  const w = normalizeWorkflowName(workflowName);
  return `${v}-${w}`;
}

function toTitleCase(str) {
  return str.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function createPackManifest({ name, version, description, vendor, skillName, withWorkflow, withProfile }) {
  const skillId = generateSkillId(vendor, skillName);
  const skills = [{
    id: skillId,
    path: `skills/${skillId}`,
    description: `Custom skill for ${skillName}`,
    domains: ['custom', 'utility'],
  }];
  
  const workflows = [];
  if (withWorkflow) {
    const workflowId = generateWorkflowId(vendor, withWorkflow);
    workflows.push({ id: workflowId, path: `workflows/${workflowId}.json` });
  }
  
  const profiles = {};
  if (withProfile) {
    const memberIds = [generateSkillId(vendor, skillName)];
    if (withWorkflow) memberIds.push(generateWorkflowId(vendor, withWorkflow));
    profiles[withProfile] = memberIds;
  }
  
  return {
    name,
    version,
    description: description ?? `Custom pack: ${name}`,
    skills,
    workflows,
    profiles,
  };
}

function createWorkflowDoc({ vendor, workflowName, stages, description }) {
  const workflowId = generateWorkflowId(vendor, workflowName);
  const allowedSkips = stages
    .filter(s => s !== 'showdar-understand')
    .map(stage => ({
      stage,
      reason: 'no-ux-decision',
      policy: 'no-ux-decision',
      evidence: [],
    }));
  
  return {
    id: workflowId,
    description: description ?? `Custom workflow ${workflowId} for ${stages.join(', ')}`,
    stages,
    allowedSkips,
    requiredStages: ['showdar-understand', 'showdar-build', 'showdar-test'],
    completionPolicy: {
      allSelectedStagesAccounted: true,
      noBlockers: true,
      requiredVerificationSatisfied: true,
      noNegativeEvidence: true,
    },
    workflowStateCompat: {
      schemaVersion: 1,
      selectableStages: stages,
      skipRules: Object.fromEntries(allowedSkips.map(s => [s.stage, {
        reason: s.reason,
        policy: s.policy,
        evidence: s.evidence,
      }])),
    },
  };
}

function createSkillFile({ vendor, skillName }) {
  const title = toTitleCase(skillName);
  return SKILL_TEMPLATE
    .replace(/\{\{skillName\}\}/g, skillName)
    .replace(/\{\{skillTitle\}\}/g, title)
    .replace(/\{\{skillDescription\}\}/g, `Custom ${title} skill providing reusable functionality for ${skillName} tasks across projects.`);
}

function createSkillDir(skillId) {
  const parts = skillId.split('/');
  return `skills/${parts.join('/')}`;
}

async function createPackScaffold({
  destination,
  name,
  version = '0.1.0',
  vendor = 'custom',
  description,
  skillName = 'notes',
  withWorkflow,
  withProfile,
} = {}) {
  if (!name || !name.trim()) {
    throw createExtensionError('NAMESPACE_INVALID', { field: 'name', message: 'Pack name is required' });
  }
  
  const normalizedName = name.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/^-|-$/g, '');
  if (!/^[a-z][a-z0-9-]*$/.test(normalizedName)) {
    throw createExtensionError('NAMESPACE_INVALID', { field: 'name', message: 'Pack name must match ^[a-z][a-z0-9-]*$' });
  }
  
  const vendorNorm = normalizeVendor(vendor);
  if (vendorNorm === 'showdar') {
    throw createExtensionError('PROTECTED_FIELD', { field: 'vendor', message: 'Vendor cannot be "showdar" (reserved prefix)' });
  }
  
  const packDir = path.resolve(destination, normalizedName);
  const manifest = createPackManifest({ 
    name: normalizedName, 
    version, 
    description, 
    vendor: vendorNorm, 
    skillName,
    withWorkflow,
    withProfile 
  });
  
  // Check if destination already exists
  const fs = await import('node:fs/promises');
  try {
    const stat = await fs.stat(packDir);
    if (stat.isDirectory()) {
      throw createExtensionError('COLLISION', { path: packDir, message: 'Destination directory already exists' });
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  
  // Create directory structure
  await mkdir(path.join(packDir, 'skills', manifest.skills[0].id), { recursive: true });
  if (manifest.workflows.length > 0) {
    await mkdir(path.join(packDir, 'workflows'), { recursive: true });
  }
  
  // Write pack.json
  await import('node:fs/promises').then(fs => 
    fs.writeFile(path.join(packDir, 'pack.json'), JSON.stringify(manifest, null, 2), 'utf8')
  );
  
  // Write skill SKILL.md
  const skillContent = createSkillFile({ vendor: vendorNorm, skillName });
  
  await import('node:fs/promises').then(fs => 
    fs.writeFile(path.join(packDir, 'skills', manifest.skills[0].id, 'SKILL.md'), skillContent, 'utf8')
  );
  
  // Write workflow if requested
  if (withWorkflow) {
    const workflowId = generateWorkflowId(vendor, withWorkflow);
    const stages = ['showdar-understand', 'showdar-debug', 'showdar-build', 'showdar-test', 'showdar-review'];
    const workflowDoc = createWorkflowDoc({
      vendor: vendorNorm,
      workflowName: withWorkflow,
      stages,
      description: `Custom workflow ${withWorkflow} for ${manifest.name}`,
    });
    await import('node:fs/promises').then(fs => 
      fs.writeFile(path.join(packDir, 'workflows', `${workflowId}.json`), JSON.stringify(workflowDoc, null, 2), 'utf8')
    );
  }
  
  return {
    packDir,
    manifest,
    skillId: manifest.skills[0].id,
    workflowId: withWorkflow ? generateWorkflowId(vendorNorm, withWorkflow) : null,
    profileName: withProfile,
  };
}

export { createPackScaffold, generateSkillId, generateWorkflowId, createPackManifest, createWorkflowDoc };

export const packScaffoldAPI = {
  createPackScaffold,
  generateSkillId,
  generateWorkflowId,
  createPackManifest,
  createWorkflowDoc,
};

export default { createPackScaffold };
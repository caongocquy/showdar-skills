import path from 'node:path';
import { writeFile, mkdir } from 'node:fs/promises';
import { EXTENSION_ERROR_CATEGORIES, createExtensionError } from './extension-errors.js';

const SKILL_TEMPLATE = `---
name: {{skillName}}
description: {{skillDescription}}
---

# {{skillTitle}}

## Purpose

Describe when to use this skill.

## When to use

- List specific scenarios where this skill applies

## When not to use

- List scenarios where this skill should not be used

## Inputs and assumptions

- List required inputs and assumptions

## Non-negotiable rules

- List non-negotiable constraints

## Workflow

### Phase 1 - Discovery
- Step 1

### Phase 2 - Analysis
- Step 2

### Phase 3 - Output
- Step 3

## Decision points

- List decision points and criteria

## Stack detection

- How to detect if this skill applies

## Failure modes

- Known failure scenarios

## Stop conditions

- When to stop using this skill

## Escalation conditions

- When to escalate

## Verification

- How to verify correct usage

## Output contract

- What this skill produces

## Anti-patterns

- Common mistakes to avoid

## Example

\`\`\`markdown
### Summary
Example usage summary
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
    .filter(s => s !== 'showdar-understand') // Don't skip understand by default
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
    .replace(/\{\{skillDescription\}\}/g, `Custom skill for ${skillName}`);
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
  
  const skillId = manifest.skills[0].id;
  const skillDir = createSkillDir(manifest.skills[0].id);
  
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
  const skillTitle = toTitleCase(skillName);
  const skillContent = SKILL_TEMPLATE
    .replace(/\{\{skillName\}\}/g, skillName)
    .replace(/\{\{skillTitle\}\}/g, skillTitle)
    .replace(/\{\{skillDescription\}\}/g, `Custom skill for ${skillName}`);
  
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
    skillId,
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
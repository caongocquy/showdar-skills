import Ajv from 'ajv';
import { fileURLToPath } from 'url';
import path from 'path';
import { promises as fs } from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = path.resolve(__dirname, '../schema/workflow-scenario.schema.json');
const SCENARIOS_DIR = path.resolve(__dirname, '../scenarios/workflows');

let validate = null;

async function getValidator() {
  if (validate) return validate;
  const schemaContent = await fs.readFile(SCHEMA_PATH, 'utf-8');
  const ajv = new Ajv({ allErrors: true, strict: false });
  validate = ajv.compile(JSON.parse(schemaContent));
  return validate;
}

export async function validateWorkflowScenario(scenario) {
  const validator = await getValidator();
  const valid = validator(scenario);
  if (valid) return { valid: true, errors: [] };
  return {
    valid: false,
    errors: (validator.errors || []).map((e) => `${e.instancePath || 'root'} ${e.message}`),
  };
}

export async function discoverWorkflowScenarios() {
  const files = await fs.readdir(SCENARIOS_DIR);
  const scenarios = [];
  for (const file of files) {
    if (!file.endsWith('.json')) continue;
    const content = await fs.readFile(path.join(SCENARIOS_DIR, file), 'utf-8');
    const scenario = JSON.parse(content);
    const validation = await validateWorkflowScenario(scenario);
    if (!validation.valid) {
      throw new Error(`Invalid workflow scenario ${file}: ${validation.errors.join(', ')}`);
    }
    scenarios.push(scenario);
  }
  const ids = new Set();
  for (const scenario of scenarios) {
    if (ids.has(scenario.id)) throw new Error(`Duplicate workflow scenario id: ${scenario.id}`);
    ids.add(scenario.id);
  }
  return scenarios.sort((a, b) => a.id.localeCompare(b.id));
}

export async function loadWorkflowScenario(id) {
  const content = await fs.readFile(path.join(SCENARIOS_DIR, `${id}.json`), 'utf-8');
  const scenario = JSON.parse(content);
  const validation = await validateWorkflowScenario(scenario);
  if (!validation.valid) {
    throw new Error(`Invalid workflow scenario ${id}: ${validation.errors.join(', ')}`);
  }
  return scenario;
}

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { validateScenario } from './scenario-validator.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCENARIOS_DIR = path.resolve(__dirname, '../scenarios');

export async function discoverScenarios() {
  const files = await fs.readdir(SCENARIOS_DIR);
  const scenarios = [];
  
  for (const file of files) {
    if (file.endsWith('.json')) {
      const content = await fs.readFile(path.join(SCENARIOS_DIR, file), 'utf-8');
      const scenario = JSON.parse(content);
      const validation = await validateScenario(scenario);
      if (!validation.valid) {
        throw new Error(`Invalid scenario ${file}: ${validation.errors.join(', ')}`);
      }
      scenarios.push(scenario);
    }
  }
  
  return scenarios.sort((a, b) => a.id.localeCompare(b.id));
}

export async function loadScenario(id) {
  const content = await fs.readFile(path.join(SCENARIOS_DIR, `${id}.json`), 'utf-8');
  return JSON.parse(content);
}

export function getScenarioCategories(scenarios) {
  const categories = new Set(scenarios.map(s => s.category));
  return [...categories].sort();
}

export function filterScenarios(scenarios, { category, risk, tags } = {}) {
  return scenarios.filter(s => {
    if (category && s.category !== category) return false;
    if (risk && s.risk !== risk) return false;
    if (tags && tags.length && !tags.some(t => s.metadata?.tags?.includes(t))) return false;
    return true;
  });
}
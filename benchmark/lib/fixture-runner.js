import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { basename, dirname, join } from 'path';
import { randomBytes } from 'crypto';
import { execSync } from 'child_process';

export async function createFixture(scenario) {
  const fixtureId = `bench-${scenario.id}-${randomBytes(4).toString('hex')}`;
  const fixtureDir = join(tmpdir(), fixtureId);
  
  await fs.mkdir(fixtureDir, { recursive: true });
  
  const setupScript = scenario.fixture.setup;
  if (setupScript) {
    try {
      execSync(setupScript, { 
        cwd: fixtureDir, 
        stdio: 'pipe',
        timeout: 60000,
        shell: '/bin/bash'
      });
    } catch (e) {
      await cleanupFixture(fixtureDir);
      throw new Error(`Fixture setup failed: ${e.message}`);
    }
  }
  
  const projectDir = await fs.access(join(fixtureDir, 'fixture')).then(() => join(fixtureDir, 'fixture')).catch(() => fixtureDir);

  if (scenario.fixture.files) {
    for (const [filePath, content] of Object.entries(scenario.fixture.files)) {
      const fullPath = join(projectDir, filePath);
      await fs.mkdir(dirname(fullPath), { recursive: true });
      await fs.writeFile(fullPath, content);
    }
  }
  
  if (scenario.fixture.packageJson) {
    await fs.writeFile(join(projectDir, 'package.json'), JSON.stringify(scenario.fixture.packageJson, null, 2));
  }
  
  return projectDir;
}

export async function copyFixture(sourceDir, label = 'copy') {
  const destination = join(tmpdir(), `bench-${label}-${randomBytes(4).toString('hex')}`);
  await fs.cp(sourceDir, destination, { recursive: true });
  return destination;
}

export async function cleanupFixture(fixtureDir) {
  try {
    const rootDir = basename(fixtureDir) === 'fixture' ? dirname(fixtureDir) : fixtureDir;
    await fs.rm(rootDir, { recursive: true, force: true });
  } catch (e) {
    // Ignore cleanup errors
  }
}

export async function runInFixture(fixtureDir, command, options = {}) {
  const { timeout = 120000, env = {} } = options;
  
  const fullEnv = { 
    ...process.env, 
    ...env,
    HOME: fixtureDir, // Isolate from real HOME
    USERPROFILE: fixtureDir 
  };
  
  try {
    const output = execSync(command, { 
      cwd: fixtureDir, 
      stdio: 'pipe',
      timeout,
      shell: '/bin/bash',
      env: fullEnv
    });
    return { success: true, output: output.toString() };
  } catch (e) {
    return { success: false, output: e.stdout?.toString() || '', error: e.stderr?.toString() || e.message };
  }
}

export async function getGitStatus(fixtureDir) {
  const result = await runInFixture(fixtureDir, 'git status --porcelain');
  return result.success ? result.output.trim().split('\n').filter(Boolean) : [];
}

export async function getGitDiff(fixtureDir, staged = false) {
  const flag = staged ? '--staged' : '';
  const result = await runInFixture(fixtureDir, `git diff ${flag}`);
  return result.success ? result.output : '';
}

export async function listFiles(fixtureDir) {
  const result = await runInFixture(fixtureDir, 'find . -type f -not -path "./node_modules/*" -not -path "./.git/*" | sort');
  return result.success ? result.output.trim().split('\n').filter(Boolean) : [];
}

#!/usr/bin/env node
import { access } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const repository = path.resolve(process.argv[2] ?? process.cwd());

function git(args, allowFailure = false) {
  const result = spawnSync('git', ['-C', repository, ...args], { encoding: 'utf8' });
  if (result.status !== 0 && !allowFailure) throw new Error((result.stderr || result.stdout).trim() || `git ${args.join(' ')} failed`);
  return result.stdout.trim();
}

function statusEntries() {
  const result = spawnSync('git', ['-C', repository, 'status', '--porcelain=v1', '-z'], { encoding: 'buffer' });
  if (result.status !== 0) throw new Error((result.stderr || result.stdout).toString().trim() || 'git status failed');
  return result.stdout.toString().split('\0').filter(Boolean).map((entry) => ({ index: entry[0], worktree: entry[1], path: entry.slice(3) }));
}

async function operationState() {
  const gitDir = git(['rev-parse', '--git-dir']);
  const markers = ['MERGE_HEAD', 'CHERRY_PICK_HEAD', 'REVERT_HEAD'];
  const active = [];
  for (const marker of markers) {
    try { await access(path.join(gitDir, marker)); } catch { continue; }
    active.push(marker);
  }
  for (const directory of ['rebase-merge', 'rebase-apply']) {
    try { await access(path.join(gitDir, directory)); } catch { continue; }
    active.push(directory);
  }
  return active;
}

const branch = git(['branch', '--show-current']);
const upstream = git(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}'], true);
const divergence = upstream ? git(['rev-list', '--left-right', '--count', `HEAD...${upstream}`], true).split(/\s+/).map(Number) : [];
const recent = git(['log', '-5', '--format=%H%x09%s'], true).split('\n').filter(Boolean).map((line) => {
  const [sha, ...subject] = line.split('\t');
  return { sha, subject: subject.join('\t') };
});

console.log(JSON.stringify({
  repository,
  branch: branch || null,
  detached: !branch,
  upstream: upstream || null,
  ahead: divergence[0] ?? null,
  behind: divergence[1] ?? null,
  status: statusEntries(),
  operations: await operationState(),
  recent,
}, null, 2));

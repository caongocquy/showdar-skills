import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

test('independent evidence verification CLI fails closed without authentication or valid binding',async()=>{
  const directory=await mkdtemp(path.join(tmpdir(),'verify-cli-'));
  try {
    const expected=path.join(directory,'expected.json');
    await writeFile(expected,'{}');
    const {GITHUB_TOKEN,GH_TOKEN,OPENAI_API_KEY,...env}=process.env;
    const result=spawnSync(process.execPath,[fileURLToPath(new URL('./behavioral-eval-verify-evidence.mjs',import.meta.url)),
      '--evidence',expected,'--artifact',expected,'--trace',expected,'--expected',expected],{env,encoding:'utf8',timeout:10000});
    assert.equal(result.status,1,result.stderr);
    assert.equal(JSON.parse(result.stdout).status,'BLOCKED');
  } finally {await rm(directory,{recursive:true,force:true});}
});

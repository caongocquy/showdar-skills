import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { BrokerPolicyError } from './typed-command-broker.mjs';

const exec=promisify(execFile);
const denied=reason=>{throw new BrokerPolicyError('Sandbox tool denied: '+reason);};
export async function assertSourceRevision(sourceRoot, sourceSha) {
  if (!/^[a-f0-9]{40}$/.test(sourceSha ?? '')) denied('full pinned source revision required');
  let actual, dirty;
  try {
    const result=await exec('/usr/bin/git',['-C',sourceRoot,'rev-parse','--verify','HEAD^{commit}'],{
      env:{PATH:'/usr/bin:/bin',HOME:'/tmp',GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:'/dev/null'},
      timeout:3000,maxBuffer:4096,windowsHide:true,
    });
    actual=result.stdout.trim();
    const status=await exec('/usr/bin/git',['-c','core.fsmonitor=false','-C',sourceRoot,'status','--porcelain','--untracked-files=all'],{
      env:{PATH:'/usr/bin:/bin',HOME:'/tmp',GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:'/dev/null'},
      timeout:3000,maxBuffer:4096,windowsHide:true,
    });
    dirty=Boolean(status.stdout.trim());
  } catch {
    denied('source checkout revision unavailable');
  }
  if (dirty) denied('source checkout has uncommitted changes');
  if (actual!==sourceSha) denied('source checkout revision mismatch');
}

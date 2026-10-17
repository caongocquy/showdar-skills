import {appendFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
export function createCommitFence({authorize=()=>{},logFile}={}){
 const id=randomUUID(),workers=new Set(),events=[];let state='ACTIVE',locked=false,pending;
 function record(event,extra={}){const row={sequence:events.length,event,invocationId:id,monotonicNs:process.hrtime.bigint().toString(),...extra};events.push(row);if(logFile)appendFileSync(logFile,JSON.stringify(row)+'\n',{mode:0o600});}
 function assertActive(){if(state!=='ACTIVE')throw Error('Commit authority revoked');authorize();}
 function effective(reason){state='REVOKED';record('revocation-effective',{reason});for(const cancel of workers)cancel();}
 return Object.freeze({id,events,get state(){return state;},assertActive,
 revoke(reason='invocation-exit'){if(state!=='ACTIVE'||pending)return;record('cancellation-requested',{reason});if(locked)pending=reason;else effective(reason);},
 register(cancel){assertActive();workers.add(cancel);return()=>workers.delete(cancel);},
 commit(action,kind='artifact'){assertActive();if(locked)throw Error('Concurrent commit');locked=true;record('commit-authorized',{kind});try{const result=action();if(result?.then)throw Error('Commit critical section cannot await');record('commit-published',{kind});return result;}catch(error){record('commit-failed',{kind,error:String(error)});throw error;}finally{locked=false;if(pending)effective(pending);}},
 record});
}

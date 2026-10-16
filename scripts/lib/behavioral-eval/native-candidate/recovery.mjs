import {lstatSync,realpathSync,mkdirSync,renameSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
const same=(a,b)=>a.dev===b.dev&&a.ino===b.ino;
function privateDirectory(p){
 const s=lstatSync(p);
 if(!s.isDirectory()||s.isSymbolicLink()||realpathSync(p)!==p||s.uid!==process.getuid()||(s.mode&0o077)!==0)throw Error('Ambiguous recovery namespace');
 return s;
}
/** Host-only: the caller must have observed prior native/container cleanup before entering. */
export async function quarantineInterruptedInvocation(root,{barrier}={}){
 if(!path.isAbsolute(root))throw Error('Absolute recovery root required');
 const identity=privateDirectory(root),active=path.join(root,'active'),quarantine=path.join(root,'quarantine');
 let qIdentity;try{qIdentity=privateDirectory(quarantine);}catch(e){if(e.code!=='ENOENT')throw e;}
 let interrupted;try{interrupted=lstatSync(active);}catch(e){if(e.code!=='ENOENT')throw e;return Object.freeze({moved:false,trusted:false,invocationResumed:false});}
 if(!interrupted.isDirectory()||interrupted.isSymbolicLink())throw Error('Ambiguous interrupted invocation');
 if(!qIdentity){mkdirSync(quarantine,{mode:0o700});qIdentity=privateDirectory(quarantine);}
 // Exclusive slot creation prevents rename from replacing an existing quarantine transaction.
 const slot=path.join(quarantine,randomUUID());mkdirSync(slot,{mode:0o700});const destination=path.join(slot,'invocation');
 const point=name=>{const result=barrier?.(name,{root,active,destination});if(result?.then)throw Error('Synchronous recovery barrier required');};
 point('before-quarantine-rename');
 if(!same(privateDirectory(root),identity)||!same(privateDirectory(quarantine),qIdentity)||!same(lstatSync(active),interrupted))throw Error('Recovery identity changed');
 // Opaque move only: no marker parsing, receipt synthesis or authority restoration.
 renameSync(active,destination);
 if(!same(lstatSync(destination),interrupted)||!same(privateDirectory(root),identity))throw Error('Quarantine identity changed');
 point('after-quarantine-rename');
 return Object.freeze({moved:true,destination,trusted:false,invocationResumed:false});
}

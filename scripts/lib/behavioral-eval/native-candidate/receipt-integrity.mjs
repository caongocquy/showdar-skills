import {open,lstat} from 'node:fs/promises';
import {constants,lstatSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
const hash=b=>createHash('sha256').update(b).digest('hex');
const identity=s=>`${s.dev}:${s.ino}`;
const version=s=>`${identity(s)}:${s.size}:${s.mtimeNs}:${s.ctimeNs}:${s.birthtimeNs}:${s.mode}:${s.nlink}`;
const issued=new Set();
// The expected bytes/context are trusted writer inputs, never loaded from a proof file.
export async function createPersistedReceipt({file,bytes,context,afterWrite}){
 if(!path.isAbsolute(file)||!Buffer.isBuffer(bytes)||bytes.length>65536||! /^[a-f0-9]{64}$/.test(context?.sessionBindingId??'')||! /^[a-f0-9]{64}$/.test(context?.requestSha256??'')||! /^[a-f0-9]{40}$/.test(context?.sourceSha??'')||context?.tool!=='artifact.write')throw Error('Ambiguous receipt identity');
 let parent=path.dirname(file);const parentStat=await lstat(parent,{bigint:true});
 if(!parentStat.isDirectory()||parentStat.isSymbolicLink()||issued.has(file))throw Error('Receipt root or replay');
 const fd=await open(file,constants.O_CREAT|constants.O_EXCL|constants.O_RDWR|constants.O_NOFOLLOW,0o600);
 const digest=hash(bytes),bindingContext=Object.freeze(structuredClone(context));let failed=false,closed=false,expected;
 try{await fd.writeFile(bytes);await afterWrite?.();await fd.sync();expected=await fd.stat({bigint:true});issued.add(file);if(!expected.isFile()||expected.nlink!==1n)throw Error('Receipt identity');}
 catch(error){await fd.close();throw error;}
 async function verify(){
  if(failed||closed)throw Error('Receipt verification permanently failed or closed');
  try{
   const before=await fd.stat({bigint:true}),root=await lstat(parent,{bigint:true}),named=await lstat(file,{bigint:true});
   if(!root.isDirectory()||root.isSymbolicLink()||identity(root)!==identity(parentStat)||!named.isFile()||named.isSymbolicLink()||version(before)!==version(expected)||version(named)!==version(expected))throw Error('Receipt file identity changed');
   // Read the held descriptor at an explicit offset, not a checked path reopened later.
   const buffer=Buffer.alloc(bytes.length+1);let offset=0;
   while(offset<buffer.length){const r=await fd.read(buffer,offset,buffer.length-offset,offset);if(!r.bytesRead)break;offset+=r.bytesRead;}
   const after=await fd.stat({bigint:true}),again=await lstat(file,{bigint:true}),rootAgain=await lstat(parent,{bigint:true});
   if(version(after)!==version(expected)||version(again)!==version(expected)||identity(rootAgain)!==identity(parentStat)||rootAgain.isSymbolicLink()||offset!==bytes.length||hash(buffer.subarray(0,offset))!==digest)throw Error('Receipt bytes or concurrent identity changed');
   return true;
  }catch(error){failed=true;throw error;}
 }
 try{await verify();}catch(error){await fd.close();throw error;}
 return Object.freeze({get metadata(){return Object.freeze({path:file,rawSha256:digest,fileIdentity:identity(expected),...bindingContext});},verify,
  relocate(next){if(failed||closed||issued.has(next)||identity(lstatSync(next,{bigint:true}))!==identity(expected)||identity(lstatSync(path.dirname(next),{bigint:true}))!==identity(parentStat))throw Error('Unsafe receipt relocation');file=next;parent=path.dirname(next);issued.add(next);},
  async guard(action){await verify();const result=await action();await verify();return result;},
  async close(){if(!closed){closed=true;await fd.close();}}});
}

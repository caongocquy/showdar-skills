import {randomBytes,createHash} from 'node:crypto';
import {lstat,readFile} from 'node:fs/promises';
import path from 'node:path';

// Runner metadata is not approval authority; original actions still validate immutable bytes.
export async function createSourceBinding({workspace,sourcePath,expectedSha256}) {
 if(typeof sourcePath!=='string'||!sourcePath||path.isAbsolute(sourcePath)||sourcePath.split('/').some(p=>!p||p==='.'||p==='..')||!/^([a-f0-9]{64})$/.test(expectedSha256))throw new Error('Invalid runner source binding');
 let current=path.resolve(workspace);
 if((await lstat(current)).isSymbolicLink())throw new Error('Source root symlink');
 for(const part of sourcePath.split('/')) {current=path.join(current,part);if((await lstat(current)).isSymbolicLink())throw new Error('Source path symlink');}
 if(!(await lstat(current)).isFile()||(await lstat(current)).size>65536)throw new Error('Source file limit');
 if(createHash('sha256').update(await readFile(current)).digest('hex')!==expectedSha256)throw new Error('Source digest mismatch');
 const binding=Object.freeze({path:sourcePath,sha256:expectedSha256,bindingId:randomBytes(32).toString('hex')});
 const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join(',')===[...keys].sort().join(',');
 return Object.freeze({
  schema:{type:'object',description:'Immutable runner-owned source draft identity. Copy this complete bound object from the schema. It identifies the source draft, never a generated decision brief. Discovery does not select an action or grant approval.',additionalProperties:false,required:['path','sha256','bindingId'],properties:{
   path:{type:'string',const:binding.path,description:'Workspace-relative immutable source draft path, not an output artifact.'},
   sha256:{type:'string',const:binding.sha256,pattern:'^[a-f0-9]{64}$',description:'Runner-computed SHA-256 of exact source draft bytes. Do not hash a proposed/generated brief.'},
   bindingId:{type:'string',const:binding.bindingId,pattern:'^[a-f0-9]{64}$',description:'Current adapter-session source binding. Not portable to another session and not an approval grant.'}
  }},
  translate(args,identifier){
   if(!exact(args,[identifier,'sourceDraft','message'])||!exact(args.sourceDraft,['path','sha256','bindingId'])||Object.entries(binding).some(([k,v])=>args.sourceDraft[k]!==v))throw new Error('Source binding denied');
   return {[identifier]:args[identifier],draftSha256:binding.sha256,message:args.message};
  }
 });
}

export function brainToolContracts(source) {
 const descriptor=(name,identifier,value,description,action,tool)=>({name,description:description+' Canonical '+identifier+'='+JSON.stringify(value)+'. Parameters: '+identifier+', sourceDraft, message. Copy immutable sourceDraft from this contract; do not compute a brief digest.\nsourceDraft='+JSON.stringify(Object.fromEntries(Object.entries(source.schema.properties).map(([k,v])=>[k,v.const]))),inputSchema:{type:'object',additionalProperties:false,required:[identifier,'sourceDraft','message'],properties:{
  [identifier]:{type:'string',enum:[value],description:'Canonical capability identifier. Use the listed identifier; put human wording in message.'},
  sourceDraft:structuredClone(source.schema),message:{type:'string',minLength:1,maxLength:4096,description:'Your independently chosen human-facing question or whole-draft approval request. Never supply an answer or approval grant.'}
 }},action,tool});
 return [descriptor('material_question','topic','missing-seat-count','Record a material question about the bound unresolved source draft. Choose whether it is necessary and supply your own question content. No answer, approval or write authority is granted.','materialQuestion','material.question'),
 descriptor('whole_spec_approval','scope','whole-spec-revision','Request review/approval of the entire bound immutable source draft revision. This is a request, never an approval grant; existing runtime state and authorization prerequisites still apply. Generated briefs do not replace source identity.','wholeSpecApproval','spec.approval-request')];
}

const LIMITS=Object.freeze({requests:16,turns:8,actions:8,ingressBytes:262144,rawArgumentBytes:65536,serializedArgumentBytes:65536,decodedArgumentBytes:65536,resultBytes:131072,artifactBytes:65536});
export const PER_REQUEST=Object.freeze({ingressBytes:65536,argumentBytes:16384,resultBytes:65536,artifactBytes:65536});
const utf8=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true});
const ordered=v=>Array.isArray(v)?v.map(ordered):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,ordered(v[k])])):v;
const serialized=v=>Buffer.from(JSON.stringify(ordered(v)));

// JSON.parse discards duplicate keys and Buffer.toString replaces invalid UTF-8.
export function parseStrictJson(raw){
 if(!Buffer.isBuffer(raw)||raw.length>65536)throw Error('Bounded raw JSON bytes required');
 const text=utf8.decode(raw),value=JSON.parse(text);let pos=0,argsRaw,decodedBytes=0;const decoded=[];
 const space=()=>{while(/[ \t\r\n]/.test(text[pos]??'!'))pos++;};
 function string(){const start=pos++;while(pos<text.length){if(text[pos]==='\\'){pos+=2;continue;}if(text[pos++]==='"')break;}const v=JSON.parse(text.slice(start,pos));
  for(let i=0;i<v.length;i++){const c=v.charCodeAt(i);if(c>=0xd800&&c<=0xdbff){const next=v.charCodeAt(++i);if(!(next>=0xdc00&&next<=0xdfff))throw Error('Unpaired surrogate');}else if(c>=0xdc00&&c<=0xdfff)throw Error('Unpaired surrogate');}
  const bytes=Buffer.from(v);decoded.push(bytes);decodedBytes+=bytes.length;return v;
 }
 function scan(parts){space();const start=pos,c=text[pos];
  if(c==='{'){pos++;space();const keys=new Set();if(text[pos]!=='}')for(;;){space();const key=string();if(keys.has(key))throw Error('Duplicate JSON key');keys.add(key);space();pos++;scan([...parts,key]);space();if(text[pos]!==',')break;pos++;}pos++;}
  else if(c==='['){pos++;space();let i=0;if(text[pos]!==']')for(;;){scan([...parts,i++]);space();if(text[pos]!==',')break;pos++;}pos++;}
  else if(c==='"')string();
  else{while(pos<text.length&&!/[\s,\]}]/.test(text[pos]))pos++;const v=JSON.parse(text.slice(start,pos));if(typeof v==='number'&&!Number.isFinite(v))throw Error('Nonfinite number');const bytes=Buffer.from(JSON.stringify(v));decoded.push(bytes);decodedBytes+=bytes.length;}
  if(parts.length===2&&parts[0]==='params'&&parts[1]==='arguments')argsRaw=Buffer.from(text.slice(start,pos));
 }
 scan([]);space();if(pos!==text.length)throw Error('Trailing JSON bytes');return {value,argsRaw,decodedBytes,decoded:Buffer.concat(decoded)};
}

/** Private invocation accounting; no method or measurement is an agent capability. */
export function createInvocationBudgets({onViolation}={}){
 const used=Object.fromEntries(Object.keys(LIMITS).map(k=>[k,0])),observed=Object.fromEntries(Object.keys(LIMITS).map(k=>[k,0])),requests=new WeakMap(),actions=new WeakMap(),artifacts=new WeakMap(),listeners=new Set(onViolation?[onViolation]:[]),events=[];
 let revoked=false,violation=false,reason,outstanding=false,reservedResult=0,reservedArtifact=0;
 const record=(kind,extra={})=>events.push(Object.freeze({sequence:events.length,kind,monotonicNs:process.hrtime.bigint().toString(),...extra}));
 function revoke(why){if(revoked)return;revoked=true;reason=why;record('revoked',{reason});for(const fn of listeners)try{fn(why);}catch(e){record('revocation-listener-failed',{name:e?.name??'Error'});}}
 function fail(why){violation=true;revoke(why);throw Error('Invocation budget denied: '+why);}
 function active(){if(revoked)throw Error('Invocation budget revoked');}
 function amount(n){if(!Number.isSafeInteger(n)||n<0)fail('Ambiguous byte accounting');return n;}
 // Synchronous all-or-nothing reservation: no await or callback before counters change.
 function note(delta){for(const [key,n]of Object.entries(delta)){if(!(key in LIMITS)||!Number.isSafeInteger(observed[key]+amount(n)))fail('Ambiguous observed accounting');}for(const [key,n]of Object.entries(delta))observed[key]+=n;record('measured-attempt',{delta:{...delta},observed:{...observed}});}
 function charge(delta){active();note(delta);for(const [key,n]of Object.entries(delta))if(used[key]+n>LIMITS[key])fail('Aggregate '+key+' ceiling');for(const [key,n]of Object.entries(delta))used[key]+=n;record('charged',{delta:{...delta},used:{...used}});}

 function action(lease){const v=actions.get(lease);if(!v||v.closed)fail('Foreign/replayed action reservation');return v;}
 const api={
  revoke,stop(why){violation=true;revoke(why);},invalidate:fail,assertActive:active,onViolation(fn){if(typeof fn!=='function')fail('Invalid trusted listener');listeners.add(fn);if(revoked)fn(reason);},
  inspect(){return Object.freeze({revoked,violation,reason,used:Object.freeze({...used}),observed:Object.freeze({...observed}),reservedResult,reservedArtifact,outstanding,events:events.slice()});},
  admitRequest({turn=false}={}){charge({requests:1,...(turn?{turns:1}:{})});const token=Object.freeze({});requests.set(token,{bytes:0,ended:false});return token;},
  receive(token,n){active();const r=requests.get(token);if(!r||r.ended)fail('Foreign/replayed ingress');amount(n);if(r.bytes+n>PER_REQUEST.ingressBytes){note({ingressBytes:n});fail('Ingress request ceiling');}charge({ingressBytes:n});r.bytes+=n;},
  endRequest(token){active();const r=requests.get(token);if(!r||r.ended)fail('Foreign/replayed ingress completion');r.ended=true;},
  accountArguments(fields){
   if(!fields||Object.keys(fields).sort().join()!=='decoded,raw,serialized')fail('Missing argument measurements');
   const delta={};for(const [name,key]of [['raw','rawArgumentBytes'],['serialized','serializedArgumentBytes'],['decoded','decodedArgumentBytes']]){const bytes=fields[name];if(!Buffer.isBuffer(bytes)||bytes.length>PER_REQUEST.argumentBytes)fail(name+' argument ceiling');delta[key]=bytes.length;}charge(delta);
  },
  beginAction(raw,value){
   charge({actions:1});let parsed,canonical;
   try{if(!Buffer.isBuffer(raw))fail('Missing raw arguments');if(raw.length>PER_REQUEST.argumentBytes){note({rawArgumentBytes:raw.length});fail('Raw argument ceiling');}parsed=parseStrictJson(raw);canonical=serialized(parsed.value);if(!canonical.equals(serialized(value)))fail('Raw/parsed argument mismatch');}catch(error){violation=true;if(!revoked)revoke('Ambiguous argument encoding');throw error;}
   api.accountArguments({raw,serialized:canonical,decoded:parsed.decoded});
   if(outstanding)fail('Concurrent action');if(used.resultBytes+reservedResult+PER_REQUEST.resultBytes>LIMITS.resultBytes)fail('Result reservation ceiling');
   outstanding=true;reservedResult+=PER_REQUEST.resultBytes;const lease=Object.freeze({});actions.set(lease,{closed:false,finished:false,reserved:PER_REQUEST.resultBytes});record('action-reserved');return lease;
  },
  previewResult(lease,bytes){active();const a=action(lease);if(a.finished||!Buffer.isBuffer(bytes)||bytes.length>a.reserved||used.resultBytes+bytes.length>LIMITS.resultBytes)fail('Result byte ceiling');},
  finishAction(lease,bytes){api.previewResult(lease,bytes);const a=action(lease);charge({resultBytes:bytes.length});reservedResult-=a.reserved;a.reserved=0;a.finished=true;record('result-measured',{bytes:bytes.length});},
  closeAction(lease){const a=actions.get(lease);if(!a||a.closed)return;reservedResult-=a.reserved;a.reserved=0;a.closed=true;outstanding=false;},
  reserveArtifact(n){active();amount(n);if(n>PER_REQUEST.artifactBytes||used.artifactBytes+reservedArtifact+n>LIMITS.artifactBytes)fail('Artifact reservation ceiling');reservedArtifact+=n;const token=Object.freeze({});artifacts.set(token,{bound:n,observed:false});record('artifact-reserved',{bytes:n});return token;},
  observeArtifact(token,n){const a=artifacts.get(token);if(!a||a.observed)fail('Foreign/replayed artifact observation');amount(n);a.observed=true;used.artifactBytes+=n;observed.artifactBytes+=n;reservedArtifact-=Math.min(n,a.bound);record('staged-artifact-measured',{bytes:n,afterRevocation:revoked});if(n>a.bound||used.artifactBytes>LIMITS.artifactBytes)fail('Produced artifact ceiling');},
  artifactObserved(token){return artifacts.get(token)?.observed===true;},
  assertArtifact(token){active();const a=artifacts.get(token);if(!a?.observed)fail('Missing staged measurement');},
 };
 return Object.freeze(api);
}

export async function readInvocationBody(req,budgets,handle=budgets.admitRequest()){
 try{
  if(req.headers['content-encoding']&&req.headers['content-encoding']!=='identity')throw Error('Compressed/unsupported encoding');
  if(req.headers['content-type']&&!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(req.headers['content-type']))throw Error('Unsupported JSON representation');
  const chunks=[];for await(const chunk of req){budgets.receive(handle,chunk.length);chunks.push(chunk);}budgets.endRequest(handle);
  const bytes=Buffer.concat(chunks);if(bytes.length===0&&req.method!=='POST')return {bytes,value:null};const parsed=parseStrictJson(bytes);return {...parsed,bytes};
 }catch(error){budgets.invalidate('Invalid/bounded ingress');throw error;}
}

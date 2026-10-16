import {EventEmitter} from 'node:events';
import {PassThrough,Writable} from 'node:stream';

/** Broker-only; neither the channel nor these operations are exposed to Code Mode. */
export function supervisorClient(){
 if(!process.send||!process.connected)throw Error('Private supervisor channel required');
 let invocationId,sequence=0,native;const pending=new Map(),children=new Map();
 const ready=new Promise(resolve=>{process.on('message',m=>{
  if(m.kind==='owner.ready'&&!invocationId){invocationId=m.invocationId;process.channel.unref();resolve();return;}
  if(m.invocationId!==invocationId)return;
  if(m.kind==='reply'){const p=pending.get(m.id);if(!p)return;pending.delete(m.id);if(!pending.size)process.channel.unref();m.error?p.reject(Error(m.error)):p.resolve(m.value);return;}
  const child=children.get(m.jobId??'native');if(!child)return;
  if(m.kind.endsWith('.stdout'))child.stdout.write(Buffer.from(m.data,'base64'));
  if(m.kind.endsWith('.stderr'))child.stderr.write(Buffer.from(m.data,'base64'));
  if(m.kind.endsWith('.exit')){child.exitCode=m.code;child.signalCode=m.signal;child.emit('exit',m.code,m.signal);}
  if(m.kind.endsWith('.close')){child.stdout.end();child.stderr.end();child.emit('close',m.code,m.signal);}
 });});
 process.send({kind:'client.ready'});
 process.once('disconnect',()=>{
  for(const p of pending.values())p.reject(Error('Supervisor channel revoked'));pending.clear();
  for(const c of children.values())if(c.exitCode===null&&c.signalCode===null){c.signalCode='SUPERVISOR_DISCONNECTED';c.emit('exit',null,c.signalCode);}
 });
 async function request(operation,payload){await ready;if(!process.connected)throw Error('Supervisor unavailable');const id=++sequence,frame={kind:'request',invocationId,id,operation,payload};
  if(Buffer.byteLength(JSON.stringify(frame))>65536)throw Error('Private frame limit');
  return new Promise((resolve,reject)=>{pending.set(id,{resolve,reject});process.channel.ref();process.send(frame,error=>{if(error){pending.delete(id);reject(error);}});});
 }
 function proxy(key){const child=new EventEmitter();Object.assign(child,{pid:undefined,exitCode:null,signalCode:null,stdout:new PassThrough(),stderr:new PassThrough()});
  child.stdin=new Writable({write(chunk,encoding,callback){request(key==='native'?'native.input':'docker.input',{...(key==='native'?{}:{jobId:key}),data:chunk.toString('utf8')}).then(()=>callback(),callback);}});
  child.kill=signal=>{const op=key==='native'?request('native.signal',{signal}):request('docker.release',{jobId:key});op.catch(error=>child.emit('error',error));return true;};children.set(key,child);return child;
 }
 return Object.freeze({async launchNative(argv,{cwd,env}){if(native)throw Error('Native launch cannot be reused');native=proxy('native');const r=await request('native.launch',{argv,cwd,env});native.pid=r.pid;return native;},
 observeHost:pid=>request('native.observe-host',{pid}),
 prepareDocker:(args,context)=>request('docker.prepare',{args,context}),
 async startDocker(jobId){if(children.has(jobId))throw Error('Worker start cannot be reused');const c=proxy(jobId),r=await request('docker.start',{jobId});c.pid=r.pid;return c;},
 releaseDocker:jobId=>request('docker.release',{jobId})});
}

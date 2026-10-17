import {createInvocationBudgets,readInvocationBody} from './budgets.mjs';
export {createInvocationBudgets} from './budgets.mjs';
import {randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const identity=pid=>{const value=execFileSync('/bin/ps',['-p',String(pid),'-o','stat=,lstart=,comm='],{encoding:'utf8',timeout:1000}).trim();if(!value||/^[ZX]/.test(value))throw Error('Process not live');return value.replace(/^\S+\s+/,'');};
export function createInvocation({onRevoke=()=>{},budgets=createInvocationBudgets()}={}){
 const id=randomUUID(),tickets=new WeakSet(),controllers=new Set();let state='ACTIVE',child,birth,reason;
 function revoke(why){if(state!=='ACTIVE')return;state='REVOKED';reason=why;for(const c of controllers)c.abort();controllers.clear();if(why==='cli-exit')budgets.revoke(why);else budgets.stop(why);onRevoke(why);if(why!=='cli-exit'&&child?.exitCode===null&&child.signalCode===null)child.kill('SIGTERM');}
 function active(){if(state!=='ACTIVE'||!child)throw Error('Invocation inactive');if(child.exitCode!==null||child.signalCode!==null){revoke('cli-not-live');throw Error('CLI terminated');}try{if(identity(child.pid)!==birth)throw Error('Process identity changed');}catch(error){revoke('process-identity');throw error;}}
 budgets.onViolation(()=>revoke('budget'));
 return Object.freeze({id,budgets,
 async readRequest(req,ticket){this.assert(ticket,req.socket);const handle=budgets.admitRequest({turn:req.url==='/v1/responses'});const value=await readInvocationBody(req,budgets,handle);this.assert(ticket,req.socket);return value;},get state(){return state;},get reason(){return reason;},
 attach(process){if(child||state!=='ACTIVE')throw Error('Invocation cannot be reused');child=process;birth=identity(child.pid);child.once('exit',(code,signal)=>revoke(code===0&&!signal?'cli-exit':'cli-failure'));},
 admit(pid,socket){active();if(pid!==child.pid)throw Error('Wrong peer');const ticket=Object.freeze({id,pid,socket});tickets.add(ticket);return ticket;},
 assert(ticket,socket){active();if(!tickets.has(ticket)||ticket.id!==id||ticket.socket!==socket)throw Error('Session/connection mismatch');},
 controller(ticket,socket){this.assert(ticket,socket);const c=new AbortController();controllers.add(c);return {signal:c.signal,release:()=>controllers.delete(c)};},
 assertActive:active,revoke,close(){revoke('broker-close');state='CLOSED';}
 });
}

const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {build}=require('esbuild');
let code;
async function fixture(active=null){
 code ||= (await build({stdin:{contents:"import './src/content/failed-jobs-cleanup.js';import * as queue from './src/content/helpers.js';window.queue=queue;",resolveDir:process.cwd()},bundle:true,write:false,format:'iife'})).outputFiles[0].text;
 const packets=[],handlers=[],messages=[],timers=new Map(),local={marketData:{recentJobs:[{id:'stale',status:'FAILED'}]}},sync={helperMode:false};let serial=0;
 const window={addEventListener(t,fn){handlers.push(fn)},removeEventListener(t,fn){const i=handlers.indexOf(fn);if(i>=0)handlers.splice(i,1)},postMessage(packet){packets.push(packet)},emit(data){for(const fn of [...handlers])fn({source:window,data})}};
 function area(store){return {get(keys,cb){const data=typeof keys==='string'?{[keys]:store[keys]}:{...store};cb?.(data);return Promise.resolve(data)},set(data){Object.assign(store,data);return Promise.resolve()}}}
 const chrome={runtime:{id:'id',onMessage:{addListener(fn){messages.push(fn)}}},storage:{sync:area(sync),local:area(local)}};
 vm.runInNewContext(code,{window,chrome,console:{log(){}},setTimeout(fn,ms){timers.set(++serial,{fn,ms});return serial},clearTimeout(id){timers.delete(id)}});
 if(active)window.queue.setAutomationActive({type:active,startedAt:Date.now()});
 const flush=()=>new Promise(resolve=>setImmediate(resolve));
 const start=async()=>{messages.forEach(fn=>fn({action:'dismissAllFailedJobs'},{},()=>{}));await flush()};
 const refresh=async(snapshots)=>{for(const [marketKey,data]of Object.entries(snapshots))window.emit({type:'COR3_MARKET_JOBS_SNAPSHOT',marketKey,data});window.emit({type:'COR3_ALL_MARKETS_REFRESHED'});await flush()};
 const advance=async(ms)=>{const t=[...timers].find(([,v])=>v.ms===ms);assert.ok(t,'expected timer '+ms);timers.delete(t[0]);t[1].fn();await flush()};
 return {window,packets,local,sync,start,refresh,advance,flush,sales:()=>packets.filter(p=>p.cmd==='job.dismiss'),refreshes:()=>packets.filter(p=>p.type==='COR3_REFRESH_ALL_MARKETS_SEQ')};
}
const full=(home=[],dark=[])=>({home:{jobs:[],recentJobs:home},dark:{jobs:[],recentJobs:dark},soyuz:{jobs:[],recentJobs:[]},usol:{jobs:[],recentJobs:[]}});
const failed=id=>({id,status:'FAILED'});
test('global cleanup refreshes first, dismisses only fresh FAILED, then verifies actual server removal',async()=>{
 const f=await fixture();await f.start();assert.equal(f.refreshes().length,1);assert.equal(f.sales().length,0,'stale cached FAILED is never used');
 await f.refresh(full([failed('h'),{id:'taken',status:'TAKEN'}],[failed('d')]));assert.equal(f.sales()[0].data.jobId,'h');
 f.window.emit({type:'COR3_JOB_DISMISS_RESULT',data:{jobId:'h'}});await f.flush();await f.advance(500);
 assert.equal(f.sales()[1].data.jobId,'d');f.window.emit({type:'COR3_JOB_DISMISS_RESULT',error:{message:'denied'}});await f.flush();await f.advance(500);
 assert.equal(f.refreshes().length,2);assert.equal(f.local.marketData.recentJobs[0].id,'stale','no optimistic local cache deletion');
 await f.refresh(full([], [failed('d')]));assert.match(f.local.failedJobsCleanupStatus.message,/1 failed job\(s\) dismissed; 1 remaining/);assert.equal(f.local.failedJobsCleanupStatus.busy,false);assert.equal(f.window.queue.getAutomationActive(),null);
});
test('queue waits behind Auto Jobs and duplicate clicks do not issue additional refreshes',async()=>{
 const f=await fixture('auto-jobs');await f.start();await f.start();assert.equal(f.refreshes().length,0);assert.equal(f.window.queue.getAutomationQueue().length,1);
 f.window.queue._automationFinish('auto-jobs');await f.flush();assert.equal(f.refreshes().length,1);
 await f.refresh(full());assert.match(f.local.failedJobsCleanupStatus.message,/No FAILED/);assert.equal(f.sales().length,0);
});
test('unavailable markets never use their old data and Helper mode stops before mutation',async()=>{
 const f=await fixture();await f.start();await f.refresh({home:{jobs:[],recentJobs:[]}});assert.equal(f.sales().length,0);assert.match(f.local.failedJobsCleanupStatus.message,/some markets/);
 const g=await fixture();await g.start();g.sync.helperMode=true;await g.refresh(full([failed('h')]));assert.equal(g.sales().length,0);assert.equal(g.local.failedJobsCleanupStatus.phase,'error');assert.equal(g.window.queue.getAutomationActive(),null);
});
test('unknown dismissal outcome stops further sends and is verified by a new refresh',async()=>{
 const f=await fixture();await f.start();await f.refresh(full([failed('one'),failed('two')]));assert.equal(f.sales().length,1);await f.advance(12000);
 assert.equal(f.sales().length,1);assert.equal(f.refreshes().length,2);await f.refresh(full([failed('two')]));assert.match(f.local.failedJobsCleanupStatus.message,/1 failed job\(s\) dismissed; 1 remaining/);
});
test('refresh timeout aborts without dismissing cached jobs and releases the queue',async()=>{
 const f=await fixture();await f.start();await f.advance(300000);assert.equal(f.sales().length,0);assert.equal(f.local.failedJobsCleanupStatus.phase,'error');assert.equal(f.window.queue.getAutomationActive(),null);
});

const {test} = require('node:test');
const assert = require('node:assert/strict');
const {build,buildSync} = require('esbuild');
const vm = require('node:vm');
function moduleOf(code,globals={}) { const module={exports:{}};vm.runInNewContext(code,{module,exports:module.exports,console,Date,...globals});return module.exports; }
const retry=moduleOf(buildSync({entryPoints:['src/shared/job-retry.js'],bundle:true,write:false,format:'cjs'}).outputFiles[0].text);
test('expired minigame locks become eligible after the buffer; future locks stay excluded',()=>{
 const now=Date.now();
 assert.equal(retry.excludeJobResult({status:'skipped',lockExpiresAt:new Date(now-60000).toISOString()},now),false);
 assert.equal(retry.excludeJobResult({status:'skipped',lockExpiresAt:new Date(now+13*60000).toISOString()},now),true);
 assert.equal(retry.excludeJobResult({status:'skipped',lockExpiresAt:new Date(now-1000).toISOString()},now),true);
 for (const status of ['failed','bugged']) assert.equal(retry.excludeJobResult({status},now),true);
 assert.equal(retry.excludeJobResult({status:'skipped',lockExpiresAt:'invalid'},now),true);
});
test('background schedules expired locks promptly instead of waiting six hours for market reset',async()=>{
 const code=(await build({entryPoints:['src/background/auto-finish-jobs.js'],bundle:true,write:false,format:'cjs',plugins:[{name:'helpers',setup(b){b.onResolve({filter:/^\.\/helpers\.js$/},()=>({path:'helpers',namespace:'mock'}));b.onLoad({filter:/.*/,namespace:'mock'},()=>({contents:'export async function getCor3Tab(){return null};export function bgAutoJobLog(){}'}));}}]})).outputFiles[0].text;
 const now=Date.now();
 for(const delta of [-60000,13*60000]) {
  const local={marketData:{nextJobsResetAt:new Date(now+6*3600000).toISOString(),jobs:[{id:'j',name:'File Decryption'}]},autoJobsCompletedResults:[{jobId:'j',status:'skipped',lockExpiresAt:new Date(now+delta).toISOString()}]};
  const alarms=[];
  const api=moduleOf(code,{chrome:{storage:{sync:{async get(){return {autoFinishAllJobsEnabled:true}}},local:{async get(){return local}}},alarms:{async create(name,data){alarms.push(data)},async clear(){}}},setTimeout,clearTimeout});
  await api.scheduleAutoFinishAllBg();
  const minutes=alarms.at(-1).delayInMinutes;
  assert.ok(delta<0 ? minutes<1 : minutes>13&&minutes<14);
  assert.equal(api.collectJobsBg(local.marketData,null,local.autoJobsCompletedResults,{}).length,delta<0?1:0);
 }
});
test('decrypt/ICE respect their extended deadlines and still finish early when the game closes',async()=>{
 const code=buildSync({entryPoints:['src/shared/hack-utils.js'],bundle:true,write:false,format:'cjs'}).outputFiles[0].text;
 for(const [type,expected] of [['decrypt',90000],['ice',150000],['simple',60000]]) {
  let clock=0,serial=0,open=true;const timers=new Map(),logs=[];
  class Clock extends Date { static now(){return clock;} }
  function advance(to) { let next;while((next=[...timers].filter(([,t])=>t.at<=to).sort((a,b)=>a[1].at-b[1].at)[0])) {timers.delete(next[0]);clock=next[1].at;next[1].fn();}clock=to; }
  const document={querySelector(selector){if(!open)return null;return type==='decrypt'?selector.includes('ConfigHackApplication')?{}:null:type==='ice'?selector.includes('WallBoard')?{}:null:selector.includes('SimpleDecryptApplication')?{}:null}};
  const api=moduleOf(code,{Date:Clock,window:{addEventListener(){},removeEventListener(){}},document,setTimeout(fn,ms){timers.set(++serial,{fn,at:clock+Math.max(ms,1)});return serial},clearTimeout(id){timers.delete(id)}});
  const run=api.createWaitForHackToBeDone(msg=>logs.push(msg),()=>false);let done=false;
  run().then(()=>{done=true});await new Promise(r=>setImmediate(r));
  advance(expected-1000);await new Promise(r=>setImmediate(r));assert.equal(done,false);assert.equal(logs.some(msg=>msg.includes('did not complete')),false);
  advance(expected+10);await new Promise(r=>setImmediate(r));assert.ok(logs.some(msg=>msg.includes('did not complete in '+expected/1000+'s')));
  open=false;advance(clock+1000);await new Promise(r=>setImmediate(r));assert.equal(done,true);
  logs.length=0;open=true;done=false;run().then(()=>{done=true});await new Promise(r=>setImmediate(r));open=false;advance(clock+1000);await new Promise(r=>setImmediate(r));assert.equal(done,true,'early completion does not wait out the whole limit');
 }
});

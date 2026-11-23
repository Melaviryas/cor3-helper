const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),path=require('node:path');
const esbuild=require('esbuild');const flush=()=>new Promise(resolve=>setImmediate(resolve));
const event=()=>{const f=[];return{addListener(fn){f.push(fn)},emit(...args){for(const fn of [...f])fn(...args)}}};
async function setup(patch={}){
 const code=(await esbuild.build({stdin:{contents:"import './src/content/expedition-module.js';import * as queue from './src/content/helpers.js';window.queue=queue",resolveDir:path.resolve(__dirname,'..')},bundle:true,write:false,format:'iife'})).outputFiles[0].text;
 const sync={expeditionModuleEnabled:true,expeditionSaleMode:'off',periodicMercDispatchEnabled:true,autoClaimExpeditionMail:false,
  autoSendMerc:{enabled:true,autoChooseMerc:true,maxMercCost:3000,applyMercCostLimiter:true},autoJobSolverEnabled:true,autoJobLoadoutMode:'software',...patch};
 const local={},changes=event(),runtime=event(),listeners=[],sent=[],timers=new Map();let id=0,holdLaunch=false,pendingLaunch=null;
 const win={addEventListener(type,fn){listeners.push(fn)},removeEventListener(type,fn){const at=listeners.indexOf(fn);if(at>=0)listeners.splice(at,1)},
  emit(data){for(const fn of [...listeners])fn({source:win,data})},postMessage(data){sent.push(data);queueMicrotask(()=>{
   win.emit(data);
   if(data.type==='COR3_EXPEDITION_MODULE_CONFIG')win.emit({type:'COR3_EXPEDITION_MODULE_READY',requestId:data.requestId});
   if(data.type==='COR3_EXPEDITION_RPC'){
    const reply=value=>win.emit({type:'COR3_EXPEDITION_RPC_RESULT',requestId:data.requestId,data:value});
    const config={locations:[{id:'loc',zones:[{id:'zone',goals:[{id:'goal'}]}]}]};
    if(data.action==='get.active')reply([]);
    else if(data.room==='stash')reply({items:[],maxCapacity:360,currentUsage:0});
    else if(data.action==='get.archived')reply({items:[]});
    else if(data.action==='merc.refresh')reply({mercenaries:{mercenaries:data.data.market==='core'?[{id:'zero',callsign:'Zero',status:'AVAILABLE'}]:[]},config,prices:{zero:{totalCost:1995}}});
    else if(data.action==='launch.confirmed'){if(holdLaunch)pendingLaunch=()=>reply({id:'new',status:'RUNNING',mercenary:{id:'zero'}});else reply({id:'new',status:'RUNNING',mercenary:{id:'zero'}});}
    else if(data.room==='specialists')reply({specialists:[]});
    else throw new Error('Unexpected '+data.action);
   }
  })}};
 const area=(store,name)=>({get(keys,cb){const result=Object.fromEntries((typeof keys==='string'?[keys]:keys).map(key=>[key,store[key]]));cb?.(result);return Promise.resolve(result)},set(values,cb){const diff={};for(const [key,value]of Object.entries(values)){if(JSON.stringify(store[key])!==JSON.stringify(value))diff[key]={oldValue:store[key],newValue:value};store[key]=value}if(Object.keys(diff).length)changes.emit(diff,name);cb?.();return Promise.resolve()},remove(){return Promise.resolve()}});
 const chrome={runtime:{id:'id',onMessage:runtime,async sendMessage(){}},storage:{sync:area(sync,'sync'),local:area(local,'local'),onChanged:changes}};
 vm.runInNewContext(code,{window:win,chrome,console:{log(){},warn(){},error:console.error},Date,queueMicrotask,setTimeout(fn,ms){timers.set(++id,{fn,ms});return id},clearTimeout(id){timers.delete(id)},setInterval(){return 1}});
 const settle=async()=>{for(let i=0;i<6;i++)await flush()};
 const runZero=()=>{for(const [key,timer]of [...timers])if(timer.ms===0){timers.delete(key);timer.fn()}};
 await settle();
 return{win,sync,local,sent,chrome,runtime,settle,runZero,hold(){holdLaunch=true},release(){assert.ok(pendingLaunch);pendingLaunch()},
  ready(){win.emit({type:'COR3_INITIAL_FETCH_DONE'})},call(action){return new Promise(resolve=>runtime.emit({action},{},resolve))}};
}
test('one shared queue serializes jobs and expedition; both dispatch triggers merge and retain ownership until server launch confirmation',async()=>{
 const f=await setup();f.win.queue.setAutomationActive({type:'auto-jobs',startedAt:Date.now()});f.hold();f.ready();
 await f.settle();await f.call('periodicMercDispatch');
 assert.equal(f.win.queue.getAutomationQueue().length,1);
 assert.equal(f.sent.filter(packet=>packet.type==='COR3_EXPEDITION_RPC').length,0,'no reads or endpoint changes while AutoJobs owns queue');
 f.win.queue._automationFinish('auto-jobs');await f.settle();
 assert.equal(f.win.queue.getAutomationActive().type,'expedition-workflow');
 assert.equal(f.sent.filter(packet=>packet.type==='COR3_EXPEDITION_RPC'&&packet.action==='launch.confirmed').length,1);
 await f.call('periodicMercDispatch');await f.call('expeditionCheckNow');assert.equal(f.win.queue.getAutomationQueue().length,0,'duplicate running triggers do not strand a queued flag');
 f.release();await f.settle();assert.equal(f.win.queue.getAutomationActive(),null);
 assert.equal(f.sync.autoJobSolverEnabled,true);assert.equal(f.sync.autoJobLoadoutMode,'software');
});
test('master switch cancels a queued expedition without changing job queue ownership or sub-settings',async()=>{
 const f=await setup();f.win.queue.setAutomationActive({type:'auto-jobs',startedAt:Date.now()});f.ready();await f.settle();
 assert.equal(f.win.queue.getAutomationQueue().length,1);
 await f.chrome.storage.sync.set({expeditionModuleEnabled:false});await f.settle();
 assert.equal(f.win.queue.getAutomationQueue().length,0);assert.equal(f.win.queue.getAutomationActive().type,'auto-jobs');
 assert.equal(f.sync.autoSendMerc.enabled,true);assert.equal(f.sync.periodicMercDispatchEnabled,true);assert.equal(f.sync.autoSendMerc.maxMercCost,3000);
 f.win.queue._automationFinish('auto-jobs');await f.settle();assert.equal(f.sent.some(packet=>packet.type==='COR3_EXPEDITION_RPC'),false);
});
test('new installs default off, preserve job settings, and do not awaken retired automations during initial fetch',async()=>{
 const f=await setup({expeditionModuleEnabled:undefined,expeditionSaleMode:undefined});f.ready();await f.settle();
 assert.equal(f.sync.expeditionModuleEnabled,false);assert.equal(f.sync.expeditionSaleMode,'off');assert.equal(f.sync.autoJobSolverEnabled,true);
 assert.equal(f.sent.some(packet=>packet.type==='COR3_EXPEDITION_RPC'),false);assert.equal((await f.call('expeditionCheckNow')).success,false);
});

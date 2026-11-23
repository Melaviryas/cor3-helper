const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {buildSync}=require('esbuild');
function run(entry,globals={}){const module={exports:{}};vm.runInNewContext(buildSync({entryPoints:[entry],bundle:true,write:false,format:'cjs'}).outputFiles[0].text,{module,exports:module.exports,console,setTimeout,clearTimeout,...globals});return module.exports;}
test('retired expedition settings cannot launch or choose decisions, even if old settings were enabled',()=>{
 const packets=[];const window={postMessage(p){packets.push(p)},addEventListener(){}};
 const chrome={storage:{sync:{get(){throw new Error('retired automation read settings')}}}};
 run('src/content/auto-send.js',{window,chrome}).checkAutoSendOnExpeditionData([]);
 run('src/content/auto-choose.js',{window,chrome}).checkAutoChooseFromContent([{id:'decision'}]);
 assert.equal(packets.length,0);
});
test('retired alarms never start an interval or create audio',()=>{
 const window={};let intervals=0;
 const chrome={storage:{sync:{get(k,fn){fn({alarms:[{enabled:true}]})}}}};
 const api=run('src/content/alarms.js',{window,chrome,setInterval(){intervals++}});
 api.playAlarm(100);api.startContinuousAlarm(100);assert.equal(intervals,0);assert.equal(api.alarms.length,0);
});
test('retirement disables old automations without changing job or loadout preferences',()=>{
 const saved=[];
 const chrome={storage:{sync:{get(keys,fn){fn({autoSendMerc:{enabled:true,maxMercCost:3000},decisionModifiers:{enabled:true,autoChoose:true}})},set(data){saved.push(data)}}}};
 run('src/content/retire-features.js',{chrome});assert.equal(saved.length,1);
 assert.equal(saved[0].autoSendMerc.enabled,false);assert.equal(saved[0].autoSendMerc.maxMercCost,3000);assert.equal(saved[0].selectiveLootSellEnabled,false);assert.equal(saved[0].periodicMercDispatchEnabled,false);
 assert.equal('autoJobSolverEnabled' in saved[0],false);assert.equal('loadoutData' in saved[0],false);
});
test('initial load requests Markets and Loadout without retired stash/mercenary requests',()=>{
 const calls=[],packets=[];const window={postMessage(p){packets.push(p)}};
 for(const name of ['Market','DarkMarket','SoyuzMarket','UsolMarket'])window['__cor3Request'+name]=fn=>{calls.push(name);fn()};
 window.__cor3RequestLoadout=()=>calls.push('Loadout');window.__cor3RequestUpdater=()=>calls.push('Updater');
 run('src/content-early/initial-fetch.js',{window,setTimeout(fn){fn()}});window.__cor3InitialFetch();
 assert.deepEqual(calls,['Market','DarkMarket','SoyuzMarket','UsolMarket','Loadout','Updater']);assert.equal(window.__cor3InitialFetchInProgress,false);assert.ok(packets.some(p=>p.type==='COR3_INITIAL_FETCH_DONE'));
});

const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {build}=require('esbuild');let bundle;
const clone=x=>JSON.parse(JSON.stringify(x));
function hw(f=25){return {cpu:{id:'cpu'+f,category:'CPU',name:'CPU'+f,specs:{cpuFrequency:f,cpuCores:4,cpuConsuming:30}},gpu:{id:'gpu',category:'GPU',name:'GPU',specs:{gpuPower:20,gpuMemory:16,gpuConsuming:40}},ram:{id:'ram',category:'RAM',name:'RAM',specs:{ramFrequency:20,ramMemory:16}},psu:{id:'psu',category:'PSU',name:'PSU',specs:{psuPower:100}}};}
function data(){const h=hw();return {equippedHardware:h,equippedSoftware:[{id:'0J'}],ownedHardware:Object.values(h),ownedSoftware:[{id:'0J',name:'0J',consuming:{cpu_frequency:[20,50]},specs:[{type:'DECRYPT',power:[14,46],fileTypes:['.eb54x']},{type:'HACK',power:[14,46],serverTypes:['TEST']}]},{id:'09',name:'09',consuming:{cpu_frequency:[5,30]},specs:[{type:'DECRYPT',power:[14,38],fileTypes:['.eb54x']},{type:'HACK',power:[14,38],serverTypes:['TEST']}]}]};}
async function fixture(mode='auto'){
 bundle ||= (await build({entryPoints:['src/auto-job-solver/loadout.js'],bundle:true,write:false,format:'cjs',plugins:[{name:'state',setup(b){b.onResolve({filter:/^\.\/state\.js$/},()=>({path:'state',namespace:'mock'}));b.onLoad({filter:/.*/,namespace:'mock'},()=>({contents:`export const state=window.test.state;export const sendCmd=(cmd,data)=>window.test.send(cmd,data);export const delay=ms=>window.test.delay(ms);export const waitForEvent=(type,ms)=>window.test.wait(type,ms);export const log=(msg,level)=>window.test.logs.push({msg,level});`}));}}]})).outputFiles[0].text;
 let clock=100000,serial=0;const listeners=[],timers=new Map(),sent=[],logs=[],state={abortFlag:false,solverSettings:{loadoutMode:mode},_lastLoadoutFetchAt:0,LOADOUT_COOLDOWN_MS:2000};
 const s={state,logs,loadout:data(),onSend:null,hasAccess:false,canDecrypt:true};
 const window={test:s,__cor3ServerTypeMap:{srv:{serverTypeName:'TEST'}},addEventListener(t,fn){listeners.push(fn)},removeEventListener(t,fn){const i=listeners.indexOf(fn);if(i>=0)listeners.splice(i,1)},emit(packet){for(const fn of [...listeners])fn({source:window,data:packet})}};
 s.delay=async ms=>{clock+=ms};
 s.wait=type=>new Promise(resolve=>{function listener(e){if(e.data.type===type){window.removeEventListener('message',listener);resolve(e.data)}}window.addEventListener('message',listener)});
 s.send=(cmd,payload)=>{
  sent.push({cmd,data:payload});if(s.onSend?.(cmd,payload)===false)return;
  const action={'loadout.get':'get.options','loadout.equip.hardware':'equip.hardware','loadout.equip.software':'equip.software','loadout.unequip.software':'unequip.software'}[cmd];
  if(cmd==='get.login.status'){window.emit({type:'COR3_AUTOJOB_SAI_LOGIN_STATUS',data:{activeAccesses:s.hasAccess?[{id:'access'}]:[]}});return}
  if(cmd==='get.file.analysis'){window.emit({type:'COR3_AUTOJOB_FILE_ANALYSIS',data:{canDecrypt:s.canDecrypt,requiredPower:s.requiredPower}});return}
  if(cmd==='loadout.unequip.software')s.loadout.equippedSoftware=s.loadout.equippedSoftware.filter(sw=>sw.id!==payload.moduleConfigId);
  if(cmd==='loadout.equip.software')s.loadout.equippedSoftware.push(s.loadout.ownedSoftware.find(sw=>sw.id===payload.moduleConfigId));
  if(cmd==='loadout.equip.hardware'){const part=s.loadout.ownedHardware.find(h=>h.id===payload.moduleConfigId);s.loadout.equippedHardware[part.category.toLowerCase()]=part}
  if(action)window.emit({type:'COR3_AUTOJOB_LOADOUT',action,data:clone(s.loadout),error:null});
 };
 class Clock extends Date{static now(){return clock}}
 function later(fn,ms){'use strict';if(this&&this.setTimeout!==later)throw new TypeError('Illegal invocation');timers.set(++serial,{fn,at:clock+Math.max(ms,1)});return serial}
 function cancel(id){'use strict';if(this&&this.clearTimeout!==cancel)throw new TypeError('Illegal invocation');timers.delete(id)}
 const module={exports:{}};vm.runInNewContext(bundle,{module,exports:module.exports,window,Date:Clock,console,setTimeout:later,clearTimeout:cancel});
 const advance=async ms=>{const to=clock+ms;let next;while((next=[...timers].filter(([,v])=>v.at<=to).sort((a,b)=>a[1].at-b[1].at)[0])){timers.delete(next[0]);clock=next[1].at;next[1].fn()}clock=to;await new Promise(r=>setImmediate(r))};
 return {api:module.exports,s,state,window,sent,logs,advance};
}
test('normal decryption equips actual-Power winner 09 and freshly verifies the installed state',async()=>{
 const f=await fixture();await f.api.ensureDecryptOnlyLoadout({conditions:[{details:{fileExtension:'EB54X'}}]});
 assert.equal(f.s.loadout.equippedSoftware[0].id,'09');assert.equal(f.sent.filter(x=>x.cmd==='loadout.get').length,2);
 assert.deepEqual(f.sent.filter(x=>x.cmd.includes('software')).map(x=>x.cmd),['loadout.unequip.software','loadout.equip.software']);
 assert.equal(f.sent.some(x=>x.cmd==='loadout.equip.hardware'),false);
});
test('a hardware upgrade changes the winner to 0J=46 and a later retry uses the same selector',async()=>{
 const f=await fixture();await f.api.ensureDecryptOnlyLoadout({fileType:'.eb54x'});
 assert.equal(await f.api.tryLoadoutSwapForError('insufficient_power',{fileType:'.eb54x'},{required:40}),false);
 const cpu=hw(50).cpu;f.s.loadout.ownedHardware.push(cpu);
 assert.equal(await f.api.tryLoadoutSwapForError('insufficient_power',{fileType:'.eb54x'},{required:40}),true);
 assert.equal(f.s.loadout.equippedSoftware[0].id,'0J');assert.equal(f.s.loadout.equippedHardware.cpu.id,cpu.id);
 assert.equal(await f.api.tryLoadoutSwapForError('insufficient_power',{fileType:'.eb54x'},{required:40}),false,'same best configuration does not cause repeated swaps');
});
test('software-only mode never changes hardware during initial selection or insufficient-power retry',async()=>{
 const f=await fixture('software');f.s.loadout.ownedHardware.push(hw(50).cpu);
 await f.api.ensureDecryptOnlyLoadout({fileType:'.eb54x'});assert.equal(f.s.loadout.equippedSoftware[0].id,'09');
 assert.equal(await f.api.tryLoadoutSwapForError('insufficient_power',{fileType:'.eb54x'},{required:40}),false);
 assert.equal(f.sent.some(x=>x.cmd==='loadout.equip.hardware'),false);assert.equal(f.s.loadout.equippedHardware.cpu.id,'cpu25');
});
test('owned tools purchased after a previous task are evaluated instead of reusing cached rankings',async()=>{
 const f=await fixture();await f.api.ensureDecryptOnlyLoadout({fileType:'.eb54x'});
 f.s.loadout.ownedSoftware.push({id:'new',name:'new',consuming:{cpu_frequency:[1,25]},specs:[{type:'DECRYPT',power:[20,35],fileTypes:['.eb54x']}]});
 await f.api.ensureDecryptOnlyLoadout({fileType:'.eb54x'});assert.equal(f.s.loadout.equippedSoftware[0].id,'new');
});
test('HACK uses the matching actual-Power optimizer but existing access leaves equipment alone',async()=>{
 const f=await fixture();await f.api.ensureLoadoutForJob({serverId:'srv'});assert.equal(f.s.loadout.equippedSoftware[0].id,'09');
 const g=await fixture();g.s.hasAccess=true;await g.api.ensureLoadoutForJob({serverId:'srv'});assert.equal(g.sent.some(x=>x.cmd.startsWith('loadout.')),false);
});
test('server rejection or a mismatching equipment reply stops further changes',async()=>{
 for(const mismatch of [false,true]){
  const f=await fixture();f.s.onSend=(cmd)=>{if(cmd!=='loadout.equip.software')return;f.window.emit(mismatch?{type:'COR3_AUTOJOB_LOADOUT',action:'equip.software',data:clone(f.s.loadout)}:{type:'COR3_WS_LOADOUT_ERROR',action:'equip.software',error:{message:'denied'}});return false};
  await assert.rejects(f.api.ensureDecryptOnlyLoadout({fileType:'.eb54x'}),mismatch?/did not confirm/:/denied/);
  assert.equal(f.sent.filter(x=>x.cmd==='loadout.equip.software').length,1);
 }
});
test('a missing reply times out without reporting an equipped configuration',async()=>{
 const f=await fixture();f.s.onSend=()=>false;
 const pending=f.api.ensureDecryptOnlyLoadout({fileType:'.eb54x'});const check=assert.rejects(pending,/timed out/);
 await new Promise(r=>setImmediate(r));await f.advance(11000);await check;
 assert.equal(f.sent.some(x=>x.cmd==='loadout.equip.software'),false);
});
test('mode changes and Stop cancel pending operations without additional writes',async()=>{
 const f=await fixture();f.s.onSend=cmd=>cmd==='loadout.get'?false:undefined;
 const pending=f.api.ensureDecryptOnlyLoadout({fileType:'.eb54x'});const check=assert.rejects(pending,/Aborted/);
 await new Promise(r=>setImmediate(r));f.state.abortFlag=true;await f.advance(500);await check;assert.equal(f.sent.some(x=>x.cmd==='loadout.equip.hardware'),false);
 const g=await fixture();g.s.loadout.ownedHardware.push(hw(50).cpu);g.s.onSend=cmd=>{if(cmd==='loadout.unequip.software')g.state.solverSettings.loadoutMode='software'};
 await assert.rejects(g.api.ensureDecryptOnlyLoadout({fileType:'.eb54x'}),/mode changed/);assert.equal(g.sent.some(x=>x.cmd==='loadout.equip.hardware'),false);
});
test('file types resolve from array/object conditions and names; server file analysis is authoritative',async()=>{
 const f=await fixture();assert.equal(f.api.decryptFileType({conditions:{items:[{details:{fileExtension:'EB54X'}}]}}),'.eb54x');assert.equal(f.api.decryptFileType({fileInfo:{name:'test.EB54X'}}),'.eb54x');
 f.s.canDecrypt=false;f.s.requiredPower=40;const job={};assert.equal(await f.api.checkDecryptPowerViaAnalysis('file',job),false);assert.equal(job._decryptRequiredPower,40);
});

test('hardware swaps unload software and upgrade the PSU before a higher-draw CPU',async()=>{
 const f=await fixture();const cpu=hw(50).cpu;cpu.specs.cpuConsuming=100;const psu={id:'big-psu',name:'Big PSU',category:'PSU',specs:{psuPower:200}};
 f.s.loadout.ownedHardware.push(cpu,psu);f.s.onSend=(cmd,payload)=>{
  if(cmd!=='loadout.equip.hardware')return;
  assert.equal(f.s.loadout.equippedSoftware.length,0);
  const part=f.s.loadout.ownedHardware.find(hw=>hw.id===payload.moduleConfigId), next={...f.s.loadout.equippedHardware,[part.category.toLowerCase()]:part};
  assert.ok(next.cpu.specs.cpuConsuming+next.gpu.specs.gpuConsuming<=next.psu.specs.psuPower);
 };
 await f.api.ensureDecryptOnlyLoadout({fileType:'.eb54x'});
 assert.deepEqual(f.sent.filter(x=>x.cmd==='loadout.equip.hardware').map(x=>x.data.moduleConfigId),['big-psu','cpu50']);
 assert.equal(f.s.loadout.equippedSoftware[0].id,'0J');
});

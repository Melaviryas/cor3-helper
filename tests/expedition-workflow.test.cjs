const {test}=require('node:test'), assert=require('node:assert/strict'), vm=require('node:vm');
const {buildSync}=require('esbuild');
const moduleOf=entry=>{const module={exports:{}};vm.runInNewContext(buildSync({entryPoints:[entry],bundle:true,write:false,format:'cjs'}).outputFiles[0].text,{module,exports:module.exports,console,Date,setTimeout,clearTimeout});return module.exports;};
const {ExpeditionWorkflow,decisionChoice}=moduleOf('src/shared/expedition-workflow.js');
const policy=moduleOf('src/shared/expedition-sale-policy.js');
const catalogue=require('../src/shared/expedition-loot-catalogue.json');
const normal=catalogue.items.filter(item=>item.canSell&&!item.droneMaterial), drone=catalogue.items.filter(item=>item.canSell&&item.droneMaterial);
function loot(id,config=normal[0],price=100,quantity=1){return{id,itemConfigId:config.id,name:config.name,canSell:true,sellPrice:price,quantity};}
function fixture(patch={}){
 const calls=[],saved={},logs=[];let exps=[],items=[],messages=[];
 const settings={expeditionModuleEnabled:true,expeditionSaleMode:'off',autoClaimExpeditionMail:false,periodicMercDispatchEnabled:true,
  autoSendMerc:{enabled:true,autoChooseMerc:true,applyMercCostLimiter:true,maxMercCost:3000},...patch};
 const config={locations:[{id:'loc',name:'Skylift Remains',zones:[{id:'zone',goals:[{id:'goal'}]}]}]};
 const snapshot=()=>({items:structuredClone(items),maxCapacity:20,currentUsage:items.length});
 let override=null;
 const rpc=async(room,action,data,options)=>{
  calls.push({room,action,data,options});const custom=await override?.(room,action,data,options);if(custom?.handled)return custom.data;
  if(action==='get.active')return structuredClone(exps);
  if(room==='stash'&&action==='get.state')return snapshot();
  if(action==='get.archived')return{items:[]};
  if(room==='specialists'&&action==='get.state')return{specialists:[]};
  if(action==='open.container'){exps[0].containerOpenedAt='now';return structuredClone(exps[0]);}
  if(['collect.all','dismiss'].includes(action)){exps=[];return{id:'old'};}
  if(room==='mail'&&action==='get.state')return{messages:structuredClone(messages)};
  if(action==='claim.all'){
   const mail=messages.find(mail=>mail.id===data.messageId),results=mail.attachments.filter(item=>item.claimedAt===null).map(item=>({attachmentId:item.id,status:'claimed'}));
   for(const item of mail.attachments)item.claimedAt='now';return{results};
  }
  if(action==='sell.item'){const at=items.findIndex(item=>item.id===data.itemId);items.splice(at,1);return snapshot();}
  if(action==='merc.refresh')return{mercenaries:{mercenaries:data.market==='core'?[{id:'zero',callsign:'Zero',status:'AVAILABLE'}]:[]},config,
   prices:data.market==='core'?{zero:{totalCost:1995,riskScore:5}}:{}};
  if(action==='launch.confirmed'){exps=[{id:'new',status:'RUNNING',mercenary:{id:data.mercenaryId,callsign:'Zero'}}];return structuredClone(exps[0]);}
  if(action==='respond.event')return[];
  throw new Error('Unexpected '+room+':'+action);
 };
 const workflow=new ExpeditionWorkflow({rpc,settings:async()=>settings,store:async values=>Object.assign(saved,values),status:status=>saved.status=status,
  log:(message,level)=>logs.push({message,level}),pause:async()=>{}});
 return{workflow,settings,calls,saved,logs,setExps:value=>exps=value,setItems:value=>items=value,setMail:value=>messages=value,
  setOverride:value=>override=value,snapshot,get items(){return items}};
}
test('sale modes include sellable drone materials only in all mode; gear, unknown, locked, pinned and unsellable stay untouched',()=>{
 const n=loot('normal'),d=loot('drone',drone[0]);
 for(const mode of ['full','non-drone']){assert.equal(policy.canSellExpeditionItem(n,mode),true);assert.equal(policy.canSellExpeditionItem(d,mode),false);}
 assert.equal(policy.canSellExpeditionItem(d,'all'),true);assert.equal(policy.canSellExpeditionItem(n,'off'),false);
 for(const patch of [{itemConfigId:'equipment'},{canSell:false},{locked:true},{isLocked:true},{pinned:true},{isPinned:true},{quantity:0},{quantity:-1},{location:'equipped'}])
  assert.equal(policy.canSellExpeditionItem({...n,...patch},'all'),false);
});
test('completion, mail, sales, fresh merc selection and confirmed launch occur in order with both dispatch toggles on',async()=>{
 const f=fixture({expeditionSaleMode:'non-drone',autoClaimExpeditionMail:true});
 f.setExps([{id:'old',status:'COMPLETED',containerData:[]}]);f.setItems([loot('normal'),loot('drone',drone[0])]);
 f.setMail([{id:'mail',title:'EXPEDITION LOOT',attachments:[{id:'attachment',claimedAt:null}]}]);
 assert.equal(await f.workflow.run({dispatch:true}),true);
 const index=action=>f.calls.findIndex(call=>call.action===action);
 assert.ok(index('open.container')<index('collect.all'));assert.ok(index('collect.all')<index('claim.all'));
 assert.ok(index('claim.all')<index('sell.item'));assert.ok(index('sell.item')<index('merc.refresh'));assert.ok(index('merc.refresh')<index('launch.confirmed'));
 assert.equal(f.calls.filter(call=>call.action==='launch.confirmed').length,1);
 assert.deepEqual(f.items.map(item=>item.id),['drone']);assert.equal(f.saved.expeditionsData[0].id,'new');
});
test('all mode sells every quantity of drone and non-drone loot, while unrelated items remain',async()=>{
 const f=fixture({expeditionSaleMode:'all',periodicMercDispatchEnabled:false,autoSendMerc:{enabled:false}});
 f.setItems([loot('normal'),loot('material',drone[0],500,8),{...loot('gear'),itemConfigId:'unknown-gear'}]);
 assert.equal(await f.workflow.run(),true);assert.deepEqual(f.calls.filter(call=>call.action==='sell.item').map(call=>call.data.quantity),[1,8]);
 assert.deepEqual(f.items.map(item=>item.id),['gear']);assert.equal(f.saved.expeditionSaleStatus.soldUnits,9);
});
test('failed expeditions with pending insurance are not dismissed, and visible loot is collected instead of discarded',async()=>{
 const insured=fixture();insured.setExps([{id:'old',status:'COMPLETED',outcome:'FAILURE',hasInsurance:true}]);
 assert.equal(await insured.workflow.run({dispatch:true}),false);assert.equal(insured.calls.some(call=>call.action==='dismiss'),false);
 const lootCase=fixture();lootCase.setExps([{id:'old',status:'COMPLETED',outcome:'FAILURE',containerOpenedAt:'now',containerData:[loot('reward')]}]);
 assert.equal(await lootCase.workflow.run({dispatch:true}),true);assert.equal(lootCase.calls.some(call=>call.action==='dismiss'),false);
 assert.equal(lootCase.calls.some(call=>call.action==='collect.all'),true);
});
test('full-stash mode sells cheapest whole stack, stops as soon as sufficient slots exist, keeps drone materials',async()=>{
 const f=fixture({expeditionSaleMode:'full'});f.setItems([loot('expensive',normal[0],1000),loot('cheap',normal[1],10,3),loot('drone',drone[0],1)]);
 f.setOverride((room,action)=>room==='stash'&&action==='get.state'?{handled:true,data:{items:structuredClone(f.items),maxCapacity:3,currentUsage:f.items.length}}:undefined);
 await f.workflow.sell();assert.deepEqual(f.calls.filter(call=>call.action==='sell.item').map(call=>call.data.itemId),['cheap']);
 assert.deepEqual(f.items.map(item=>item.id),['expensive','drone']);
});
test('full-stash mode never sells when there is already enough room or only protected materials remain',async()=>{
 const f=fixture({expeditionSaleMode:'full'});f.setItems([loot('normal')]);await f.workflow.sell();assert.equal(f.calls.some(call=>call.action==='sell.item'),false);
 f.setItems([loot('drone',drone[0])]);f.setOverride((room,action)=>room==='stash'&&action==='get.state'?{handled:true,data:{items:f.items,maxCapacity:1,currentUsage:1}}:undefined);
 await assert.rejects(f.workflow.sell(),/无人机/);assert.equal(f.calls.some(call=>call.action==='sell.item'),false);
});
test('module off never reads game state, sells, claims, makes decisions or dispatches; settings remain saved',async()=>{
 const f=fixture({expeditionModuleEnabled:false,expeditionSaleMode:'all',autoClaimExpeditionMail:true});
 assert.equal(await f.workflow.run({dispatch:true}),false);assert.equal(f.calls.length,0);assert.equal(f.settings.expeditionSaleMode,'all');
});
test('read-only refresh does not trigger saved automation or consume rewards',async()=>{
 const f=fixture({expeditionSaleMode:'all',autoClaimExpeditionMail:true});f.setItems([loot('drone',drone[0])]);
 assert.equal(await f.workflow.run({readOnly:true,mercs:true}),true);
 assert.equal(f.calls.some(call=>['launch.confirmed','claim.all','sell.item','collect.all','respond.event'].includes(call.action)),false);
 assert.equal(f.calls.filter(call=>call.action==='merc.refresh').length,2);
});
test('manual dispatch button obeys disabled sub-switches',async()=>{
 const f=fixture({periodicMercDispatchEnabled:false,autoSendMerc:{enabled:false}});
 assert.equal(await f.workflow.run({dispatch:true}),true);assert.equal(f.calls.some(call=>call.action==='launch.confirmed'),false);
});
test('an active expedition is never followed by another launch',async()=>{
 const f=fixture();f.setExps([{id:'active',status:'RUNNING'}]);assert.equal(await f.workflow.run({dispatch:true}),true);
 assert.equal(f.calls.some(call=>call.action==='launch.confirmed'),false);
});
test('late manual launch detected during fresh pre-launch check blocks automated launch',async()=>{
 const f=fixture();let reads=0;f.setOverride((room,action)=>action==='get.active'&&++reads>=3?{handled:true,data:[{id:'manual',status:'RUNNING'}]}:undefined);
 assert.equal(await f.workflow.run({dispatch:true}),true);assert.equal(f.calls.some(call=>call.action==='launch.confirmed'),false);
});
test('unavailable or over-budget mercenaries are never sent, including previously available cached candidates',async()=>{
 for(const merc of [{id:'zero',callsign:'Zero',status:'RESTING'},{id:'zero',callsign:'Zero',status:'AVAILABLE'}]){
  const f=fixture();f.setOverride((room,action,data)=>action==='merc.refresh'?{handled:true,data:{mercenaries:{mercenaries:data.market==='core'?[merc]:[]},config:{locations:[]},prices:{zero:{totalCost:6000}}}}:undefined);
  assert.equal(await f.workflow.run({dispatch:true}),true);assert.equal(f.calls.some(call=>call.action==='launch.confirmed'),false);
 }
});
test('unconfirmed sale stops the pipeline and cannot sell the same item again during its cooldown',async()=>{
 const f=fixture({expeditionSaleMode:'all'});f.setItems([loot('one')]);f.setOverride((room,action)=>action==='sell.item'?{handled:true,data:f.snapshot()}:undefined);
 assert.equal(await f.workflow.run({dispatch:true}),false);assert.equal(f.calls.some(call=>call.action==='launch.confirmed'),false);
 assert.equal(await f.workflow.run({dispatch:true}),false);assert.equal(f.calls.filter(call=>call.action==='sell.item').length,1);
});
test('unknown mailbox and partial/unknown claim results stop before sale or dispatch',async()=>{
 for(const result of [{bad:true},{results:[{attachmentId:'a',status:'unknown'}]}]){
  const f=fixture({autoClaimExpeditionMail:true,expeditionSaleMode:'all'});f.setMail([{id:'m',title:'远征战利品',attachments:[{id:'a',claimedAt:null}]}]);
  f.setItems([loot('one')]);f.setOverride((room,action)=>action==='claim.all'?{handled:true,data:result}:undefined);
  assert.equal(await f.workflow.run({dispatch:true}),false);assert.equal(f.calls.some(call=>['sell.item','launch.confirmed'].includes(call.action)),false);
 }
});
test('explicit no-space mail result frees space then re-reads and verifies claims before dispatch',async()=>{
 const f=fixture({autoClaimExpeditionMail:true,expeditionSaleMode:'full'});f.setItems([loot('one')]);f.setMail([{id:'m',title:'EXPEDITION LOOT',attachments:[{id:'a',claimedAt:null}]}]);let attempts=0;
 f.setOverride((room,action)=>action==='claim.all'&&++attempts===1?{handled:true,data:{results:[{attachmentId:'a',status:'skipped'}]}}:
  room==='stash'&&action==='get.state'?{handled:true,data:{items:structuredClone(f.items),maxCapacity:1,currentUsage:f.items.length}}:undefined);
 assert.equal(await f.workflow.run({dispatch:true}),true);assert.equal(attempts,2);
 const first=f.calls.findIndex(call=>call.action==='claim.all'),sale=f.calls.findIndex(call=>call.action==='sell.item');assert.ok(first<sale);
 assert.equal(f.calls.filter(call=>call.action==='launch.confirmed').length,1);
});
test('switching the module off during an acknowledged claim prevents every subsequent sale and launch',async()=>{
 const f=fixture({autoClaimExpeditionMail:true,expeditionSaleMode:'all'});f.setMail([{id:'m',title:'EXPEDITION LOOT',attachments:[{id:'a',claimedAt:null}]}]);f.setItems([loot('one')]);
 f.setOverride((room,action)=>{if(action==='claim.all'){f.settings.expeditionModuleEnabled=false;f.workflow.cancel();}return undefined;});
 assert.equal(await f.workflow.run({dispatch:true}),false);assert.equal(f.calls.some(call=>['sell.item','launch.confirmed'].includes(call.action)),false);
});
test('mode changes during sale are checked before the next item',async()=>{
 const f=fixture({expeditionSaleMode:'all'});f.setItems([loot('one'),loot('two',drone[0])]);
 f.setOverride((room,action)=>{if(action==='sell.item')f.settings.expeditionSaleMode='off';});
 assert.equal(await f.workflow.run({dispatch:true}),false);assert.equal(f.calls.filter(call=>call.action==='sell.item').length,1);
});
test('a concurrent trigger cannot start a second workflow while a response is pending',async()=>{
 const f=fixture();let release;f.setOverride((room,action)=>action==='get.active'?new Promise(resolve=>{release=()=>resolve({handled:true,data:[]})}):undefined);
 const first=f.workflow.run();await new Promise(resolve=>setImmediate(resolve));assert.equal(await f.workflow.run({dispatch:true}),false);release();
 assert.equal(await first,true);assert.equal(f.calls.filter(call=>call.action==='get.active').length,1);
});
test('decision weights, immediate mode and last-minute scheduling retain original scoring rules',()=>{
 const now=Date.now(), exp={riskScore:20,mercenary:{rank:'RECRUIT'}}, d={id:'d',decisionDeadline:new Date(now+120000).toISOString(),decisionOptions:[{id:'safe',riskModifier:-2,lootModifier:0},{id:'risky',riskModifier:5,lootModifier:5}]};
 assert.equal(decisionChoice(d,exp,{autoChoose:true},now),null);
 assert.equal(decisionChoice(d,exp,{autoChoose:true,noWaitAutoChoose:true},now).id,'safe');
 assert.equal(decisionChoice(d,{...exp,mercenary:{rank:'VETERAN'}},{autoChoose:true,noWaitAutoChoose:true,getRidOfVeterans:true},now).id,'risky');
});

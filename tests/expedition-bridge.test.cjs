const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),path=require('node:path');
const esbuild=require('esbuild');const flush=()=>new Promise(resolve=>setImmediate(resolve));
const catalogue=require('../src/shared/expedition-loot-catalogue.json');
const material=catalogue.items.find(item=>item.droneMaterial&&item.canSell),normal=catalogue.items.find(item=>!item.droneMaterial&&item.canSell);
async function setup(){
 const code=(await esbuild.build({stdin:{contents:"import {relayExpeditionModule} from './src/content-early/expedition-module.js';window.relay=relayExpeditionModule",resolveDir:path.resolve(__dirname,'..')},bundle:true,write:false,format:'iife',plugins:[{name:'stubs',setup(build){
 const stubs={
  './ws-send.js':"export function wsSend(message,guard){window.frames.push({message,guard})};export function joinRoom(room){window.rooms.push(room)}",
  './state.js':"export const OrigWebSocket={OPEN:1};export const trackedSockets=[{readyState:1}];export const USOL_SERVER_ID='usol-server';",
  './expeditions.js':"export function cancelMercenaryFetches(){}"
 };build.onResolve({filter:/.*/},args=>stubs[args.path]!==undefined?{path:args.path,namespace:'stub'}:undefined);build.onLoad({filter:/.*/,namespace:'stub'},args=>({contents:stubs[args.path]}));
 }}]})).outputFiles[0].text;
 const listeners=[],packets=[],frames=[],rooms=[],timers=new Map();let timerId=0;
 const window={frames,rooms,packets,addEventListener(type,fn){listeners.push(fn)},removeEventListener(type,fn){const i=listeners.indexOf(fn);if(i>=0)listeners.splice(i,1)},postMessage(packet){packets.push(packet)},emit(data){for(const fn of [...listeners])fn({source:window,data})}};
 vm.runInNewContext(code,{window,console,setTimeout(fn){timers.set(++timerId,fn);return timerId},clearTimeout(id){timers.delete(id)}});
 const config=patch=>window.emit({type:'COR3_EXPEDITION_MODULE_CONFIG',requestId:'c',config:{enabled:true,saleMode:'all',claimMail:true,dispatch:true,costLimited:true,maxMercCost:3000,...patch}});
 const rpc=(id,room,action,data={},options={})=>window.emit({type:'COR3_EXPEDITION_RPC',requestId:id,room,action,data,options});
 const reply=(room,action,data,error)=>window.relay(room,{event:{action},data,error});
 const command=()=>JSON.parse(frames.at(-1).message.slice(2))[1];
 return{window,frames,packets,rooms,timers,config,rpc,reply,command};
}
test('MAIN bridge refuses disabled module and applies the same ID/material/lock policy as the workflow',async()=>{
 const b=await setup();b.rpc('off','stash','get.state');await flush();assert.equal(b.frames.length,0);assert.ok(b.packets.at(-1).error);
 b.config({saleMode:'non-drone'});
 b.reply('stash','get.state',{items:[{id:'drone',itemConfigId:material.id,quantity:3,canSell:true},{id:'normal',itemConfigId:normal.id,quantity:1,canSell:true},{id:'gear',itemConfigId:'gear',canSell:true,quantity:1}]});
 for(const [id,itemConfigId]of [['drone',material.id],['gear','gear']]){
  b.rpc(id,'stash','sell.item',{itemId:id,quantity:1},{saleMode:'non-drone',itemConfigId});await flush();assert.ok(b.packets.at(-1).error);assert.equal(b.frames.length,0);
 }
 b.rpc('n','stash','sell.item',{itemId:'normal',quantity:1},{saleMode:'non-drone',itemConfigId:normal.id});assert.equal(b.command().event.action,'sell.item');
 b.reply('stash','sell.item',{items:[]});await flush();assert.equal(b.packets.at(-1).requestId,'n');assert.equal(b.packets.at(-1).error,undefined);
});
test('changing the mode/module invalidates queued WS writes even if they have not yet left the throttle queue',async()=>{
 const b=await setup();b.config();b.reply('stash','get.state',{items:[{id:'drone',itemConfigId:material.id,quantity:1,canSell:true}]});
 b.rpc('sell','stash','sell.item',{itemId:'drone',quantity:1},{saleMode:'all',itemConfigId:material.id});
 const pending=b.frames.at(-1);assert.equal(pending.guard(),true);b.config({enabled:false});assert.equal(pending.guard(),false);
 b.reply('stash','sell.item',{items:[]});await flush();b.config();assert.equal(pending.guard(),false,'reenabling never resurrects a completed or cancelled send');
});
test('mail RPC requires an individually recognized expedition message, never a blank Receive All',async()=>{
 const b=await setup();b.config();b.reply('mail','get.state',{messages:[{id:'reward',title:'远征战利品',attachments:[{id:'a',claimedAt:null}]},{id:'other',title:'Other mail',attachments:[{id:'b',claimedAt:null}]}]});
 for(const messageId of [undefined,'other']){b.rpc('bad','mail','claim.all',{messageId});await flush();assert.ok(b.packets.at(-1).error);assert.equal(b.frames.length,0);}
 b.rpc('claim','mail','claim.all',{messageId:'reward'});assert.equal(b.command().data.messageId,'reward');
 b.reply('mail','claim.all',{results:[{attachmentId:'a',status:'claimed'}]});await flush();assert.equal(b.packets.at(-1).requestId,'claim');
});
test('launch is configured, price checked and active state re-read before the launch request, then waits for acknowledgement',async()=>{
 const b=await setup();b.config();const data={mercenaryId:'zero',marketId:'core',locationConfigId:'loc',zoneConfigId:'zone',goalId:'goal'};
 b.rpc('launch','expeditions','launch.confirmed',data);assert.equal(b.command().event.action,'configure');
 b.reply('expeditions','configure',{totalCost:1995});await flush();assert.equal(b.command().event.action,'get.active');
 b.reply('expeditions','get.active',[]);await flush();assert.equal(b.command().event.action,'launch');
 assert.equal(b.packets.some(packet=>packet.requestId==='launch'),false);
 b.reply('expeditions','launch',{id:'new',mercenary:{id:'zero'}});await flush();assert.equal(b.packets.at(-1).data.id,'new');
});
test('a price over the cap, a concurrent expedition or module shutdown each prevents launch',async()=>{
 for(const scenario of ['price','active','off']){
  const b=await setup();b.config();b.rpc('launch','expeditions','launch.confirmed',{mercenaryId:'zero',locationConfigId:'loc',zoneConfigId:'zone',goalId:'goal'});
  b.reply('expeditions','configure',{totalCost:scenario==='price'?6000:1995});await flush();
  if(scenario==='off')b.config({enabled:false});
  if(scenario!=='price'){b.reply('expeditions','get.active',scenario==='active'?[{id:'manual',status:'RUNNING'}]:[]);await flush();}
  assert.equal(b.frames.some(frame=>JSON.parse(frame.message.slice(2))[1].event.action==='launch'),false,scenario);
  assert.ok(b.packets.at(-1).error,scenario);
 }
});

const assert=require('node:assert/strict'), fs=require('node:fs'), vm=require('node:vm'), path=require('node:path');
const esbuild=require('esbuild');
const root=path.resolve(__dirname,'..');
async function bundle(entry, stubs={}) {
 return (await esbuild.build({stdin:{contents:entry,resolveDir:root},bundle:true,write:false,format:'iife',plugins:[{name:'stub',setup(b){
 b.onResolve({filter:/.*/},a=>stubs[a.path]!==undefined?{path:a.path,namespace:'stub'}:undefined);
 b.onLoad({filter:/.*/,namespace:'stub'},a=>({contents:stubs[a.path]}));}}],logLevel:'silent'})).outputFiles[0].text;
}
const flush=()=>new Promise(r=>setImmediate(r));
function events(){const f=[];return {f,addListener(fn){f.push(fn)},emit(...args){f.forEach(fn=>fn(...args))}};}
require('node:test').test('30-minute Chrome alarm retains its schedule and pauses with the module', async()=>{
 const bg=await bundle("import './src/background/periodic-merc-dispatch.js'",{'./helpers.js':'export async function getCor3Tab(){return {id:7}}'});
 const settings={periodicMercDispatchEnabled:false,expeditionModuleEnabled:true}, local={}, alarms=new Map(), messages=[], changes=events(), onAlarm=events(), onMessage=events();let creates=0;
 const chrome={storage:{sync:{async get(){return {...settings}}},local:{async set(v){Object.assign(local,v)}},onChanged:changes},alarms:{onAlarm,async get(n){return alarms.get(n)},async create(n,d){creates++;alarms.set(n,{...d,scheduledTime:Date.now()+d.delayInMinutes*60000})},async clear(n){alarms.delete(n)}},tabs:{async sendMessage(id,m){messages.push({id,m})}},runtime:{onMessage}};
 vm.runInNewContext(bg,{chrome,console});await flush();assert.equal(creates,0);
 settings.periodicMercDispatchEnabled=true;changes.emit({periodicMercDispatchEnabled:{newValue:true}},'sync');await flush();
 assert.equal(creates,1);assert.equal(alarms.get('periodicMercDispatch').periodInMinutes,30);assert.equal(messages.length,1);assert.equal(messages[0].m.action,'periodicMercDispatch');
 const next=local.periodicMercNextCheckAt;onMessage.emit({action:'periodicMercReady'},{},()=>{});await flush();assert.equal(creates,1);assert.equal(local.periodicMercNextCheckAt,next);
 vm.runInNewContext(bg,{chrome:{...chrome,storage:{...chrome.storage,onChanged:events()},alarms:{...chrome.alarms,onAlarm:events()},runtime:{onMessage:events()}},console});await flush();assert.equal(creates,1,'worker restart preserves original schedule');
 onAlarm.emit({name:'periodicMercDispatch'});await flush();assert.equal(messages.length,3);
 settings.helperMode=true;changes.emit({helperMode:{newValue:true}},'sync');await flush();assert.equal(alarms.size,0);
 console.log('PASS background: immediate enable, 30-minute repeating alarm, popup independence, startup schedule preservation, Helper pause');

 const bridge=await bundle("import {relayPeriodicExpeditions} from './src/content-early/periodic-merc-dispatch.js'; window.relay=relayPeriodicExpeditions",{
 './ws-send.js':"export function wsSend(m){window.sent.push(m)};export function joinRoom(r){window.rooms.push(r)}",
 './state.js':"export const OrigWebSocket={OPEN:1};export const trackedSockets=window.sockets",
 './expeditions.js':"export function cancelMercenaryFetches(){window.cancelled++}"
 });
 const w={sent:[],rooms:[],sockets:[{readyState:1}],packets:[],cancelled:0,listeners:[],addEventListener(t,f){this.listeners.push(f)},postMessage(m){this.packets.push(m)},emit(data){this.listeners.forEach(f=>f({source:this,data}))}};
 vm.runInNewContext(bridge,{window:w});w.emit({type:'COR3_PERIODIC_REQUEST_EXPEDITIONS',requestId:'a'});
 assert.equal(JSON.parse(w.sent[0].slice(2))[1].event.action,'get.active');w.relay({data:[]});assert.equal(w.packets[0].requestId,'a');assert.equal(w.packets[0].expeditions.length,0);
 w.emit({type:'COR3_PERIODIC_REQUEST_EXPEDITIONS',requestId:'b'});w.emit({type:'COR3_PERIODIC_CANCEL_EXPEDITIONS',requestId:'b',cancelMercs:true});w.relay({data:[]});assert.equal(w.packets.length,1);assert.equal(w.cancelled,1);
 w.sockets.length=0;w.emit({type:'COR3_PERIODIC_REQUEST_EXPEDITIONS',requestId:'offline'});assert.match(w.packets[1].error,/offline/);
 console.log('PASS MAIN bridge: explicit get.active, tagged fresh responses, cancellation, offline failure');

});

const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {build}=require('esbuild');
test('active mode changes wait for the next job; duplicate start and Stop/restart preserve engine state',async()=>{
 const code=(await build({entryPoints:['src/auto-job-solver/index.js'],bundle:true,write:false,format:'iife',plugins:[{name:'engine',setup(b){b.onResolve({filter:/^\.\/(state|main-loop)\.js$/},a=>({path:a.path,namespace:'mock'}));b.onLoad({filter:/.*/,namespace:'mock'},a=>({contents:a.path.includes('state')?'export const state=window.state;export function sendCmd(){};export function log(){}':'export function processQueue(){window.calls++;window.state.running=true}'}));}}]})).outputFiles[0].text;
 const listeners=[];const window={calls:0,state:{running:false,abortFlag:false,solverSettings:{}},addEventListener(type,fn){listeners.push(fn)},emit(data){for(const fn of listeners)fn({source:window,data})}};
 vm.runInNewContext(code,{window,console:{log(){}}});window.emit({type:'COR3_AUTOJOB_START',jobs:[{id:1}],settings:{loadoutMode:'auto'}});assert.equal(window.calls,1);
 window.emit({type:'COR3_AUTOJOB_LOADOUT_MODE',mode:'software'});assert.equal(window.state.solverSettings.loadoutMode,'auto');assert.equal(window.state.pendingLoadoutMode,'software');
 window.emit({type:'COR3_AUTOJOB_START',jobs:[{id:2}],settings:{}});assert.equal(window.calls,1);assert.equal(window.state.jobQueue[0].id,1);
 window.emit({type:'COR3_AUTOJOB_STOP'});assert.equal(window.state.abortFlag,true);window.state.running=false;
 window.emit({type:'COR3_AUTOJOB_START',jobs:[{id:3}],settings:{loadoutMode:'software'}});assert.equal(window.calls,2);assert.equal(window.state.abortFlag,false);assert.equal(window.state.solverSettings.loadoutMode,'software');
});

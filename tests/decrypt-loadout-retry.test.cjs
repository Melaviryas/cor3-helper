const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {build}=require('esbuild');let code;
async function fixture(){
 code||=(await build({entryPoints:['src/auto-job-solver/solvers.js'],bundle:true,write:false,format:'cjs',plugins:[{name:'flow',setup(b){b.onResolve({filter:/^\.\/(state|helpers|steps)\.js$/},a=>({path:a.path,namespace:'mock'}));b.onLoad({filter:/.*/,namespace:'mock'},a=>({contents:a.path.includes('state')?`export const state={};export const sendCmd=(c,d)=>window.trace.push(c);export const delay=async()=>{};export const log=()=>{};export const waitForHackToBeDone=async()=>{};export const waitForEvent=async()=>({});`:a.path.includes('steps')?`export function jobLabel(){};export const stepCompleteJob=async()=>{if(++window.completions===1)throw new Error('job-conditions-not-met');return {credits:10}};export function stepTakeJob(){};export function stepSetEndpoint(){};export function stepLogin(){};export function stepDiscoverDownloadFolder(){}`:`export function jobLabel(){};export function extractFileInfoFromConditions(){};export function jobConditionsRequireDecrypt(){};export const ensureDecryptOnlyLoadout=async()=>{window.trace.push('plan')};export const checkDecryptPowerViaAnalysis=async()=>{window.trace.push('analysis');return window.analysisOk()};export const tryLoadoutSwapForError=async()=>false;export const waitForMinigameOrError=async()=>({minigame:{}});export function throwMinigameLockError(){}` }));}}]})).outputFiles[0].text;
 const window={trace:[],completions:0,postMessage(){},analysisOk:()=>true};const module={exports:{}};vm.runInNewContext(code,{module,exports:module.exports,window});return {api:module.exports,window};
}
test('completion-driven decryption retries rerun the same loadout planning and server analysis before opening',async()=>{
 const f=await fixture();const reward=await f.api.runDecryptFlow('file','file.eb54x',{fileType:'.eb54x'});assert.equal(reward.credits,10);assert.deepEqual(f.window.trace,['plan','analysis','decrypt.file','plan','analysis','decrypt.file']);
});
test('a server refusal after a retry loadout refresh stops before another decrypt request',async()=>{
 const f=await fixture();let n=0;f.window.analysisOk=()=>++n===1;
 await assert.rejects(f.api.runDecryptFlow('file','file.eb54x',{fileType:'.eb54x'}),/Insufficient decrypt power/);assert.equal(f.window.trace.filter(x=>x==='decrypt.file').length,1);
});

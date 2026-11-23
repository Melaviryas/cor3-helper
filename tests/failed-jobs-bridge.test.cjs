const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {buildSync}=require('esbuild');
test('MAIN exposes fresh get.jobs snapshots rather than preserved get.options cache, and relays dismissal errors',()=>{
 const code=buildSync({entryPoints:['src/content-early/ws-message-handler.js'],bundle:true,write:false,format:'cjs'}).outputFiles[0].text;
 const module={exports:{}},packets=[];
 const window={WebSocket:class {static OPEN=1},postMessage(p){packets.push(p)},addEventListener(){},__cor3CurrentMarketFetch:'019d3ea4-85bd-7389-904d-8f7c85841134',__cor3HomeMarketCache:{jobs:[],recentJobs:[{id:'old',status:'FAILED'}]}};
 vm.runInNewContext(code,{module,exports:module.exports,window,console,setTimeout,clearTimeout});
 const packet=(action,data,error)=>'42'+JSON.stringify(['market',{event:{action},data,error}]);
 module.exports.handleWsMessage(packet('get.options',{market:{id:window.__cor3CurrentMarketFetch,marketName:'CORE'}}));
 assert.equal(packets.filter(p=>p.type==='COR3_MARKET_JOBS_SNAPSHOT').length,0);
 module.exports.handleWsMessage(packet('get.jobs',{jobs:[],recentJobs:[{id:'fresh',status:'TAKEN'}]}));
 const snapshot=packets.find(p=>p.type==='COR3_MARKET_JOBS_SNAPSHOT');assert.equal(snapshot.marketKey,'home');assert.equal(snapshot.data.recentJobs[0].id,'fresh');
 module.exports.handleWsMessage(packet('job.dismiss',undefined,{message:'denied'}));assert.equal(packets.find(p=>p.type==='COR3_JOB_DISMISS_RESULT').error.message,'denied');
});

const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {buildSync}=require('esbuild');
const m={exports:{}};vm.runInNewContext(buildSync({entryPoints:['src/shared/loadout-optimizer.js'],bundle:true,write:false,format:'cjs'}).outputFiles[0].text,{module:m,exports:m.exports});
const {chooseBestLoadout,hardwareTransition}=m.exports;
function hardware(f=25){return {cpu:{id:'cpu'+f,category:'CPU',name:'CPU '+f,specs:{cpuFrequency:f,cpuCores:4,cpuConsuming:30}},gpu:{id:'gpu',category:'GPU',specs:{gpuPower:20,gpuMemory:16,gpuConsuming:40}},ram:{id:'ram',category:'RAM',specs:{ramFrequency:20,ramMemory:16}},psu:{id:'psu',category:'PSU',specs:{psuPower:100}}};}
function software(id,power,consuming,files=['.eb54x']){return {id,name:id,consuming:{cpu_frequency:consuming},specs:[{type:'DECRYPT',power,fileTypes:files}]};}
function sample(){const hw=hardware();return {equippedHardware:hw,ownedHardware:Object.values(hw),ownedSoftware:[software('0J',[14,46],[20,50]),software('09',[14,38],[5,30])],equippedSoftware:[{id:'0J'}]};}
const pick=(data,extra={})=>chooseBestLoadout(data,{type:'DECRYPT',target:'.eb54x',...extra});
test('actual output 09=33 beats 0J=19; no names or theoretical maximum are prioritized',()=>{
 const result=pick(sample());assert.equal(result.best.software.id,'09');assert.equal(result.best.power,33);
 assert.deepEqual(Array.from(result.candidates,c=>[c.id,c.power]),[['0J',19],['09',33]]);
});
test('a newly owned CPU automatically makes 0J=46 the best; software-only keeps current hardware',()=>{
 const data=sample();const cpu=hardware(50).cpu;data.ownedHardware.push(cpu);
 assert.equal(pick(data).best.software.id,'0J');assert.equal(pick(data).best.power,46);assert.equal(pick(data).best.hardware.cpu.id,cpu.id);
 const fixed=pick(data,{mode:'software'});assert.equal(fixed.best.software.id,'09');assert.equal(fixed.best.power,33);assert.equal(fixed.best.hardware.cpu.id,data.equippedHardware.cpu.id);
 data.equippedHardware.cpu=cpu;assert.equal(pick(data,{mode:'software'}).best.power,46);
});
test('new tools participate only when purchased and compatible with the requested extension',()=>{
 const data=sample();const lyapun=software('Lyapun',[20,35],[1,25]);data.ownedSoftware.push(lyapun);assert.equal(pick(data).best.software.id,'Lyapun');
 const hopper=software('Hopper',[15,32],[1,25],['.eb52x','.ab52p']);data.ownedSoftware.push(hopper);
 assert.equal(pick(data).candidates.some(c=>c.id==='Hopper'),false);
 assert.equal(pick(data,{target:'EB52X'}).best.software.id,'Hopper');
});
test('matching operation/extension is the score; unrelated abilities do not inflate a multifunction tool',()=>{
 const data=sample();const multi=software('multi',[14,30],[1,25]);multi.specs.push({type:'HACK',power:[500,999],serverTypes:['TEST']},{type:'SEARCH',power:[500,999],serverTypes:['TEST']});data.ownedSoftware.push(multi);
 assert.equal(pick(data).best.software.id,'09');
 const hack=chooseBestLoadout(data,{type:'HACK',target:'test'});assert.equal(hack.best.software.id,'multi');assert.equal(hack.best.power,999);
});
test('PSU and all software resource minimums constrain combinations; unknown requirements fail closed',()=>{
 const data=sample();const cpu=hardware(50).cpu;cpu.specs.cpuConsuming=100;data.ownedHardware.push(cpu);
 assert.equal(pick(data).best.software.id,'09','overloaded PSU cannot enable 0J');
 data.ownedHardware.push({id:'big',category:'PSU',specs:{psuPower:200}});assert.equal(pick(data).best.power,46);
 data.ownedSoftware.push(software('cannot-boot',[99,100],[80,100]));assert.equal(pick(data).candidates.find(c=>c.id==='cannot-boot').power,null);
 data.ownedSoftware.push({id:'unknown',name:'unknown',specs:[{type:'DECRYPT',power:[99,100],fileTypes:['.eb54x']}]});assert.equal(pick(data).candidates.some(c=>c.id==='unknown'),false);
});
test('equal actual Power favors the equipped tool/hardware and avoids unnecessary swaps',()=>{
 const data=sample();data.equippedHardware=hardware(50);data.ownedHardware=Object.values(data.equippedHardware);
 const other=software('copy',[14,46],[20,50]);data.ownedSoftware.unshift(other);data.equippedSoftware=[{id:'0J'}];
 const result=pick(data);assert.equal(result.best.software.id,'0J');assert.equal(result.best.changes.commands,0);
});
test('insufficient maximum is reported without manufacturing a higher-power candidate',()=>{
 const result=pick(sample(),{requiredPower:40});assert.equal(result.meetsRequirement,false);assert.equal(result.best.power,33);assert.match(result.reason,/33.*40/);
});
test('hardware switching sequence stays within PSU capacity at every intermediate step',()=>{
 const from=hardware(),to=hardware(50);from.cpu.specs.cpuConsuming=20;from.gpu.specs.gpuConsuming=80;from.psu.specs.psuPower=100;
 to.cpu.specs.cpuConsuming=80;to.gpu={...from.gpu,id:'low-gpu',specs:{...from.gpu.specs,gpuConsuming:20}};to.psu=from.psu;
 const steps=hardwareTransition(from,to);assert.equal(steps[0],'gpu');let current={...from};for(const slot of steps){current[slot]=to[slot];assert.ok(current.cpu.specs.cpuConsuming+current.gpu.specs.gpuConsuming<=current.psu.specs.psuPower)}
 const stronger={...to,psu:{id:'large',specs:{psuPower:200}}};stronger.gpu=from.gpu;assert.equal(hardwareTransition(from,stronger)[0],'psu');
});
test('incomplete or incompatible hardware cannot produce a speculative Power result',()=>{
 const data=sample();delete data.equippedHardware.psu;data.ownedHardware=data.ownedHardware.filter(hw=>hw.category!=='PSU');assert.equal(pick(data).best,null);
});

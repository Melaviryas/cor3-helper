const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {buildSync}=require('esbuild');
const moduleObj={exports:{}};vm.runInNewContext(buildSync({entryPoints:['src/shared/failed-jobs-policy.js'],bundle:true,write:false,format:'cjs'}).outputFiles[0].text,{module:moduleObj,exports:moduleObj.exports});
const {findFailedJobs,verifyDismissals}=moduleObj.exports;
const snapshots={home:{jobs:[],recentJobs:[{id:'failed',status:'FAILED'},{id:'taken',status:'TAKEN'},{id:'complete',status:'COMPLETED'},{id:'skipped',status:'skipped'}]},dark:{jobs:[],recentJobs:[{id:'d',status:'FAILED'}]}};
test('only fresh server FAILED jobs are selected, never TAKEN/COMPLETED or plugin skipped statuses',()=>{
 const r=findFailedJobs(snapshots);assert.deepEqual(Array.from(r.jobs,j=>j.jobId),['failed','d']);assert.equal(findFailedJobs({}).jobs.length,0);
});
test('duplicate ambiguous ownership and unavailable markets fail closed',()=>{
 const shared={jobs:[],recentJobs:[{id:'both',status:'FAILED'}]};
 const r=findFailedJobs({home:shared,dark:shared});assert.equal(r.jobs.length,0);assert.equal(r.ambiguous.length,1);
 const explicit={jobs:[],recentJobs:[{id:'other',status:'FAILED',marketId:'019e4065-6ae8-760d-8724-58ab4f2cf7d7'}]};assert.equal(findFailedJobs({home:explicit}).jobs.length,0);
});
test('server-owned IDs are deduplicated and current owner status takes precedence',()=>{
 const id='019e4065-6ae8-760d-8724-58ab4f2cf7d7';
 const s={home:{recentJobs:[{id:'u',status:'FAILED',marketId:id}]},usol:{recentJobs:[{id:'u',status:'FAILED',marketId:id}]}};
 assert.equal(findFailedJobs(s).jobs.length,1);
 s.usol.recentJobs[0].status='TAKEN';assert.equal(findFailedJobs(s).jobs.length,0);
});
test('only verified absence counts as dismissed; unavailable verification stays unconfirmed',()=>{
 const jobs=findFailedJobs(snapshots).jobs;
 let totals=verifyDismissals(jobs,{home:{recentJobs:[]}});assert.equal(totals[0].removed,1);assert.equal(totals[1].unverified,1);
 totals=verifyDismissals(jobs,snapshots);assert.equal(totals.reduce((s,r)=>s+r.removed,0),0);assert.equal(totals.reduce((s,r)=>s+r.remaining,0),2);
});

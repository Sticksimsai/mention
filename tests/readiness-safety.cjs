const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const ts=require('../apps/web/node_modules/typescript');
function load(file){const module={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module,exports:module.exports,Date,Set,BigInt});return module.exports;}
const {scoreVolume}=load('apps/api/src/lib/volume-settlement.ts');
const r={start:600,end:1200,poolA:'pool-a',poolB:'pool-b',mintA:'mint-a',mintB:'mint-b'};
const snapshot=(pool,mint,amount)=>({pool,mint,finalized:true,buckets:Array.from({length:10},(_,i)=>({time:600+i*60,usdMicros:amount}))});
const a=snapshot(r.poolA,r.mintA,'2000000'),b=snapshot(r.poolB,r.mintB,'1000000');
assert.equal(scoreVolume(r,a,b,1200).outcome,'a');
assert.equal(scoreVolume(r,{...a,buckets:b.buckets},b,1200).outcome,'refund');
assert.throws(()=>scoreVolume(r,a,b,1199));
for(const invalid of [{...a,pool:'new-pool'},{...a,mint:'wrong-token'},{...a,finalized:false},{...a,buckets:a.buckets.slice(1)},{...a,buckets:[a.buckets[0],...a.buckets.slice(0,9)]},{...a,buckets:a.buckets.map(v=>({...v,usdMicros:'NaN'}))},{...a,buckets:a.buckets.map(v=>({...v,time:v.time+60}))}])assert.equal(scoreVolume(r,invalid,b,1200).outcome,'refund');
assert.equal(scoreVolume(r,snapshot(r.poolA,r.mintA,'99999999999999999999999999'),b,1200).volumeA,'999999999999999999999999990');
const {sendOnce}=load('apps/worker/src/lib/sendOnce.ts');
(async()=>{
 let claimed=false,sends=0,uncertain=0;
 const deps={claim:async()=>{if(claimed)return false;claimed=true;return true},send:async()=>{sends++;throw Error('Lost response after provider accepted post')},complete:async()=>{},uncertain:async()=>{uncertain++}};
 await assert.rejects(()=>sendOnce(deps));assert.equal(await sendOnce(deps),'already-claimed');assert.equal(sends,1);assert.equal(uncertain,1);
 claimed=false;sends=0;await Promise.allSettled([sendOnce(deps),sendOnce(deps)]);assert.equal(sends,1,'Concurrent workers only send once');
 claimed=false;sends=0;await assert.rejects(()=>sendOnce({...deps,send:async()=>{sends++;return 'remote-id'},complete:async()=>{throw Error('DB unavailable')}}));await sendOnce(deps);assert.equal(sends,1,'DB failure after remote acceptance must not resend');
 console.log('Readiness safety: volume boundaries, ties, missing data, precision and ambiguous-send replay tests passed');
})().catch(e=>{console.error(e);process.exit(1)});

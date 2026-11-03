const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),r=require('node:module').createRequire(path.resolve('apps/api/package.json')),ts=r('typescript');
function load(file,mocks={}){const module={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module,exports:module.exports,require:n=>mocks[n]??r(n)});return module.exports;}
const score=load('apps/api/src/lib/volume-settlement.ts'),lib=load('apps/api/src/lib/volume-evidence.ts',{'./volume-settlement.js':score});
const rules={poolA:'A'.repeat(32),poolB:'B'.repeat(32),mintA:'C'.repeat(32),mintB:'D'.repeat(32),start:600,end:1200};
const rows=Array.from({length:10},(_,i)=>[600+i*60,1,1,1,1,'2.0000019']);
function info(pool,mint){return{data:{attributes:{address:pool},relationships:{base_token:{data:{id:'solana_'+mint}}}}};}
let incomplete=false,wrongMint=false;
async function read(url){const a=url.includes('/'+rules.poolA),pool=a?rules.poolA:rules.poolB,mint=a?rules.mintA:rules.mintB;if(url.includes('ohlcv'))return {data:{attributes:{ohlcv_list:incomplete?rows.slice(1):rows.map(row=>a?row:[...row.slice(0,5),1])}}};return info(pool,wrongMint?'E'.repeat(32):mint);}
(async()=>{
 assert.equal(lib.usdMicros('2.0000019'),'2000001');assert.equal(lib.usdMicros('1e-6'),'1');assert.equal(lib.usdMicros(0),'0');for(const x of [-1,NaN,Infinity,null,'1e40'])assert.throws(()=>lib.usdMicros(x));
 const a=await lib.collectVolumeEvidence(rules,1320,read);assert.equal(a.candidate.outcome,'a');assert.equal(a.candidate.volumeA,'20000010');assert.equal(a.signable,false);assert.equal(a.a.finalized,false);
 assert.equal((await lib.collectVolumeEvidence(rules,1380,read)).evidenceHash,a.evidenceHash);
 await assert.rejects(lib.collectVolumeEvidence(rules,1250,read),/two minutes/);
 incomplete=true;assert.equal((await lib.collectVolumeEvidence(rules,1320,read)).candidate.outcome,'refund');incomplete=false;
 wrongMint=true;const wrong=await lib.collectVolumeEvidence(rules,1320,read);assert.equal(wrong.candidate.outcome,'refund');assert.equal(wrong.failures.length,2);wrongMint=false;
 const fail=await lib.collectVolumeEvidence(rules,1320,async()=>{throw Error('HTTP 429')});assert.equal(fail.candidate.outcome,'refund');assert.equal(fail.signable,false);
 console.log('PASS volume shadow: decimal rounding, fixed identities, timing, missing data, provider outages, stable evidence hashes and no settlement authorization');
})().catch(e=>{console.error(e);process.exitCode=1});

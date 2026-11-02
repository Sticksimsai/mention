const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const ts=require('../apps/web/node_modules/typescript'),r=require('node:module').createRequire(path.resolve('apps/api/package.json'));
const mem=new Map(),redis={get:async k=>mem.get(k)??null,set:async(k,v)=>{mem.set(k,v);}};
let discovery=false,offline=false,empty=false,stats={pairAddress:'pool123'},calls=0;
const fetch=async url=>{calls++;if(offline)throw new Error('provider timeout');return {ok:true,json:async()=>url.endsWith('/pools')?{data:discovery?[{attributes:{address:'Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE',reserve_in_usd:'100'},relationships:{base_token:{data:{id:'solana_token'}}}},{attributes:{address:'So11111111111111111111111111111111111111112',reserve_in_usd:'9999'},relationships:{base_token:{data:{id:'solana_other'}}}}]:[]}:url.includes('ohlcv')?{data:{attributes:{ohlcv_list:empty?[]:[[100,1,2,.5,1.5,30]]}}}:url.includes('/info')?{data:{attributes:{image_url:'https://token.example/sol.png',holders:{count:100,last_updated:'2026-11-02'}}}}:{data:[]}};};
function load(file,mocks,extra={}){const m={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module:m,exports:m.exports,require:n=>mocks[n]??r(n),Date,console:{warn:()=>{}},process:{env:{}},fetch,AbortSignal,URL,...extra});return m.exports;}
const chart=load('apps/api/src/lib/market-chart.ts',{'./redis.js':{redis,cached:async()=>stats},'./tokenStats.js':{}});
function expire(){for(const k of mem.keys())if(k.startsWith('market-v2:'))mem.delete(k);}
(async()=>{
 const first=await chart.resilientMarketChart('token','1m');assert.equal(first.candles.length,1);assert.equal(first.stale,false);assert.equal(first.tokenImageUrl,'https://token.example/sol.png');assert.equal(mem.get('known-pool:token'),'pool123');
 expire();offline=true;stats={pairAddress:null};const outage=await chart.resilientMarketChart('token','1m');assert.equal(outage.candles.length,1);assert.equal(outage.pairAddress,'pool123');assert.equal(outage.stale,true);assert.equal(outage.updatedAt,first.updatedAt);
 expire();offline=false;empty=true;const emptyResponse=await chart.resilientMarketChart('token','1m');assert.equal(emptyResponse.candles.length,1);assert.equal(emptyResponse.stale,true);
 expire();empty=false;const recovered=await chart.resilientMarketChart('token','1m');assert.equal(recovered.stale,false);assert.equal(recovered.candles.length,1);
 mem.clear();stats={pairAddress:null};await assert.rejects(()=>chart.resilientMarketChart('new-token','1m'),/Pool lookup/);
 mem.clear();discovery=true;const discovered=await chart.resilientMarketChart('token','1m');assert.equal(discovered.pairAddress,'Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE');
 let n=0;await Promise.all([chart.marketResource('shared',30,async()=>{n++;await new Promise(r=>setTimeout(r,5));return 1;}),chart.marketResource('shared',30,async()=>{n++;return 2;})]);assert.equal(n,1);
 mem.clear();mem.set('stale:token:token',JSON.stringify({pairAddress:'existing',priceUsd:1}));
 const worker=load('apps/worker/src/jobs/tokenStats.ts',{'@mention/db':{},'../lib/context.js':{redis,db:{}}},{fetch:async()=>({ok:false})});await worker.tokenStatsJob('token');assert.equal(JSON.parse(mem.get('stale:token:token')).pairAddress,'existing');assert(!mem.has('token:token'));
 const fetcher=load('apps/api/src/lib/tokenStats.ts',{}, {fetch:async()=>({ok:false})});await assert.rejects(()=>fetcher.fetchTokenStats('token'),/unavailable/);
 console.log('PASS: known pool survives lookup failure; cached candles survive outages and empty responses with stale timestamp; recovery clears stale flag; token image; no fake new pools; concurrent request deduplication; worker/API failures never overwrite good stats.');
})().catch(e=>{console.error(e);process.exitCode=1;});

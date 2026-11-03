// Test durable send ordering and ambiguous transaction handling without sending to RPC.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),r=require('node:module').createRequire(path.resolve('apps/api/package.json')),ts=r('typescript'),w=r('@solana/web3.js');
const program='HvyUucswhe6NeAWeptTZCs86sVdZK4JJGzhVFQ4y3qFH';
let row,events=[],status=null,height=10,genesis='EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG';
class Connection{async getGenesisHash(){return genesis}async getAccountInfo(){return{executable:true}}async getBlockHeight(){return height}async getSignatureStatuses(){return{value:[status]}}async sendRawTransaction(){assert.equal(row.status,'submitted');assert.equal(row.signedTransaction,'signed');events.push('send');throw Error('timeout after send')}}
const tables={marketActions:{id:'id',status:'status'},marketLinks:{},marketRounds:{},communities:{},battleChallenges:{},eq:(k,v)=>[k,v],and:(...a)=>a,desc:()=>{},sql:()=>{}};
const db={update:()=>({set:values=>({where:condition=>({returning:async()=>{const conditions=Array.isArray(condition[0])?condition:[condition];if(!conditions.every(([k,v])=>row[k]===v))return[];row={...row,...values};events.push('persist:'+values.status);return[row]}})})}),select:()=>({from:()=>({where:async()=>[row]})})};
const mocks={'@solana/web3.js':{...w,Connection},'@mention/db':tables,'./db.js':{db},'./money.js':{verifySigned:()=>({signatures:[Buffer.alloc(64,1)]}),base58:()=> 'signature'},'./volume-evidence.js':{},'./market-protocol.js':{DEVNET_GENESIS:genesis,key:s=>new w.PublicKey(s)}};
const moduleObject={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync('apps/api/src/lib/market-execution.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module:moduleObject,exports:moduleObject.exports,require:n=>mocks[n]??r(n),Buffer,AbortSignal,fetch,process:{env:{MARKETS_DEVNET_ENABLED:'true',MARKETS_DEVNET_ORACLE_SEED:Buffer.alloc(32,7).toString('base64'),MARKETS_DEVNET_PROGRAM_ID:program}}});const lib=moduleObject.exports;
(async()=>{
 row={id:'1',kind:'fund',status:'prepared',transaction:'unsigned',lastValidBlockHeight:50};let a=await lib.sendAction(row,'signed');assert.equal(a.status,'submitted');assert.deepEqual(events,['persist:submitted','send']);
 await lib.sendAction(row,'signed');assert.equal(events.filter(x=>x==='send').length,1,'Never repeat a send when already recorded');
 height=60;a=await lib.refreshAction(row);assert.equal(a.status,'needs_review');assert.equal(a.signature,'signature');
 status={confirmationStatus:'finalized',err:null};a=await lib.refreshAction(row);assert.equal(a.status,'confirmed','Late confirmation reconciles original signature');
 row={id:'2',kind:'fund',status:'prepared',transaction:'unsigned',lastValidBlockHeight:50};await assert.rejects(lib.sendAction(row,'signed'),/expired/);assert.equal(row.status,'prepared');
 genesis='mainnet';await assert.rejects(lib.assertDevnet(),/non-devnet/);
 console.log('PASS devnet transaction persistence before send, timeout ambiguity, no replacement, late confirmation, expiry and wrong-network refusal');
})().catch(e=>{console.error(e);process.exitCode=1});

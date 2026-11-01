// Offline regression tests: real Solana transactions/signatures; no RPC calls or funds.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {createRequire}=require('node:module'),path=require('node:path');
const req=createRequire(path.resolve('apps/api/package.json'));
const ts=require('../apps/web/node_modules/typescript');
const web3=req('@solana/web3.js'),{HTTPException}=req('hono/http-exception');
let row,events=[],chainStatus=null,blockHeight=100;
const table=new Proxy({},{get:(_,k)=>String(k)}),earningsTable={name:'earnings'};
const eq=(a,b)=>({a,b}),and=(...conditions)=>({conditions});
const matches=(condition)=>condition.conditions?condition.conditions.every(matches):row[condition.a]===condition.b;
const db={
 select:()=>({from:()=>({where:async condition=>matches(condition)?[row]:[]})}),
 update:tableName=>({set:values=>({where:condition=>({returning:async()=>{if(!matches(condition))return [];row={...row,...values};events.push('persist:'+row.status);return [row];},then:resolve=>{events.push('release');resolve();}})})}),
 transaction:async fn=>fn(db),
};
class Connection {
 async getBlockHeight(){return blockHeight;}
 async getSignatureStatuses(){return {value:[chainStatus]};}
 async sendRawTransaction(bytes){assert(row.signature,'signature must be persisted first');assert(row.signedTransactionEnc,'signed bytes must be persisted first');events.push('send:'+Buffer.from(bytes).toString('base64'));throw Error('ambiguous network timeout');}
}
const deps={
 'node:crypto':require('node:crypto'),'@solana/web3.js':{...web3,Connection},'hono/http-exception':{HTTPException},
 '@mention/db':{moneyOperations:table,creatorEarnings:earningsTable,eq,and,sql:()=>''},'./db.js':{db},'../env.js':{env:{SOLANA_RPC_URL:'https://not-used.invalid'}},'./crypto.js':{encrypt:s=>'encrypted:'+s,decrypt:s=>s.slice(10)},
};
const out=ts.transpileModule(fs.readFileSync('apps/api/src/lib/money.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const exports_={};vm.runInNewContext(out,{exports:exports_,require:n=>{if(!(n in deps))throw Error(n);return deps[n]},Buffer,Uint8Array,BigInt,Number,Date,JSON,AbortSignal});
const {verifySigned,creatorShare,positiveLamports,base58,broadcast,refreshOperation,publicOperation}=exports_;
const payer=web3.Keypair.generate(),recipient=web3.Keypair.generate();
const make=(lamports=100)=>new web3.VersionedTransaction(new web3.TransactionMessage({payerKey:payer.publicKey,recentBlockhash:web3.Keypair.generate().publicKey.toBase58(),instructions:[web3.SystemProgram.transfer({fromPubkey:payer.publicKey,toPubkey:recipient.publicKey,lamports})]}).compileToV0Message());
const tx=make(),original=Buffer.from(tx.serialize()).toString('base64');tx.sign([payer]);const signed=Buffer.from(tx.serialize()).toString('base64');
assert.equal(base58(tx.signatures[0]).length>=64,true);
assert.doesNotThrow(()=>verifySigned(original,signed));
assert.throws(()=>verifySigned(original,original),/signature/);
const tampered=make(999999);tampered.sign([payer]);assert.throws(()=>verifySigned(original,Buffer.from(tampered.serialize()).toString('base64')),/differs/);
assert.equal(creatorShare(10001n,5000),5000n);assert.equal(creatorShare(10001n,0),10001n);assert.equal(creatorShare(10001n,10000),0n);assert.throws(()=>creatorShare(2n,-1));assert.throws(()=>positiveLamports('-5'));assert.throws(()=>positiveLamports('1.5'));assert.throws(()=>positiveLamports('9999999999999999'));
(async()=>{
 row={id:'op',userId:'owner',kind:'trade',status:'prepared',transaction:original,lastValidBlockHeight:200,details:'{}'};events=[];
 let result=await broadcast({...row},signed);assert.equal(result.status,'submitted');assert.equal(events[0],'persist:submitted');assert(events[1].startsWith('send:'));
 const firstSignature=row.signature;await broadcast({...row},signed);assert.equal(row.signature,firstSignature);assert.equal(events.filter(e=>e.startsWith('send:')).length,2);assert.equal(new Set(events.filter(e=>e.startsWith('send:'))).size,1,'Retries must resend identical bytes');
 chainStatus={err:{InstructionError:[0,'failed']},confirmationStatus:'confirmed'};result=await refreshOperation({...row});assert.equal(result.status,'failed');
 row={...row,status:'submitted'};chainStatus={err:null,confirmationStatus:'processed'};result=await refreshOperation({...row});assert.equal(result.status,'submitted');
 chainStatus={err:null,confirmationStatus:'confirmed'};result=await refreshOperation({...row});assert.equal(result.status,'confirmed');
 row={...row,kind:'payout',status:'submitted'};result=await refreshOperation({...row});assert.equal(result.status,'submitted','Payouts await finality');chainStatus={err:null,confirmationStatus:'finalized'};result=await refreshOperation({...row});assert.equal(result.status,'confirmed');
 row={...row,status:'submitted'};chainStatus=null;blockHeight=300;result=await refreshOperation({...row});assert.equal(result.status,'needs_review','Unknown signature after expiry must not be replayed as a new payment');
 row={...row,kind:'trade',status:'prepared',signature:null};result=await refreshOperation({...row});assert.equal(result.status,'expired');
 const exposed=publicOperation({...row,kind:'launch',signedTransactionEnc:'secret',status:'prepared'});assert.equal(exposed.transaction,undefined);assert.equal(exposed.signedTransactionEnc,undefined);
 console.log('PASS: signed-message tamper checks, signature validation, integer fee splits, write-before-send, same-byte retry, failed/processed/confirmed/finalized states, ambiguous expiry, prepared expiry, private signed bytes.');
})().catch(e=>{console.error(e);process.exitCode=1});

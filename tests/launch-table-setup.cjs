const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const r=require('node:module').createRequire(path.resolve('apps/api/package.json')),w=r('@solana/web3.js');
const script=fs.readFileSync('scripts/setup-launch-table.cjs','utf8'),payer=w.Keypair.generate(),key='/local/mainnet.json';
async function run({execute=false,cap='10000000',genesis='5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d'}={}){
 let sent=0,code=0,state,table;const keys=Array.from({length:30},()=>w.Keypair.generate().publicKey);
 class Connection{async getGenesisHash(){return genesis}async getMinimumBalanceForRentExemption(){return 2000000}async getBalance(){return 10000000}async getSlot(){return 100}async getLatestBlockhash(){return{blockhash:w.Keypair.generate().publicKey.toBase58(),lastValidBlockHeight:200}}async sendRawTransaction(bytes){
  assert.equal(state.transactions.at(-1).status,'signed-before-send');
  const tx=w.Transaction.from(bytes);assert(tx.instructions.every(i=>i.programId.equals(w.AddressLookupTableProgram.programId)),'Only lookup-table instructions may be sent');
  if(!table)table=tx.instructions[0].keys[0].pubkey;
  sent++;return 'signature'+sent;
 }async confirmTransaction(){return{value:{err:null}}}async getAddressLookupTable(){return{value:{isActive:()=>true,state:{addresses:[w.SystemProgram.programId,...keys]}}}}}
 const fakeFs={readFileSync:()=>JSON.stringify([...payer.secretKey]),existsSync:()=>false,writeFileSync:(_,s)=>{state=JSON.parse(s)}};
 const sdk={OnlinePumpSdk:class{async fetchGlobal(){return{}}async resolveQuoteMint(){return{quoteTokenProgram:w.SystemProgram.programId}}},PUMP_SDK:{createV2AndBuyV2Instructions:async()=>[new w.TransactionInstruction({programId:w.SystemProgram.programId,keys:keys.map(pubkey=>({pubkey,isSigner:false,isWritable:false})),data:Buffer.alloc(0)})]}};
 const moduleRequire=n=>n==='@solana/web3.js'?{...w,Connection}:n==='@pump-fun/pump-sdk'?sdk:r(n);
 const process={env:{MAINNET_KEYPAIR:key,SETUP_MAX_LAMPORTS:cap},argv:execute?['--execute']:[],set exitCode(n){code=n}};
 await vm.runInNewContext(script,{require:n=>n==='node:fs'?fakeFs:n==='node:module'?{createRequire:()=>moduleRequire}:require(n),__dirname:path.resolve('scripts'),process,Buffer,console:{log(){},error(){}},Uint8Array});
 return {sent,code,state};
}
(async()=>{
 assert.equal((await run()).sent,0,'Quote mode never sends');
 assert.equal((await run({execute:true,genesis:'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG'})).sent,0,'Devnet rejected');
 assert.equal((await run({execute:true,genesis:'5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp'})).code,1,'Truncated chain identifier is not a genesis hash');
 assert.equal((await run({execute:true,cap:'1'})).sent,0,'Unapproved cost rejected');
 const result=await run({execute:true});assert.equal(result.code,0);assert.equal(result.sent,3);assert(result.state.complete);assert(result.state.transactions.every(t=>t.status==='finalized'));
 console.log('PASS: read-only default, mainnet guard, cost cap, only ALT instructions, persist-before-send and verified completion');
})().catch(e=>{console.error(e);process.exitCode=1});

// Offline only: real SDK instructions and signatures; mocked RPC, no transactions sent.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const {createRequire}=require('node:module'),r=createRequire(path.resolve('apps/api/package.json'));
const ts=require('../apps/web/node_modules/typescript'),BN=r('bn.js'),web3=r('@solana/web3.js'),sdk=r('@pump-fun/pump-sdk');
function load(file,mocks){const module={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,{module,exports:module.exports,require:name=>mocks[name]??r(name),Buffer,console});return module.exports;}
const shared=load('packages/shared/src/index.ts',{});
assert.equal(shared.devBuyUnits(1000000000000000n,200),20000000000000n);
for(const bps of [-1,201,NaN,1.5,Infinity])assert.throws(()=>shared.devBuyUnits(1000000000000000n,bps));
assert.equal(shared.devBuyUnits(1001n,200),20n,'Round down, never above 2%');
assert.equal(shared.launchOptionsSchema.safeParse({mode:'fair',devBuyBps:1}).success,false);
assert.equal(shared.launchOptionsSchema.safeParse({mode:'creator',quoteAsset:'SPCX'}).success,false);
assert.equal(shared.launchOptionsSchema.safeParse({mode:'holders',quoteAsset:'SPCX',devBuyBps:200}).success,true);
const payer=web3.Keypair.generate(),mint=web3.Keypair.generate(),creator=web3.Keypair.generate().publicKey;
const tokenProgram=new web3.PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'),token2022=new web3.PublicKey('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb');
const global={createV2Enabled:true,isHolderRewardEnabled:true,creatorFeeConfigurable:false,feeRecipient:creator,feeRecipients:Array(7).fill(creator),reservedFeeRecipients:Array(8).fill(creator),buybackFeeRecipients:Array(8).fill(creator),tokenTotalSupply:new BN('1000000000000000'),initialVirtualTokenReserves:new BN('1073000000000000'),initialRealTokenReserves:new BN('793100000000000'),initialVirtualSolReserves:new BN('30000000000'),initialVirtualQuoteReserves:new BN('30000000000'),feeBasisPoints:new BN(100),creatorFeeBasisPoints:new BN(0),buybackBasisPoints:new BN(0),whitelistedQuoteMints:[]};
const quoteControl={mints:shared.LAUNCH_PAIRS.map(p=>({mint:new web3.PublicKey(p.mint),initialVirtualQuoteReserves:new BN('30000000000')}))};
class Online {
 async fetchGlobal(){return global;} async fetchFeeConfig(){return null;} async fetchQuoteControl(){return quoteControl;}
 async resolveQuoteMint(){return {quoteTokenProgram:tokenProgram,decimals:9};} async fetchQuoteTransferFee(){return null;}
}
let table,amount=0n,tamper=false;
const connection={
 getLatestBlockhash:async()=>({blockhash:web3.Keypair.generate().publicKey.toBase58(),lastValidBlockHeight:300}),
 getAddressLookupTable:async()=>({value:table}),getBalance:async()=>10000000000,
 simulateTransaction:async tx=>{
   const instructions=web3.TransactionMessage.decompile(tx.message,{addressLookupTableAccounts:[table]}).instructions;
   const disc=require('node:crypto').createHash('sha256').update('global:buy_v2').digest().subarray(0,8);
   const buy=instructions.find(i=>i.data.subarray(0,8).equals(disc));
   assert.equal(buy?.data.readBigUInt64LE(8)??0n,amount,'Exact output cap must be encoded in the on-chain instruction');
   assert(tx.message.staticAccountKeys[0].equals(payer.publicKey));
   const m=Buffer.alloc(82);m.writeBigUInt64LE(BigInt(global.tokenTotalSupply.toString()),36);m[44]=6;
   const a=Buffer.alloc(165);mint.publicKey.toBuffer().copy(a,0);payer.publicKey.toBuffer().copy(a,32);a.writeBigUInt64LE(tamper?amount+1n:amount,64);
   return {value:{err:null,accounts:[{lamports:9900000000},{owner:token2022.toBase58(),data:[m.toString('base64'),'base64']},amount?{owner:token2022.toBase58(),data:[a.toString('base64'),'base64']}:null]}};
 },
};
const env={PUMP_LOOKUP_TABLE:web3.Keypair.generate().publicKey.toBase58()};
const {buildLaunch}=load('apps/api/src/lib/launch-builder.ts',{'@mention/shared':shared,'./money.js':{connection},'../env.js':{env},'./pump-sdk.js':{...sdk,OnlinePumpSdk:Online}});
(async()=>{
 for(const quoteAsset of ['SOL','SPCX','QQQX','SPYX'])for(const devBuyBps of [0,200]){
  amount=shared.devBuyUnits(BigInt(global.tokenTotalSupply.toString()),devBuyBps);
  const pair=shared.LAUNCH_PAIRS.find(p=>p.id===quoteAsset);
  const common={mint:mint.publicKey,user:payer.publicKey,creator,name:'Long token name for launch test',symbol:'TEST',uri:'https://ipfs.io/ipfs/'+'a'.repeat(46),mayhemMode:false,holderReward:true,quoteMint:new web3.PublicKey(pair.mint),quoteTokenProgram:tokenProgram};
  const ix=devBuyBps?await sdk.PUMP_SDK.createV2AndBuyV2Instructions({...common,global,amount:new BN(amount.toString()),quoteAmount:new BN('1000000000'),slippage:0}):[await sdk.PUMP_SDK.createV2Instruction(common)];
  const addresses=[...new Map(ix.flatMap(i=>[i.programId,...i.keys.map(k=>k.pubkey)]).map(k=>[k.toBase58(),k])).values()];
  table=new web3.AddressLookupTableAccount({key:new web3.PublicKey(env.PUMP_LOOKUP_TABLE),state:{deactivationSlot:18446744073709551615n,lastExtendedSlot:1,lastExtendedSlotStartIndex:0,addresses}});
  const args={mint,payer:payer.publicKey,creator,name:common.name,ticker:'TEST',uri:common.uri,mode:'holders',quoteAsset,devBuyBps};
  const result=await buildLaunch(args),tx=web3.VersionedTransaction.deserialize(Buffer.from(result.transaction,'base64'));
  assert(tx.serialize().length<=1232);assert.equal(tx.signatures[0].some(v=>v!==0),false,'Payer must approve');assert(tx.signatures[1].some(v=>v!==0),'Mint is partially signed');
  assert.equal(result.devBuyTokenUnits,amount.toString());assert.equal(result.quoteMint,pair.mint);
  if(devBuyBps){tamper=true;await assert.rejects(buildLaunch(args),/2% supply cap/);tamper=false;}
 }
 assert.equal(new Set(shared.LAUNCH_PAIRS.map(p=>p.mint)).size,shared.LAUNCH_PAIRS.length);
 console.log('PASS: 2% boundaries, fair-start rules, pair/mode restrictions, exact-output SDK instructions, quote mints, partial signing, transaction size with lookup table, simulated cap enforcement. No RPC or funds used.');
})().catch(e=>{console.error(e);process.exitCode=1});

// Offline only: real SDK instructions and signatures; mocked RPC, no transactions sent.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const {createRequire}=require('node:module'),r=createRequire(path.resolve('apps/api/package.json'));
const ts=require('../apps/web/node_modules/typescript'),BN=r('bn.js'),web3=r('@solana/web3.js'),sdk=r('@pump-fun/pump-sdk');
function load(file,mocks){const module={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,{module,exports:module.exports,require:name=>mocks[name]??(name.startsWith(".")?load(path.resolve(path.dirname(file),name.replace(/\.js$/,".ts")),{}):r(name)),Buffer,console});return module.exports;}
const shared=load('packages/shared/src/index.ts',{});
assert.equal(shared.devBuyUnits(1000000000000000n,200),20000000000000n);
for(const bps of [-1,201,NaN,1.5,Infinity])assert.throws(()=>shared.devBuyUnits(1000000000000000n,bps));
assert.equal(shared.devBuyUnits(1001n,200),20n,'Round down, never above 2%');
assert.equal(shared.launchOptionsSchema.safeParse({mode:'fair',devBuyBps:1}).success,false);
assert.equal(shared.launchOptionsSchema.safeParse({mode:'creator',quoteAsset:'SPCX'}).success,false);
assert.equal(shared.launchOptionsSchema.safeParse({mode:'holders',quoteAsset:'SPCX',devBuyBps:200}).success,true);
assert(shared.xProfileUrlSchema.safeParse('https://x.com/tradementions').success);
assert(shared.xProfileUrlSchema.safeParse('https://twitter.com/tradementions').success);
for(const bad of ['https://x.com.evil.test/account','javascript:alert(1)','https://example.com/account'])assert(!shared.xProfileUrlSchema.safeParse(bad).success);
const payer=web3.Keypair.generate(),mint=web3.Keypair.generate(),creator=web3.Keypair.generate().publicKey;
const tokenProgram=new web3.PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'),token2022=new web3.PublicKey('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb');
const global={createV2Enabled:true,isHolderRewardEnabled:true,creatorFeeConfigurable:false,feeRecipient:creator,feeRecipients:Array(7).fill(creator),reservedFeeRecipients:Array(8).fill(creator),buybackFeeRecipients:Array(8).fill(creator),tokenTotalSupply:new BN('1000000000000000'),initialVirtualTokenReserves:new BN('1073000000000000'),initialRealTokenReserves:new BN('793100000000000'),initialVirtualSolReserves:new BN('30000000000'),initialVirtualQuoteReserves:new BN('30000000000'),feeBasisPoints:new BN(100),creatorFeeBasisPoints:new BN(0),buybackBasisPoints:new BN(0),whitelistedQuoteMints:[]};
const quoteControl={mints:shared.LAUNCH_PAIRS.map(p=>({mint:new web3.PublicKey(p.mint),initialVirtualQuoteReserves:new BN('30000000000')}))};
class Online {
 async fetchGlobal(){return global;} async fetchFeeConfig(){return null;} async fetchQuoteControl(){return quoteControl;}
 async resolveQuoteMint(){return {quoteTokenProgram:tokenProgram,decimals:9};} async fetchQuoteTransferFee(){return null;}
}
let table,amount=0n,tamper=false,reserveMode=false,reserveTamper=false,genesis="EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG";
const reserveLib=load("apps/api/src/lib/launch-reserve.ts",{}),reserveProgram=web3.Keypair.generate().publicKey;
const connection={
 getGenesisHash:async()=>genesis,getAccountInfo:async()=>({executable:true}),
 getLatestBlockhash:async()=>({blockhash:web3.Keypair.generate().publicKey.toBase58(),lastValidBlockHeight:300}),
 getAddressLookupTable:async()=>({value:table}),getBalance:async()=>10000000000,
 simulateTransaction:async tx=>{
   const instructions=web3.TransactionMessage.decompile(tx.message,{addressLookupTableAccounts:[table]}).instructions;
   const disc=require('node:crypto').createHash('sha256').update('global:buy_v2').digest().subarray(0,8);
   const buy=instructions.find(i=>i.data.subarray(0,8).equals(disc));
   assert.equal(buy?.data.readBigUInt64LE(8)??0n,amount,'Exact output cap must be encoded in the on-chain instruction');
   assert(tx.message.staticAccountKeys[0].equals(payer.publicKey));
   const m=Buffer.alloc(82);m.writeBigUInt64LE(BigInt(global.tokenTotalSupply.toString()),36);m[44]=6;
   const a=Buffer.alloc(165);mint.publicKey.toBuffer().copy(a,0);payer.publicKey.toBuffer().copy(a,32);a.writeBigUInt64LE(tamper?amount+1n:reserveMode?amount-amount/2n:amount,64);
   let extra=[];
   if(reserveMode){
    const deposit=reserveLib.reserveDeposit(reserveProgram,payer.publicKey,mint.publicKey,amount);
    const ix=instructions.at(-1);assert(ix.programId.equals(reserveProgram));assert(ix.data.equals(deposit.instruction.data),'Deposit is encoded after the buy in the same transaction');
    const v=Buffer.alloc(165);mint.publicKey.toBuffer().copy(v);deposit.reserve.toBuffer().copy(v,32);v.writeBigUInt64LE(reserveTamper?amount/2n-1n:amount/2n,64);
    extra=[{owner:token2022.toBase58(),data:[v.toString('base64'),'base64']}];
   }
   return {value:{err:null,accounts:[{lamports:9900000000},{owner:token2022.toBase58(),data:[m.toString('base64'),'base64']},amount?{owner:token2022.toBase58(),data:[a.toString('base64'),'base64']}:null,...extra]}};
 },
};
const env={PUMP_LOOKUP_TABLE:web3.Keypair.generate().publicKey.toBase58()};
const {buildLaunch}=load('apps/api/src/lib/launch-builder.ts',{'./launch-reserve.js':load('apps/api/src/lib/launch-reserve.ts',{}),'@mention/shared':shared,'./money.js':{connection},'../env.js':{env},'./pump-sdk.js':{...sdk,OnlinePumpSdk:Online}});
(async()=>{
 await assert.rejects(buildLaunch({mint,payer:payer.publicKey,creator,name:"Battle",ticker:"BTL",uri:"https://example.invalid",mode:"battle",quoteAsset:"SOL",devBuyBps:200}),/unavailable until escrow/);
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

 reserveMode=true;amount=20000000000000n;
 const reserveArgs={mint,payer:payer.publicKey,creator,name:'Reserve test',ticker:'RSRV',uri:'https://example.invalid/test',mode:'battle',quoteAsset:'SOL',devBuyBps:200,devnetReserveProgram:reserveProgram};
 const reserveIxs=await sdk.PUMP_SDK.createV2AndBuyV2Instructions({mint:mint.publicKey,user:payer.publicKey,creator,name:reserveArgs.name,symbol:reserveArgs.ticker,uri:reserveArgs.uri,mayhemMode:false,holderReward:false,quoteMint:new web3.PublicKey(shared.LAUNCH_PAIRS[0].mint),quoteTokenProgram:tokenProgram,global,amount:new BN(amount.toString()),quoteAmount:new BN('1000000000'),slippage:0});
 reserveIxs.push(reserveLib.reserveDeposit(reserveProgram,payer.publicKey,mint.publicKey,amount).instruction);
 const reserveAddresses=[...new Map(reserveIxs.flatMap(i=>[i.programId,...i.keys.map(k=>k.pubkey)]).map(k=>[k.toBase58(),k])).values()];
 table=new web3.AddressLookupTableAccount({key:new web3.PublicKey(env.PUMP_LOOKUP_TABLE),state:{deactivationSlot:18446744073709551615n,lastExtendedSlot:1,lastExtendedSlotStartIndex:0,addresses:reserveAddresses}});
 const result=await buildLaunch(reserveArgs);assert.equal(result.reserveTokenUnits,'10000000000000');assert.equal(result.developerRetainedUnits,'10000000000000');assert.equal(result.devBuyTokenUnits,'20000000000000');
 assert.equal(shared.battleReserveSplit(amount).reserve.toString(),result.reserveTokenUnits);
 reserveTamper=true;await assert.rejects(buildLaunch(reserveArgs),/50% split/);reserveTamper=false;
 genesis='mainnet';await assert.rejects(buildLaunch(reserveArgs),/DEVNET ONLY/);
 assert.throws(()=>reserveLib.reserveDeposit(reserveProgram,payer.publicKey,mint.publicKey,1n),/at least 2/);
 console.log('PASS: atomic reserve instruction ordering, exact 50/50 simulated split, tampered vault rejection and mainnet guard');
 assert.equal(new Set(shared.LAUNCH_PAIRS.map(p=>p.mint)).size,shared.LAUNCH_PAIRS.length);
 console.log('PASS: 2% boundaries, fair-start rules, pair/mode restrictions, exact-output SDK instructions, quote mints, partial signing, transaction size with lookup table, simulated cap enforcement. No RPC or funds used.');
})().catch(e=>{console.error(e);process.exitCode=1});

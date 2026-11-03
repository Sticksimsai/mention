// Explicit devnet-only rehearsal. Uses the production builder and real RPC simulations.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{createRequire}=require('node:module');
const r=createRequire(path.resolve('apps/api/package.json')),ts=r('typescript'),web3=r('@solana/web3.js'),sdk=r('@pump-fun/pump-sdk'),BN=r('bn.js');
function load(file,mocks={}){const module={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,{module,exports:module.exports,require:n=>mocks[n]??r(n),Buffer,console});return module.exports;}
// Serialize RPC requests and back off rate-limited reads; sends are never retried here.
let rpcQueue=Promise.resolve();
function pacedFetch(u,o){
 const task=rpcQueue.then(async()=>{
  const method=JSON.parse(o.body).method;
  for(let attempt=0;;attempt++){
   await new Promise(resolve=>setTimeout(resolve,1200));
   const response=await fetch(u,{...o,signal:AbortSignal.timeout(20000)});
   if(response.status!==429||method==='sendTransaction'||attempt>=5)return response;
   await response.text();
   console.log('RPC rate limit; pausing before read retry');
   await new Promise(resolve=>setTimeout(resolve,Math.min(30000,2000*2**attempt)));
  }
 });
 rpcQueue=task.then(()=>undefined,()=>undefined);return task;
}
(async()=>{
 if(process.env.RUN_DEVNET_TESTS!=='true')throw Error('Set RUN_DEVNET_TESTS=true to run the test-only rehearsal');
 const c=new web3.Connection(process.env.DEVNET_RPC_URL||'https://api.devnet.solana.com',{commitment:'confirmed',disableRetryOnRateLimit:true,fetch:pacedFetch});
 if(await c.getGenesisHash()!=='EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG')throw Error('DEVNET ONLY: wrong genesis');
 const {payer,dir}=require('./local-state.cjs').context(web3.Keypair);
 const balance=await c.getBalance(payer.publicKey);if(balance<1e9)throw Error(`Need at least 1 test SOL on devnet at ${payer.publicKey.toBase58()}. Never send mainnet SOL.`);
 const mode=process.env.DEVNET_LAUNCH_MODE||'creator';if(!['fair','creator','reserve'].includes(mode))throw Error('Devnet rehearsal supports fair, creator or reserve mode');const bps=mode==='fair'?0:200;const test=mode==='fair'?'fair-no-buy':mode==='reserve'?'reserve-half-of-dev-buy':'creator-2-percent';
 const reserveLib=load('apps/api/src/lib/launch-reserve.ts');
 const reserveProgram=mode==='reserve'?new web3.PublicKey(fs.readFileSync('contracts/mention-escrow/program-id.txt','utf8').trim()):undefined;
 const file=path.join(dir,'launch-evidence.json'),evidence=fs.existsSync(file)?JSON.parse(fs.readFileSync(file)):[];
 const record=event=>{evidence.push({...event,at:new Date().toISOString()});fs.writeFileSync(file,JSON.stringify(evidence,null,2));};
 async function send(instructions){const bh=await c.getLatestBlockhash();const tx=new web3.Transaction({...bh,feePayer:payer.publicKey}).add(...instructions);tx.sign(payer);return submit(tx.serialize());}
 async function submit(bytes){const tx=web3.VersionedTransaction.deserialize(bytes);const sig=load('apps/api/src/lib/money.ts',{'@mention/db':{},'./db.js':{},'../env.js':{env:{SOLANA_RPC_URL:'https://api.devnet.solana.com'}},'./crypto.js':{}}).base58(tx.signatures[0]);record({signature:sig,status:'signed-before-send'});await c.sendRawTransaction(bytes,{skipPreflight:false,maxRetries:3});for(let n=0;n<90;n++){const s=(await c.getSignatureStatuses([sig],{searchTransactionHistory:true})).value[0];if(s?.err)throw Error('Devnet transaction failed: '+sig);if(s?.confirmationStatus==='confirmed'||s?.confirmationStatus==='finalized'){record({signature:sig,status:'confirmed'});return sig;}await new Promise(r=>setTimeout(r,1000));}throw Error('Unknown confirmation. Reconcile saved signature before rerunning: '+sig);}
 if(evidence.some(e=>e.status==='signed-before-send'&&!evidence.some(x=>x.signature===e.signature&&x.status==='confirmed')))throw Error('An earlier signature needs reconciliation; refusing a fresh attempt');
 if(evidence.some(e=>e.test===test&&e.passed))throw Error('Rehearsal already completed; inspect saved evidence before creating another token');
 const shared=load('packages/shared/src/index.ts'),online=new sdk.OnlinePumpSdk(c),mint=web3.Keypair.generate(),quoteMint=new web3.PublicKey(shared.LAUNCH_PAIRS.find(p=>p.id==='SOL').mint);
 fs.writeFileSync(path.join(dir,`launch-${mode}-mint.json`),JSON.stringify([...mint.secretKey]),{mode:0o600});
 const [global,feeConfig,quoteControl,resolved,quoteTransferFee]=await Promise.all([online.fetchGlobal(),online.fetchFeeConfig(),online.fetchQuoteControl(),online.resolveQuoteMint(quoteMint),online.fetchQuoteTransferFee(quoteMint)]);
 const amount=new BN(shared.devBuyUnits(BigInt(global.tokenTotalSupply.toString()),bps).toString());
 const quote=amount.isZero()?new BN(0):sdk.getBuySolAmountFromTokenAmount({global,feeConfig,quoteControl,quoteTransferFee,quoteMint,mintSupply:global.tokenTotalSupply,bondingCurve:null,amount});
 const uri='https://getmentions.xyz/devnet/metadata.json';const meta=await fetch(uri);if(!meta.ok||!(await meta.json()).name)throw Error('Test metadata is not published yet');
 const args={mint,user:payer.publicKey,payer:payer.publicKey,creator:payer.publicKey,name:'Mentions Devnet Rehearsal',ticker:'MTEST',symbol:'MTEST',uri,mayhemMode:false,holderReward:false,quoteMint,quoteTokenProgram:resolved.quoteTokenProgram};
 const ixs=amount.isZero()?[await sdk.PUMP_SDK.createV2Instruction({...args,mint:mint.publicKey})]:await sdk.PUMP_SDK.createV2AndBuyV2Instructions({...args,mint:mint.publicKey,global,amount,quoteAmount:quote.muln(101).addn(99).divn(100),slippage:0});
 const deposit=reserveProgram?reserveLib.reserveDeposit(reserveProgram,payer.publicKey,mint.publicKey,BigInt(amount.toString())):null;
 if(deposit)ixs.push(deposit.instruction);
 const addresses=[...new Map(ixs.flatMap(ix=>[ix.programId,...ix.keys.map(k=>k.pubkey)]).map(k=>[k.toBase58(),k])).values()];
 const [create,table]=web3.AddressLookupTableProgram.createLookupTable({authority:payer.publicKey,payer:payer.publicKey,recentSlot:await c.getSlot('finalized')});await send([create]);
 for(let i=0;i<addresses.length;i+=20)await send([web3.AddressLookupTableProgram.extendLookupTable({lookupTable:table,authority:payer.publicKey,payer:payer.publicKey,addresses:addresses.slice(i,i+20)})]);
 const lookup=(await c.getAddressLookupTable(table)).value;if(!lookup)throw Error('Devnet lookup table unavailable');
 for(let i=0;i<20&&(await c.getSlot())<=lookup.state.lastExtendedSlot;i++)await new Promise(r=>setTimeout(r,500));
 if((await c.getSlot())<=lookup.state.lastExtendedSlot)throw Error('Lookup table has not activated yet; no launch submitted');
 const env={PUMP_LOOKUP_TABLE:table.toBase58()};
 const {buildLaunch}=load('apps/api/src/lib/launch-builder.ts',{'./launch-reserve.js':reserveLib,'./pump-sdk.js':sdk,'@mention/shared':shared,'./money.js':{connection:c},'../env.js':{env}});
 const built=await buildLaunch({...args,mint,mode:mode==='reserve'?'battle':mode,devnetReserveProgram:reserveProgram,quoteAsset:'SOL',devBuyBps:bps});
 const tx=web3.VersionedTransaction.deserialize(Buffer.from(built.transaction,'base64'));tx.sign([payer]);const signature=await submit(tx.serialize());
 const tokenProgram=new web3.PublicKey('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb');const ata=sdk.quoteAta(payer.publicKey,mint.publicKey,tokenProgram);
 const received=(await c.getAccountInfo(ata))?BigInt((await c.getTokenAccountBalance(ata)).value.amount):0n,supply=BigInt((await c.getTokenSupply(mint.publicKey)).value.amount);
 const reserved=deposit?BigInt((await c.getTokenAccountBalance(deposit.vault)).value.amount):0n;
 if(deposit){const account=await c.getAccountInfo(deposit.vault);reserveLib.verifyReserveVault(account?{owner:account.owner.toBase58(),data:[account.data.toString('base64'),'base64']}:null,mint.publicKey,deposit.reserve,deposit.amount);}
 if(received+reserved!==shared.devBuyUnits(supply,bps))throw Error('On-chain developer buy differs from reviewed amount');
 record({test,passed:true,...(deposit?{reserve:deposit.reserve.toBase58(),reserveVault:deposit.vault.toBase58(),reserveUnits:reserved.toString()}:{}),signature,mint:mint.publicKey.toBase58(),receivedUnits:received.toString(),supplyUnits:supply.toString(),lookupTable:table.toBase58()});
 console.log(JSON.stringify(evidence.at(-1),null,2));
})().catch(e=>{console.error(e.message);process.exitCode=1});

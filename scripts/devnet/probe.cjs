const {createRequire}=require('node:module'),path=require('node:path');
const r=createRequire(path.resolve('apps/api/package.json'));
const {Connection,PublicKey}=r('@solana/web3.js');
const {OnlinePumpSdk}=r('@pump-fun/pump-sdk');
(async()=>{
 const rpc=process.env.DEVNET_RPC_URL||'https://api.devnet.solana.com';
 const c=new Connection(rpc,{commitment:'confirmed',disableRetryOnRateLimit:true,fetch:(u,o)=>fetch(u,{...o,signal:AbortSignal.timeout(20000)})});
 const genesis=await c.getGenesisHash();
 if(genesis!=='EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG')throw Error('Refusing unexpected genesis: '+genesis);
 const pump=new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');
 const program=await c.getAccountInfo(pump);
 const sdk=new OnlinePumpSdk(c);
 const checks={genesis,pumpExecutable:program?.executable??false,slot:await c.getSlot()};
 for(const method of ['fetchGlobal','fetchFeeConfig','fetchQuoteControl']){
  try{const value=await sdk[method]();checks[method]=method==='fetchGlobal'?{ok:true,createV2Enabled:value.createV2Enabled,holderRewards:value.isHolderRewardEnabled,supply:value.tokenTotalSupply.toString()}:{ok:true};}
  catch(e){checks[method]={ok:false,error:e.message.slice(0,200)};}
 }
 console.log(JSON.stringify(checks,null,2));
 if(!checks.pumpExecutable||!checks.fetchGlobal.ok||!checks.fetchQuoteControl.ok)process.exitCode=1;
})().catch(e=>{console.error(e.message);process.exitCode=1});

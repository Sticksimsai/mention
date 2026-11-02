// Read-only preflight. Funding and key custody stay with the user.
const path=require('node:path'),{createRequire}=require('node:module');
const r=createRequire(path.resolve('contracts/harness/package.json')),{Connection,Keypair}=r('@solana/web3.js');
(async()=>{
 const {payer}=require('./local-state.cjs').context(Keypair);
 const c=new Connection(process.env.DEVNET_RPC_URL||'https://api.devnet.solana.com',{commitment:'confirmed',disableRetryOnRateLimit:true,fetch:(u,o)=>fetch(u,{...o,signal:AbortSignal.timeout(20000)})});
 if(await c.getGenesisHash()!=='EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG')throw Error('DEVNET ONLY');
 console.log(JSON.stringify({network:'devnet',payer:payer.publicKey.toBase58(),balanceLamports:await c.getBalance(payer.publicKey),note:'Read-only. No airdrop or transaction requested.'},null,2));
})().catch(e=>{console.error(e.message);process.exitCode=1});

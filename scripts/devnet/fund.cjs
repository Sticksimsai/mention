const fs=require('node:fs'),path=require('node:path'),{createRequire}=require('node:module');
const r=createRequire(path.resolve('apps/api/package.json')),{Connection,Keypair}=r('@solana/web3.js');
(async()=>{
 const c=new Connection(process.env.DEVNET_RPC_URL||'https://api.devnet.solana.com',{commitment:'confirmed',disableRetryOnRateLimit:true,fetch:(u,o)=>fetch(u,{...o,signal:AbortSignal.timeout(20000)})});
 if(await c.getGenesisHash()!=='EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG')throw Error('DEVNET ONLY');
 fs.mkdirSync('qa/devnet-private',{recursive:true});const file='qa/devnet-private/payer.json';
 const k=fs.existsSync(file)?Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(file)))):Keypair.generate();
 if(!fs.existsSync(file))fs.writeFileSync(file,JSON.stringify([...k.secretKey]),{mode:0o600});
 const balance=await c.getBalance(k.publicKey);console.log(JSON.stringify({devnetPayer:k.publicKey.toBase58(),balanceLamports:balance}));
 if(balance<2e9){const sig=await c.requestAirdrop(k.publicKey,2e9);console.log(JSON.stringify({airdropSignature:sig}));}
})().catch(e=>{console.error(e.message);process.exitCode=1});

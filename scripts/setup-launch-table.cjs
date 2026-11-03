// Creates infrastructure only: never mints, buys, transfers tokens or launches a coin.
// Default is a read-only quote. --execute requires a local signing key and explicit budget.
const fs=require('node:fs'),path=require('node:path'),{createRequire}=require('node:module');
const r=createRequire(path.resolve(__dirname,'../apps/api/package.json'));
const {Connection,PublicKey,Keypair,AddressLookupTableProgram,Transaction,TransactionMessage}=r('@solana/web3.js');
const {OnlinePumpSdk,PUMP_SDK}=r('@pump-fun/pump-sdk');const BN=r('bn.js');
const MAINNET='5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';
(async()=>{
 const execute=process.argv.includes('--execute');
 const keyPath=process.env.MAINNET_KEYPAIR;
 const signer=execute?Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(keyPath||'', 'utf8')))):null;
 const payer=signer?.publicKey||new PublicKey(process.env.SETUP_WALLET||'11111111111111111111111111111111');
 const c=new Connection(process.env.SOLANA_RPC_URL||'https://api.mainnet-beta.solana.com',{commitment:'finalized',disableRetryOnRateLimit:true});
 const genesis=await c.getGenesisHash();
 if(genesis!==MAINNET)throw Error('Expected Solana MAINNET; RPC returned genesis '+genesis+'. No transaction sent.');
 const sdk=new OnlinePumpSdk(c),global=await sdk.fetchGlobal();
 const mint=Keypair.generate().publicKey;
 // Pump shared accounts are reusable across launches. Include both create and buy paths.
 const quoteMint=new PublicKey('So11111111111111111111111111111111111111112');
 const {quoteTokenProgram}=await sdk.resolveQuoteMint(quoteMint);
 const ixs=await PUMP_SDK.createV2AndBuyV2Instructions({mint,user:payer,creator:payer,name:'Infrastructure size check',symbol:'CHECK',uri:'https://getmentions.xyz/',mayhemMode:false,holderReward:true,quoteMint,quoteTokenProgram,global,amount:new BN(1),quoteAmount:new BN(1000000),slippage:0});
 const addresses=[...new Map(ixs.flatMap(i=>[i.programId,...i.keys.filter(k=>!k.isSigner).map(k=>k.pubkey)]).map(k=>[k.toBase58(),k])).values()].filter(k=>!k.equals(mint)&&!k.equals(payer));
 const rent=await c.getMinimumBalanceForRentExemption(56+32*addresses.length);
 const estimate=rent+50000;
 console.log(JSON.stringify({network:'mainnet',payer:payer.toBase58(),addressCount:addresses.length,rentLamports:rent,estimatedMaximumLamports:estimate,action:'Create reusable launch address lookup table only',execute},null,2));
 if(!execute){console.log('Read-only quote. To create: set MAINNET_KEYPAIR to a local keypair path, SETUP_MAX_LAMPORTS to your approved maximum, and rerun with --execute. Never paste keys into chat.');return;}
 if(!keyPath||!path.isAbsolute(keyPath))throw Error('MAINNET_KEYPAIR must be an absolute local path');
 const cap=Number(process.env.SETUP_MAX_LAMPORTS);
 if(!Number.isSafeInteger(cap)||cap<estimate||cap>10000000)throw Error('Set SETUP_MAX_LAMPORTS to an approved amount covering the quote, at most 10000000 (0.01 SOL)');
 if(await c.getBalance(payer)<estimate)throw Error('Setup wallet lacks SOL for the quoted cost');
 const statePath=process.env.SETUP_STATE_PATH||path.join(path.dirname(keyPath),'mentions-mainnet-lookup.json');
 // A prior run must be reconciled, never silently repeated after an ambiguous send.
 if(fs.existsSync(statePath))throw Error('Setup state already exists at '+statePath+'. Inspect saved signatures/table before rerunning.');
 const [create,table]=AddressLookupTableProgram.createLookupTable({authority:payer,payer,recentSlot:await c.getSlot('finalized')});
 const state={network:'mainnet',table:table.toBase58(),payer:payer.toBase58(),addresses:addresses.map(a=>a.toBase58()),transactions:[],complete:false};
 const save=()=>fs.writeFileSync(statePath,JSON.stringify(state,null,2),{mode:0o600});save();
 async function send(instructions){
  const bh=await c.getLatestBlockhash('finalized');const tx=new Transaction({...bh,feePayer:payer}).add(...instructions);tx.sign(signer);
  const bytes=tx.serialize();
  // Persist exact signed bytes before submission for safe reconciliation/rebroadcast.
  const row={bytes:bytes.toString('base64'),status:'signed-before-send'};state.transactions.push(row);save();
  const signature=await c.sendRawTransaction(bytes,{skipPreflight:false,maxRetries:2});row.signature=signature;save();
  const confirmation=await c.confirmTransaction({...bh,signature},'finalized');if(confirmation.value.err)throw Error('Setup transaction failed: '+signature);
  row.status='finalized';save();console.log('Finalized setup transaction:',signature);
 }
 await send([create]);
 for(let i=0;i<addresses.length;i+=20)await send([AddressLookupTableProgram.extendLookupTable({lookupTable:table,authority:payer,payer,addresses:addresses.slice(i,i+20)})]);
 const account=(await c.getAddressLookupTable(table)).value;
 if(!account?.isActive()||!addresses.every(k=>account.state.addresses.some(a=>a.equals(k))))throw Error('Table verification failed; retain setup state');
 state.complete=true;save();
 console.log('Verified. Set PUMP_LOOKUP_TABLE on mention-api to: '+table.toBase58());
 console.log('This table covers shared SOL launch accounts. Other quote assets must still pass preparation simulation and transaction-size checks.');
})().catch(e=>{console.error(e.message);process.exitCode=1});

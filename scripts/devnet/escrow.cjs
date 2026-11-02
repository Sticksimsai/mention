// Public DEVNET ONLY. Synthetic volume totals exercise settlement, not the live oracle.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{createRequire}=require('node:module');
const r=createRequire(path.resolve('contracts/harness/package.json'));
const {Connection,PublicKey,Keypair,Transaction,SystemProgram,ComputeBudgetProgram}=r('@solana/web3.js');
const spl=r('@solana/spl-token'),client=require('../../contracts/harness/client.cjs');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const base58=bytes=>{let n=BigInt('0x'+Buffer.from(bytes).toString('hex')),s='',alphabet='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';while(n){s=alphabet[Number(n%58n)]+s;n/=58n}for(const b of bytes){if(b)break;s='1'+s}return s};
(async()=>{
 if(process.env.RUN_DEVNET_TESTS!=='true')throw Error('Set RUN_DEVNET_TESTS=true');
 const c=new Connection(process.env.DEVNET_RPC_URL||'https://api.devnet.solana.com',{commitment:'confirmed',disableRetryOnRateLimit:true,fetch:(u,o)=>fetch(u,{...o,signal:AbortSignal.timeout(20000)})});
 if(await c.getGenesisHash()!=='EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG')throw Error('DEVNET ONLY');
 const program=new PublicKey(fs.readFileSync('contracts/mention-escrow/program-id.txt','utf8').trim());
 if(!(await c.getAccountInfo(program))?.executable)throw Error('Development escrow is not deployed');
 const {payer,dir}=require('./local-state.cjs').context(Keypair);
 if(await c.getBalance(payer.publicKey)<100000000)throw Error('Need at least 0.1 devnet SOL for test accounts and transaction fees');
 const file=path.join(dir,'escrow-evidence.json');if(fs.existsSync(file))throw Error('A prior public-devnet run exists. Reconcile its signatures and claims before starting another round.');
 const opponent=Keypair.generate(),oracle=Keypair.generate(),mintA=Keypair.generate(),mintB=Keypair.generate();
 fs.writeFileSync(path.join(dir,'escrow-actors.json'),JSON.stringify({opponent:[...opponent.secretKey],oracle:[...oracle.secretKey],mintA:[...mintA.secretKey],mintB:[...mintB.secretKey]}),{mode:0o600});
 const events=[];const record=event=>{events.push({...event,at:new Date().toISOString()});fs.writeFileSync(file,JSON.stringify(events,null,2))};
 async function send(label,ixs,signers=[]){const bh=await c.getLatestBlockhash();const tx=new Transaction({...bh,feePayer:payer.publicKey}).add(ComputeBudgetProgram.setComputeUnitLimit({units:600000}),...ixs);tx.sign(payer,...signers);const bytes=tx.serialize(),signature=base58(tx.signature);record({label,signature,status:'signed-before-send'});await c.sendRawTransaction(bytes,{skipPreflight:false,maxRetries:3});for(let i=0;i<90;i++){const s=(await c.getSignatureStatuses([signature],{searchTransactionHistory:true})).value[0];if(s?.err)throw Error('Transaction failed; inspect '+signature);if(s?.confirmationStatus==='confirmed'||s?.confirmationStatus==='finalized'){record({label,signature,status:'confirmed'});return signature}await sleep(1000)}throw Error('Unknown confirmation. Reconcile '+signature+' before rerunning');}
 const tokenA=spl.TOKEN_PROGRAM_ID,tokenB=spl.TOKEN_2022_PROGRAM_ID;
 const sourceA=spl.getAssociatedTokenAddressSync(mintA.publicKey,payer.publicKey,false,tokenA),sourceB=spl.getAssociatedTokenAddressSync(mintB.publicKey,opponent.publicKey,false,tokenB),destAB=spl.getAssociatedTokenAddressSync(mintB.publicKey,payer.publicKey,false,tokenB);
 const rent=await c.getMinimumBalanceForRentExemption(spl.MINT_SIZE);
 for(const [label,mint,token,owner,ata] of [['mint-a',mintA,tokenA,payer.publicKey,sourceA],['mint-b',mintB,tokenB,opponent.publicKey,sourceB]])await send(label,[SystemProgram.createAccount({fromPubkey:payer.publicKey,newAccountPubkey:mint.publicKey,space:spl.MINT_SIZE,lamports:rent,programId:token}),spl.createInitializeMint2Instruction(mint.publicKey,6,payer.publicKey,null,token),spl.createAssociatedTokenAccountIdempotentInstruction(payer.publicKey,ata,owner,mint.publicKey,token),spl.createMintToInstruction(mint.publicKey,ata,payer.publicKey,1000000n,[],token)],[mint]);
 await send('winner-b-token-account',[spl.createAssociatedTokenAccountIdempotentInstruction(payer.publicKey,destAB,payer.publicKey,mintB.publicKey,tokenB)]);
 const chainTime=await c.getBlockTime(await c.getSlot());if(chainTime===null)throw Error('Devnet clock unavailable');
 const terms={ownerA:payer.publicKey,ownerB:opponent.publicKey,beneficiaryA:payer.publicKey,beneficiaryB:opponent.publicKey,oracle:oracle.publicKey,poolA:Keypair.generate().publicKey,poolB:Keypair.generate().publicKey,mintA:mintA.publicKey,mintB:mintB.publicKey,sourceA,sourceB,tokenA,tokenB,nonce:crypto.randomBytes(32),rulesHash:crypto.createHash('sha256').update('DEVNET SYNTHETIC VOLUME TEST ONLY').digest(),amountA:100n,amountB:200n,start:Math.ceil((chainTime+120)/60)*60,duration:600};
 const round=client.initialize(program,terms),unmatched=client.initialize(program,{...terms,nonce:crypto.randomBytes(32)});
 record({label:'rounds',funded:round.round.toBase58(),unmatched:unmatched.round.toBase58(),start:terms.start,end:terms.start+600,refundDeadline:terms.start+1500,oracle:oracle.publicKey.toBase58(),note:'Synthetic volume evidence; test tokens have no value'});
 await send('initialize-funded',[round.ix]);await send('accept',[client.accept(program,round,terms)],[opponent]);await send('initialize-unmatched',[unmatched.ix]);
 async function until(timestamp){for(let i=0;i<240;i++){const t=await c.getBlockTime(await c.getSlot());if(t!==null&&t>=timestamp)return;await sleep(5000)}throw Error('Clock wait timed out; reconcile existing round instead of starting another');}
 await until(terms.start);await send('expire-unmatched',[client.expire(program,unmatched)]);await send('refund-unmatched',[client.claim(program,unmatched,terms,0,sourceA)]);
 await until(terms.start+600);await send('settle-synthetic-a-wins',[client.settle(program,round,oracle.publicKey,2n,1n,true,crypto.createHash('sha256').update('DEVNET FIXTURE A=2 B=1').digest())],[oracle]);
 await send('claim-a',[client.claim(program,round,terms,0,sourceA)]);await send('claim-b',[client.claim(program,round,terms,1,destAB)]);
 const a=(await c.getTokenAccountBalance(sourceA)).value.amount,b=(await c.getTokenAccountBalance(destAB)).value.amount;
 if(a!=='1000000'||b!=='200')throw Error('Final token balances do not match expected test payouts');record({label:'completed',passed:true,network:'devnet',balanceA:a,balanceB:b});console.log(JSON.stringify(events.at(-1),null,2));
})().catch(e=>{console.error(e.message);process.exitCode=1});

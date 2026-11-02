// Resume existing DEVNET fixture. --test-unmatched explicitly adds missing refund coverage.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{createRequire}=require('node:module');
const r=createRequire(path.resolve('contracts/harness/package.json'));
const {Connection,PublicKey,Keypair,Transaction,ComputeBudgetProgram,SYSVAR_CLOCK_PUBKEY}=r('@solana/web3.js');
const spl=r('@solana/spl-token'),client=require('../../contracts/harness/client.cjs'),{decode}=require('./round-state.cjs');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const base58=bytes=>{let n=BigInt('0x'+Buffer.from(bytes).toString('hex')),s='',alphabet='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';while(n){s=alphabet[Number(n%58n)]+s;n/=58n}for(const b of bytes){if(b)break;s='1'+s}return s};
(async()=>{
 if(process.env.RUN_DEVNET_TESTS!=='true')throw Error('Set RUN_DEVNET_TESTS=true');
 const {payer,dir}=require('./local-state.cjs').context(Keypair);
 const lock=path.join(dir,'escrow-recovery.lock');const fd=fs.openSync(lock,'wx',0o600);fs.closeSync(fd);
 try {
 const file=path.join(dir,'escrow-evidence.json'),events=JSON.parse(fs.readFileSync(file,'utf8'));
 const record=event=>{events.push({...event,at:new Date().toISOString()});const tmp=file+'.tmp';fs.writeFileSync(tmp,JSON.stringify(events,null,2),{mode:0o600});fs.renameSync(tmp,file)};
 // Throttle requests; retry rate-limited reads only. Never blindly retry a send.
 const c=new Connection(process.env.DEVNET_RPC_URL||'https://api.devnet.solana.com',{commitment:'confirmed',disableRetryOnRateLimit:true,fetch:async(u,o)=>{
 const method=JSON.parse(o.body).method;for(let i=0;;i++){await sleep(1200);const response=await fetch(u,{...o,signal:AbortSignal.timeout(20000)});if(response.status!==429||method==='sendTransaction'||i>=5)return response;await response.text();console.log('RPC rate limit; pausing before read retry');await sleep(Math.min(30000,2000*2**i));}
 }});
 if(await c.getGenesisHash()!=='EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG')throw Error('DEVNET ONLY');
 const pending=events.filter(e=>e.status==='signed-before-send'&&!events.some(x=>x.signature===e.signature&&x.status==='confirmed'));
 for(const e of pending){const s=(await c.getSignatureStatuses([e.signature],{searchTransactionHistory:true})).value[0];if(!s||!['confirmed','finalized'].includes(s.confirmationStatus)||s.err)throw Error('Unresolved or failed signature: '+e.signature+'; no replacement sent');record({label:e.label,signature:e.signature,status:'confirmed',reconciled:true});}
 const saved=events.find(e=>e.label==='rounds');if(!saved)throw Error('No round addresses recorded; manual setup reconciliation required');
 const program=new PublicKey(fs.readFileSync('contracts/mention-escrow/program-id.txt','utf8').trim());
 const actors=JSON.parse(fs.readFileSync(path.join(dir,'escrow-actors.json'),'utf8'));
 const actor=k=>Keypair.fromSecretKey(Uint8Array.from(actors[k]));
 const opponent=actor('opponent'),oracle=actor('oracle'),mintA=actor('mintA'),mintB=actor('mintB');
 async function state(address){const account=await c.getAccountInfo(address);if(!account)return null;if(!account.owner.equals(program))throw Error('Wrong round owner');const t=decode(account.data,PublicKey);
 for(const [actual,expected] of [[t.ownerA,payer.publicKey],[t.ownerB,opponent.publicKey],[t.oracle,oracle.publicKey],[t.mintA,mintA.publicKey],[t.mintB,mintB.publicKey],[t.beneficiaryA,payer.publicKey],[t.beneficiaryB,opponent.publicKey]])if(!actual.equals(expected))throw Error('Round does not match saved test identities');
 if(!t.rulesHash.equals(crypto.createHash('sha256').update('DEVNET SYNTHETIC VOLUME TEST ONLY').digest()))throw Error('Not the synthetic test round');
 if(!client.roundAddress(program,t.ownerA,t.nonce).equals(address))throw Error('Round PDA mismatch');
 for(const [mint,token,vault] of [[t.mintA,t.tokenA,t.vaultA],[t.mintB,t.tokenB,t.vaultB]])if(!spl.getAssociatedTokenAddressSync(mint,address,true,token).equals(vault))throw Error('Vault mismatch');
 return {...t,round:address};}
 async function now(){const a=await c.getAccountInfo(SYSVAR_CLOCK_PUBKEY);if(!a||a.data.length<40)throw Error('Missing clock');return Number(a.data.readBigInt64LE(32));}
 async function send(label,instructions,signers=[]){const bh=await c.getLatestBlockhash();const tx=new Transaction({...bh,feePayer:payer.publicKey}).add(ComputeBudgetProgram.setComputeUnitLimit({units:600000}),...instructions);tx.sign(payer,...signers);const signature=base58(tx.signature);record({label,signature,status:'signed-before-send'});await c.sendRawTransaction(tx.serialize(),{skipPreflight:false,maxRetries:0});for(let i=0;i<60;i++){const s=(await c.getSignatureStatuses([signature],{searchTransactionHistory:true})).value[0];if(s?.err)throw Error('Failed transaction: '+signature);if(s&&['confirmed','finalized'].includes(s.confirmationStatus)){record({label,signature,status:'confirmed'});console.log('Confirmed '+label);return;}await sleep(2000)}throw Error('Unknown confirmation: '+signature);}

 // Opt-in missing coverage test. Persist nonce/terms before sending, and reuse on retry.
 let unmatchedPlan=events.find(e=>e.label==='unmatched-test-plan');
 if(process.argv.includes('--test-unmatched')){
 const original=await state(new PublicKey(saved.unmatched));
 if(original)throw Error('Original unmatched round exists; recover it without --test-unmatched first');
 const funded=await state(new PublicKey(saved.funded));
 if(!funded||!funded.claimedA||(funded.fundedB&&!funded.claimedB))throw Error('Recover funded round before starting missing coverage test');
 const sourceA=spl.getAssociatedTokenAddressSync(funded.mintA,payer.publicKey,false,funded.tokenA);
 if(!unmatchedPlan){
 const nonce=crypto.randomBytes(32),start=Math.ceil(((await now())+180)/60)*60;
 unmatchedPlan={label:'unmatched-test-plan',nonce:nonce.toString('hex'),round:client.roundAddress(program,payer.publicKey,nonce).toBase58(),start,balanceBefore:(await c.getTokenAccountBalance(sourceA)).value.amount};
 record(unmatchedPlan);
 }
 const address=new PublicKey(unmatchedPlan.round);
 if(!await state(address)){
 if(events.some(e=>e.label==='unmatched-test-initialize'&&e.status==='confirmed'))throw Error('Confirmed initialization account unavailable; do not repeat');
 if(await now()>unmatchedPlan.start-60)throw Error('Unsent test plan expired. Keep evidence and request reconciliation; no new round created.');
 const terms={...funded,sourceA,nonce:Buffer.from(unmatchedPlan.nonce,'hex'),start:unmatchedPlan.start,duration:600};
 const initialized=client.initialize(program,terms);
 if(!initialized.round.equals(address))throw Error('Planned address mismatch');
 await send('unmatched-test-initialize',[initialized.ix]);
 }
 }
 const unmatchedAddress=unmatchedPlan?unmatchedPlan.round:saved.unmatched;

 for(const [label,address] of [['funded',saved.funded],['unmatched',unmatchedAddress]]){
 const pk=new PublicKey(address);let t=await state(pk);if(!t){console.log(label+': never created; skipping');continue;}
 if(t.status===0){const ready=t.fundedB?t.end:t.start;while(await now()<ready){console.log(label+': waiting for on-chain deadline');await sleep(15000);}
 // A late oracle response must refund, never manufacture a winner after the deadline.
 const time=await now();if(!t.fundedB||time>=t.deadline)await send(label+'-recover-expire',[client.expire(program,t)]);
 else await send(label+'-recover-synthetic-settlement',[client.settle(program,t,oracle.publicKey,2n,1n,true,crypto.createHash('sha256').update('DEVNET FIXTURE A=2 B=1').digest())],[oracle]);
 t=await state(pk);}
 for(const side of [0,1]){t=await state(pk);if((side===0?t.claimedA:t.claimedB)||(side===1&&!t.fundedB))continue;
 const mint=side===0?t.mintA:t.mintB,token=side===0?t.tokenA:t.tokenB,recipient=t.status===1?t.beneficiaryA:t.status===2?t.beneficiaryB:side===0?t.ownerA:t.ownerB;
 const ata=spl.getAssociatedTokenAddressSync(mint,recipient,false,token);
 await send(label+'-recover-claim-'+side,[spl.createAssociatedTokenAccountIdempotentInstruction(payer.publicKey,ata,recipient,mint,token),client.claim(program,t,t,side,ata)]);}
 t=await state(pk);if(!t.claimedA||(t.fundedB&&!t.claimedB))throw Error('Incomplete claims');
 if(label==='unmatched'&&unmatchedPlan){
 if(t.status!==3||t.fundedB)throw Error('Expected unmatched refund state');
 const source=spl.getAssociatedTokenAddressSync(t.mintA,payer.publicKey,false,t.tokenA);
 const balance=(await c.getTokenAccountBalance(source)).value.amount;
 if(balance!==unmatchedPlan.balanceBefore)throw Error('Refund balance differs from pre-deposit balance');
 record({label:'unmatched-test-passed',round:address,network:'devnet',passed:true,refundedUnits:t.amountA.toString(),balanceAfter:balance});
 console.log(JSON.stringify(events.at(-1),null,2));
 }
 record({label:label+'-recovery-completed',round:address,status:t.status,claimedA:!!t.claimedA,claimedB:!!t.claimedB,network:'devnet'});console.log(JSON.stringify(events.at(-1),null,2));
 }
 console.log(events.some(e=>e.label==='unmatched-test-passed')?'Funded recovery and separate unmatched refund checks completed.':'Existing rounds recovered; omitted unmatched coverage remains pending.');
 } finally {fs.unlinkSync(lock);}
})().catch(e=>{console.error(e.message);process.exitCode=1});

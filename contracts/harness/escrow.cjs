// Runs the compiled Solana executable with signature verification and real token CPIs.
// Only fixtures and Clock are injected; escrow execution is not mocked.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {LiteSVM,FailedTransactionMetadata}=require('litesvm');
const {PublicKey,Keypair,Transaction,ComputeBudgetProgram}=require('@solana/web3.js');
const {TOKEN_PROGRAM_ID,TOKEN_2022_PROGRAM_ID,MintLayout,AccountLayout,ExtensionType,getMintLen,getAssociatedTokenAddressSync,createTransferCheckedInstruction}=require('@solana/spl-token');
const client=require('./client.cjs');
const program=new PublicKey(fs.readFileSync(path.join(__dirname,'../mention-escrow/program-id.txt'),'utf8').trim());
const binary=process.env.ESCROW_BINARY?path.resolve(process.env.ESCROW_BINARY):path.join(__dirname,'../mention-escrow/target/sbf-solana-solana/release/mention_escrow.so');
const zero=PublicKey.default;
let checks=0;
function fixture(tokenA=TOKEN_PROGRAM_ID,tokenB=TOKEN_2022_PROGRAM_ID){
 const svm=new LiteSVM();svm.addProgramFromFile(program,binary);
 const a=Keypair.generate(),b=Keypair.generate(),oracle=Keypair.generate(),stranger=Keypair.generate();
 for(const k of [a,b,oracle,stranger])svm.airdrop(k.publicKey,10000000000n);
 const mintA=Keypair.generate().publicKey,mintB=Keypair.generate().publicKey;
 function mint(address,token,freeze=false){const data=Buffer.alloc(MintLayout.span);MintLayout.encode({mintAuthorityOption:0,mintAuthority:zero,supply:1000000000n,decimals:6,isInitialized:true,freezeAuthorityOption:freeze?1:0,freezeAuthority:freeze?stranger.publicKey:zero},data);svm.setAccount(address,{lamports:10000000,owner:token,data,executable:false,rentEpoch:0});}
 function account(mint,owner,token,amount=0n){const address=Keypair.generate().publicKey,data=Buffer.alloc(AccountLayout.span);AccountLayout.encode({mint,owner,amount,delegateOption:0,delegate:zero,state:1,isNativeOption:0,isNative:0n,delegatedAmount:0n,closeAuthorityOption:0,closeAuthority:zero},data);svm.setAccount(address,{lamports:10000000,owner:token,data,executable:false,rentEpoch:0});return address;}
 mint(mintA,tokenA);mint(mintB,tokenB);
 const sourceA=account(mintA,a.publicKey,tokenA,10000n),sourceB=account(mintB,b.publicKey,tokenB,10000n);
 const destAA=account(mintA,a.publicKey,tokenA),destAB=account(mintB,a.publicKey,tokenB),destBA=account(mintA,b.publicKey,tokenA),destBB=account(mintB,b.publicKey,tokenB),badDest=account(mintA,stranger.publicKey,tokenA);
 const t={ownerA:a.publicKey,ownerB:b.publicKey,beneficiaryA:a.publicKey,beneficiaryB:b.publicKey,oracle:oracle.publicKey,poolA:Keypair.generate().publicKey,poolB:Keypair.generate().publicKey,mintA,mintB,sourceA,sourceB,tokenA,tokenB,nonce:crypto.randomBytes(32),rulesHash:crypto.randomBytes(32),amountA:100n,amountB:200n,start:120,duration:600};
 function time(now){const clock=svm.getClock();clock.unixTimestamp=BigInt(now);svm.setClock(clock);}
 time(0);
 function send(ix,signers=[],ok=true){svm.expireBlockhash();const tx=new Transaction({feePayer:a.publicKey,recentBlockhash:svm.latestBlockhash()}).add(ComputeBudgetProgram.setComputeUnitLimit({units:600000}),...(Array.isArray(ix)?ix:[ix]));tx.sign(a,...signers.filter(k=>!k.publicKey.equals(a.publicKey)));const result=svm.sendTransaction(tx);checks++;if(ok&&result instanceof FailedTransactionMetadata)throw Error(result.toString()+'\n'+result.meta().logs().join('\n'));assert.equal(result instanceof FailedTransactionMetadata,!ok);return result;}
 const balance=address=>AccountLayout.decode(Buffer.from(svm.getAccount(address).data)).amount;
 return {svm,a,b,oracle,stranger,t,mint,time,send,balance,destAA,destAB,destBA,destBB,badDest};
}
function init(f){const r=client.initialize(program,f.t);f.send(r.ix);assert.equal(f.balance(f.t.sourceA),9900n);assert.equal(f.balance(r.vaultA),100n);return r;}
for(const outcome of ['a','b','tie','incomplete']){
 const f=fixture(),r=init(f);
 f.send(client.accept(program,r,f.t,f.stranger.publicKey),[f.stranger],false);
 f.send(client.accept(program,r,f.t),[f.b]);assert.equal(f.balance(r.vaultB),200n);
 f.send(client.accept(program,r,f.t),[f.b],false);assert.equal(f.balance(f.t.sourceB),9800n);
 f.send(client.settle(program,r,f.oracle.publicKey,2n,1n),[f.oracle],false);
 f.send(client.expire(program,r),[],false);
 f.time(720);
 f.send(client.settle(program,r,f.stranger.publicKey,2n,1n),[f.stranger],false);
 const va=outcome==='b'?1n:2n,vb=outcome==='tie'?2n:outcome==='b'?2n:1n;
 f.send(client.settle(program,r,f.oracle.publicKey,va,vb,outcome!=='incomplete'),[f.oracle]);
 f.send(client.settle(program,r,f.oracle.publicKey,va,vb),[f.oracle],false);
 f.send(client.claim(program,r,f.t,0,f.badDest),[],false);
 const wrongMint=client.claim(program,r,f.t,0,f.destAA);wrongMint.keys[1].pubkey=f.t.mintB;f.send(wrongMint,[],false);
 const wrongVault=client.claim(program,r,f.t,0,f.destAA);wrongVault.keys[2].pubkey=f.t.sourceA;f.send(wrongVault,[],false);
 const da=outcome==='b'?f.destBA:f.destAA,db=outcome==='a'?f.destAB:f.destBB;
 f.send(client.claim(program,r,f.t,0,da));f.send(client.claim(program,r,f.t,1,db));
 assert.equal(f.balance(da),100n);assert.equal(f.balance(db),200n);
 f.send(client.claim(program,r,f.t,0,da),[],false);assert.equal(f.balance(da),100n);
 assert.equal(f.balance(r.vaultA),0n);assert.equal(f.balance(r.vaultB),0n);
 console.log('PASS funded settlement:',outcome);
}
{
 const f=fixture(),r=init(f);f.send(client.expire(program,r),[],false);f.time(120);
 f.send(client.accept(program,r,f.t),[f.b],false);f.send(client.expire(program,r));
 f.send(client.claim(program,r,f.t,0,f.destAA));assert.equal(f.balance(f.destAA),100n);
 f.send(client.claim(program,r,f.t,1,f.destBB),[],false);console.log('PASS unmatched round refund and funding deadline');
}
{
 const f=fixture(),r=init(f);f.send(client.accept(program,r,f.t),[f.b]);f.time(1620);
 f.send(client.settle(program,r,f.oracle.publicKey,2n,1n),[f.oracle],false);f.send(client.expire(program,r));
 f.send(client.claim(program,r,f.t,0,f.destAA));f.send(client.claim(program,r,f.t,1,f.destBB));
 assert.equal(f.balance(f.destAA),100n);assert.equal(f.balance(f.destBB),200n);console.log('PASS permissionless refund after oracle deadline');
}
{
 const f=fixture();f.t.duration=60;f.send(client.initialize(program,f.t).ix,[],false);assert.equal(f.balance(f.t.sourceA),10000n);
 f.t.duration=600;f.mint(f.t.mintA,f.t.tokenA,true);f.send(client.initialize(program,f.t).ix,[],false);console.log('PASS invalid terms and freeze authority rejected atomically');
}
{
 const f=fixture(TOKEN_2022_PROGRAM_ID,TOKEN_PROGRAM_ID);const acct=f.svm.getAccount(f.t.mintA);const data=Buffer.alloc(getMintLen([ExtensionType.TransferFeeConfig]));Buffer.from(acct.data).copy(data);data[165]=1;data.writeUInt16LE(ExtensionType.TransferFeeConfig,166);data.writeUInt16LE(data.length-170,168);f.svm.setAccount(f.t.mintA,{...acct,data});f.send(client.initialize(program,f.t).ix,[],false);assert.equal(f.balance(f.t.sourceA),10000n);console.log('PASS transfer-fee extension rejected before funds move');
}
// Reserve account fixtures use real ATAs; every tested deposit/round transfer is a token CPI.
function reserveFixture(tokenA=TOKEN_PROGRAM_ID,tokenB=TOKEN_2022_PROGRAM_ID){
 const f=fixture(tokenA,tokenB);
 for(const [side,owner,purchased] of [['A',f.a,10000n],['B',f.b,20000n]]){
  const mint=f.t['mint'+side],token=f.t['token'+side],old=f.t['source'+side];
  const ata=getAssociatedTokenAddressSync(mint,owner.publicKey,false,token),account=f.svm.getAccount(old),data=Buffer.from(account.data);data.writeBigUInt64LE(purchased,64);
  f.svm.setAccount(ata,{...account,data});f.t['source'+side]=ata;
 }
 f.t.amountA=5000n;f.t.amountB=10000n;return f;
}
{
 const f=reserveFixture(),a=client.initializeReserve(program,f.a.publicKey,f.t.mintA,f.t.tokenA,10000n),b=client.initializeReserve(program,f.b.publicKey,f.t.mintB,f.t.tokenB,20000n);
 f.send(a.ix);f.send(b.ix,[f.b]);assert.equal(f.balance(a.vault),5000n);assert.equal(f.balance(b.vault),10000n);assert.equal(f.balance(a.source),5000n);assert.equal(f.balance(b.source),10000n);
 f.send(a.ix,[],false);assert.equal(f.balance(a.vault),5000n);
 const wrong=client.initializeFromReserve(program,{...f.t,ownerA:f.stranger.publicKey});f.send(wrong.ix,[f.stranger],false);
 const over=client.initializeFromReserve(program,{...f.t,amountA:5001n});f.send(over.ix,[],false);assert.equal(f.balance(a.vault),5000n);
 const round=client.initializeFromReserve(program,f.t);f.send(round.ix);assert.equal(f.balance(a.vault),0n);assert.equal(f.balance(round.vaultA),5000n);
 const badAccept=client.acceptFromReserve(program,round,{...f.t,ownerB:f.stranger.publicKey});f.send(badAccept,[f.stranger],false);
 f.send(client.acceptFromReserve(program,round,f.t),[f.b]);assert.equal(f.balance(b.vault),0n);assert.equal(f.balance(round.vaultB),10000n);
 f.time(720);f.send(client.settle(program,round,f.oracle.publicKey,2n,1n),[f.oracle]);f.send(client.claim(program,round,f.t,0,f.destAA));f.send(client.claim(program,round,f.t,1,f.destAB));assert.equal(f.balance(f.destAA),5000n);assert.equal(f.balance(f.destAB),10000n);
 console.log('PASS reserve split, duplicate deposit, unauthorized spending, overspend rollback and reserve-funded winner payouts');
}
{
 const f=reserveFixture(TOKEN_2022_PROGRAM_ID,TOKEN_PROGRAM_ID),a=client.initializeReserve(program,f.a.publicKey,f.t.mintA,f.t.tokenA,10000n);f.send(a.ix);
 const round=client.initializeFromReserve(program,f.t);f.send(round.ix);f.time(120);f.send(client.expire(program,round));f.send(client.claim(program,round,f.t,0,f.t.sourceA));assert.equal(f.balance(f.t.sourceA),10000n);console.log('PASS reserve-funded unmatched refund returns to original depositor');
}
{
 const f=reserveFixture(),a=client.initializeReserve(program,f.a.publicKey,f.t.mintA,f.t.tokenA,9999n);f.send(a.ix,[],false);assert.equal(f.balance(f.t.sourceA),10000n);
 // If a preceding transfer changes the purchased balance, reserve initialization fails and the entire transaction rolls back.
 const transfer=createTransferCheckedInstruction(f.t.sourceA,f.t.mintA,f.destAA,f.a.publicKey,1n,6,[],f.t.tokenA);
 f.send([transfer,client.initializeReserve(program,f.a.publicKey,f.t.mintA,f.t.tokenA,10000n).ix],[],false);assert.equal(f.balance(f.t.sourceA),10000n);assert.equal(f.balance(f.destAA),0n);
 const account=f.svm.getAccount(f.t.mintA),data=Buffer.from(account.data);data.writeBigUInt64LE(100000n,36);f.svm.setAccount(f.t.mintA,{...account,data});
 f.send(client.initializeReserve(program,f.a.publicKey,f.t.mintA,f.t.tokenA,10000n).ix,[],false);assert.equal(f.balance(f.t.sourceA),10000n);
 console.log('PASS reserve purchase mismatch, 2% cap and multi-instruction atomic rollback');
}
console.log(JSON.stringify({program:program.toBase58(),binarySha256:crypto.createHash('sha256').update(fs.readFileSync(binary)).digest('hex'),transactionAssertions:checks,network:'local LiteSVM',passed:true},null,2));

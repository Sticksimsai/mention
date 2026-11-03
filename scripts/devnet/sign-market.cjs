// Signs only a reconstructed, reviewed devnet market transaction. Never broadcasts.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{createRequire}=require('node:module');
const requireApi=createRequire(path.resolve(__dirname,'../../apps/api/package.json')),ts=requireApi('typescript'),w=requireApi('@solana/web3.js');
function loadProtocol(){const module={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.resolve(__dirname,'../../apps/api/src/lib/market-protocol.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module,exports:module.exports,require:requireApi,Buffer});return module.exports;}
(async()=>{
 const file=process.argv[2];if(!file)throw Error('Usage: node scripts/devnet/sign-market.cjs /absolute/path/mentions-devnet-review.json');
 if(!process.env.DEVNET_KEYPAIR||!path.isAbsolute(process.env.DEVNET_KEYPAIR))throw Error('Set DEVNET_KEYPAIR to the absolute path of your local test keypair.');
 const p=loadProtocol(),review=JSON.parse(fs.readFileSync(file,'utf8')),payer=w.Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(process.env.DEVNET_KEYPAIR,'utf8'))));
 const c=new w.Connection(process.env.DEVNET_RPC_URL||'https://api.devnet.solana.com','finalized');if(await c.getGenesisHash()!==p.DEVNET_GENESIS)throw Error('Refusing non-devnet RPC');
 if(review.network!=='devnet'||review.status!=='prepared')throw Error('Not an unsigned devnet review');
 const tx=w.VersionedTransaction.deserialize(Buffer.from(review.transaction,'base64'));if(tx.message.addressTableLookups.length)throw Error('Lookup tables are not supported by this signer');
 if(tx.message.staticAccountKeys[0].toBase58()!==payer.publicKey.toBase58())throw Error('This review belongs to another wallet');
 const d=review.details;let expected=[];
 if(review.kind==='link'){
 if(d.network!=='devnet'||d.wallet!==payer.publicKey.toBase58()||d.policy!=='devnet-gecko-proxy-v1')throw Error('Connection identity mismatch');
 const program=fs.readFileSync(path.resolve(__dirname,'../../contracts/mention-escrow/program-id.txt'),'utf8').trim(),reserveAccount=await c.getAccountInfo(p.key(p.reserveAddress(program,d.mint)));if(!reserveAccount||p.decodeReserve(program,d.mint,reserveAccount).owner!==d.wallet)throw Error('Reserve ownership mismatch');
 expected=[new w.TransactionInstruction({programId:p.key('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr'),keys:[{pubkey:payer.publicKey,isSigner:true,isWritable:false}],data:Buffer.from('Mentions devnet reserve connection: '+JSON.stringify(d))})];
 }else{
 const t=d.terms,program=fs.readFileSync(path.resolve(__dirname,'../../contracts/mention-escrow/program-id.txt'),'utf8').trim();
 if(!t||t.network!=='devnet'||t.program!==program||t.dataPolicy!=='devnet-gecko-proxy-v1'||!['a','b'].includes(d.side)||payer.publicKey.toBase58()!==(d.side==='a'?t.walletA:t.walletB))throw Error('Invalid immutable devnet terms');
 const {round,rulesHash,...base}=t;if(p.digest(base)!==rulesHash||d.rulesHash!==rulesHash||p.roundAddress(program,t.walletA,t.nonce)!==round)throw Error('Terms hash or round mismatch');
 const info=await c.getAccountInfo(p.key(round)),state=info?p.decodeRound(program,round,info,t):null;
 if(review.kind==='fund')expected=[p.fundRound(t,d.side)];
 else if(review.kind==='recover'&&state)expected=state.status===0?[p.expireRound(t)]:[...(!state.claimedA?p.claimRound(t,state,0,payer.publicKey.toBase58()):[]),...(state.fundedB&&!state.claimedB?p.claimRound(t,state,1,payer.publicKey.toBase58()):[])];
 else throw Error('Unsupported review');
 }
 const rebuilt=new w.VersionedTransaction(new w.TransactionMessage({payerKey:payer.publicKey,recentBlockhash:tx.message.recentBlockhash,instructions:[w.ComputeBudgetProgram.setComputeUnitLimit({units:600000}),...expected]}).compileToV0Message());
 if(!Buffer.from(rebuilt.message.serialize()).equals(Buffer.from(tx.message.serialize())))throw Error('Transaction contains instructions or accounts outside the review');
 if(!(await c.isBlockhashValid(tx.message.recentBlockhash)).value)throw Error('Review expired; prepare a fresh unsigned review on the website');
 console.log('DEVNET ONLY. Review every wallet, stake, pool, oracle and deadline:\n'+JSON.stringify(d,null,2));
 const rl=require('node:readline/promises').createInterface({input:process.stdin,output:process.stdout});const answer=await rl.question('Type SIGN DEVNET to approve (no transaction will be sent): ');rl.close();if(answer!=='SIGN DEVNET')throw Error('Cancelled');
 tx.sign([payer]);const output=path.resolve(file+'.signed.txt');fs.writeFileSync(output,Buffer.from(tx.serialize()).toString('base64'),{mode:0o600,flag:'wx'});console.log('Signed transaction saved to '+output+'. Paste its contents into the website review. No keys were exported; no transaction was sent.');
})().catch(e=>{console.error(e.message);process.exitCode=1});

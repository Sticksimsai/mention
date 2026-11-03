import {randomBytes,randomUUID} from 'node:crypto';
import {Connection,Keypair,PublicKey,TransactionMessage,VersionedTransaction,ComputeBudgetProgram,SYSVAR_CLOCK_PUBKEY,type TransactionInstruction} from '@solana/web3.js';
import {HTTPException} from 'hono/http-exception';
import {marketLinks,marketRounds,marketActions,communities,battleChallenges,eq,and,desc,sql} from '@mention/db';
import {db} from './db.js';
import {verifySigned,base58} from './money.js';
import {collectVolumeEvidence} from './volume-evidence.js';
import {DEVNET_GENESIS,digest,key,decodeReserve,decodeRound,reserveAddress,roundAddress,fundRound,expireRound,claimRound,settleRound,type MarketTerms,type ChainRound} from './market-protocol.js';

const rpc=process.env.MARKETS_DEVNET_RPC_URL||'https://api.devnet.solana.com';
export const marketConnection=new Connection(rpc,{commitment:'finalized',disableRetryOnRateLimit:true,fetch:(u,o)=>fetch(u,{...o,signal:AbortSignal.timeout(15000)})});
export const marketProgram=process.env.MARKETS_DEVNET_PROGRAM_ID||'HvyUucswhe6NeAWeptTZCs86sVdZK4JJGzhVFQ4y3qFH';
function oracle(){const seed=Buffer.from(process.env.MARKETS_DEVNET_ORACLE_SEED||'','base64');if(seed.length!==32)throw new HTTPException(503,{message:'Devnet settlement signer is not configured'});return Keypair.fromSeed(seed)}
export function marketConfig(){let oracleAddress:string|null=null;try{oracleAddress=oracle().publicKey.toBase58()}catch{}return {enabled:process.env.MARKETS_DEVNET_ENABLED==='true'&&!!oracleAddress,network:'devnet',program:marketProgram,oracle:oracleAddress,reserveBpsOfDevBuy:5000,dataPolicy:'devnet-gecko-proxy-v1',productionEnabled:false,settlementEnabled:process.env.MARKETS_DEVNET_SETTLEMENT_ENABLED==='true'}}
export function assertTester(userId:string){const testers=(process.env.MARKETS_DEVNET_TESTERS||'').split(',').filter(Boolean);if(!testers.includes(userId))throw new HTTPException(403,{message:'This devnet rehearsal is limited to configured test accounts'});}
export async function assertDevnet(){if(!marketConfig().enabled)throw new HTTPException(503,{message:'Devnet market execution is not configured'});if(await marketConnection.getGenesisHash()!==DEVNET_GENESIS)throw new Error('Refusing non-devnet market RPC');if(!(await marketConnection.getAccountInfo(key(marketProgram)))?.executable)throw new Error('Devnet escrow program is unavailable');}
export async function chainTime(){const a=await marketConnection.getAccountInfo(SYSVAR_CLOCK_PUBKEY);if(!a||a.data.length<40)throw Error('Devnet clock unavailable');return Number(a.data.readBigInt64LE(32));}
export async function readReserve(mint:string){
 key(mint);const address=reserveAddress(marketProgram,mint),a=await marketConnection.getAccountInfo(key(address));if(!a)throw new HTTPException(404,{message:'No devnet reserve exists for this mint'});
 const reserve=decodeReserve(marketProgram,mint,a),[m,v]=await marketConnection.getMultipleAccountsInfo([key(mint),key(reserve.vault)]);
 if(!m||m.owner.toBase58()!==reserve.token||m.data.length<82||m.data[44]!==6||!v||v.owner.toBase58()!==reserve.token||v.data.length<165||!v.data.subarray(0,32).equals(key(mint).toBuffer())||!v.data.subarray(32,64).equals(key(address).toBuffer()))throw Error('Reserve token accounts do not match');
 return {...reserve,availableUnits:v.data.readBigUInt64LE(64).toString(),decimals:6,network:'devnet'};
}
export async function providerRead(path:string){const r=await fetch('https://api.geckoterminal.com/api/v2'+path,{signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('Volume provider unavailable ('+r.status+')');return r.json();}
export async function verifyPool(pool:string,mint:string){key(pool);key(mint);const info=await providerRead(`/networks/solana/pools/${pool}`) as any;const data=info?.data;if(data?.attributes?.address!==pool||![data.relationships?.base_token?.data?.id,data.relationships?.quote_token?.data?.id].includes('solana_'+mint))throw new HTTPException(400,{message:'Selected pool does not contain the community token'});}
export type Action=typeof marketActions.$inferSelect;
export const actionView=(a:Action)=>({id:a.id,kind:a.kind,status:a.status,details:JSON.parse(a.details),transaction:a.status==='prepared'?a.transaction:undefined,signature:a.signature,error:a.error,network:'devnet'});
export async function refreshAction(a:Action){
 let status=a.status,error=a.error;
 if(a.signature&&['submitted','needs_review'].includes(status)){const s=(await marketConnection.getSignatureStatuses([a.signature],{searchTransactionHistory:true})).value[0];if(s?.err){status='failed';error='Transaction failed on devnet';}else if(s?.confirmationStatus==='finalized'){status='confirmed';error=null;}else if(!s&&await marketConnection.getBlockHeight('finalized')>a.lastValidBlockHeight){status='needs_review';error='Confirmation unknown. Reconcile this signature before any replacement.';}}
 else if(status==='prepared'&&await marketConnection.getBlockHeight('finalized')>a.lastValidBlockHeight){status='expired';error='Unsigned review expired. Prepare again.';}
 if(status!==a.status){const [updated]=await db.update(marketActions).set({status,error,updatedAt:new Date()}).where(and(eq(marketActions.id,a.id),eq(marketActions.status,a.status))).returning();if(updated)a=updated;else{const [current]=await db.select().from(marketActions).where(eq(marketActions.id,a.id));a=current;}}
 if(a.status==='confirmed'&&a.kind==='link'){
 const d=JSON.parse(a.details);await db.transaction(async tx=>{
 await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${a.scope}))`);
 const [currentAction]=await tx.select().from(marketActions).where(eq(marketActions.id,a.id)).for('update');
 if(currentAction.status!=='confirmed')return;
 const [coin]=await tx.select().from(communities).where(eq(communities.id,d.communityId)).for('share');
 if(!coin||coin.ownerId!==a.userId)throw new HTTPException(409,{message:'Community ownership changed; connection not applied'});
 await tx.insert(marketLinks).values({communityId:d.communityId,userId:a.userId!,details:a.details}).onConflictDoUpdate({target:marketLinks.communityId,set:{userId:a.userId!,details:a.details,updatedAt:new Date()}});
 await tx.update(marketActions).set({status:'complete',updatedAt:new Date()}).where(and(eq(marketActions.id,a.id),eq(marketActions.status,'confirmed')));});a={...a,status:'complete'};
 }
 return a;
}
export async function buildAction(scope:string,kind:string,userId:string|null,details:Record<string,unknown>,payer:string,instructions:()=>Promise<TransactionInstruction[]>){
 await assertDevnet();return db.transaction(async tx=>{
 await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${scope}))`);
 const [old]=await tx.select().from(marketActions).where(eq(marketActions.scope,scope)).orderBy(desc(marketActions.createdAt)).limit(1).for('update');
 if(old&&['submitted','needs_review'].includes(old.status)){if(old.userId!==userId)throw new HTTPException(409,{message:'An earlier transaction is awaiting reconciliation'});return old;}
 if(old?.status==='prepared'){
 if(await marketConnection.getBlockHeight('finalized')<=old.lastValidBlockHeight){
 if(old.userId!==userId||digest(JSON.parse(old.details))!==digest(details))throw new HTTPException(409,{message:'An existing review must be cancelled or expire first'});
 return old;
 }
 await tx.update(marketActions).set({status:'expired',updatedAt:new Date()}).where(eq(marketActions.id,old.id));
 }
 const ixs=await instructions(),bh=await marketConnection.getLatestBlockhash('confirmed');
 const transaction=new VersionedTransaction(new TransactionMessage({payerKey:key(payer),recentBlockhash:bh.blockhash,instructions:[ComputeBudgetProgram.setComputeUnitLimit({units:600000}),...ixs]}).compileToV0Message());
 const bytes=transaction.serialize();if(bytes.length>1232)throw Error('Review exceeds transaction size limit');
 const sim=await marketConnection.simulateTransaction(transaction,{sigVerify:false});if(sim.value.err)throw new HTTPException(409,{message:'Devnet simulation failed. Check test SOL, reserve balance and round deadlines.'});
 const [row]=await tx.insert(marketActions).values({id:randomUUID(),scope,kind,userId,details:JSON.stringify(details),transaction:Buffer.from(bytes).toString('base64'),lastValidBlockHeight:bh.lastValidBlockHeight}).returning();return row;
 });
}
export async function sendAction(a:Action,signed:string){
 await assertDevnet();if(a.status!=='prepared')return refreshAction(a);
 if(await marketConnection.getBlockHeight('confirmed')>a.lastValidBlockHeight)throw new HTTPException(409,{message:'Review expired; prepare again'});
 const tx=verifySigned(a.transaction,signed),signature=base58(tx.signatures[0]);
 const [saved]=await db.update(marketActions).set({status:'submitted',signature,signedTransaction:signed,updatedAt:new Date()}).where(and(eq(marketActions.id,a.id),eq(marketActions.status,'prepared'))).returning();
 if(!saved){const [current]=await db.select().from(marketActions).where(eq(marketActions.id,a.id));return refreshAction(current);}
 // Signature and exact signed bytes are durable BEFORE the first send. No replacement on ambiguity.
 try{await marketConnection.sendRawTransaction(Buffer.from(signed,'base64'),{skipPreflight:false,maxRetries:0})}catch{}
 return refreshAction(saved);
}
export async function getTerms(id:string){const [row]=await db.select().from(marketRounds).where(eq(marketRounds.id,id));return row?{row,terms:JSON.parse(row.terms) as MarketTerms}:null;}
export async function readRound(t:MarketTerms):Promise<ChainRound|null>{const a=await marketConnection.getAccountInfo(key(t.round));return a?decodeRound(t.program,t.round,a,t):null;}
export async function roundView(id:string){const saved=await getTerms(id);if(!saved)return null;const chain=await readRound(saved.terms);await db.update(marketRounds).set({chainState:JSON.stringify(chain),updatedAt:new Date()}).where(eq(marketRounds.id,id));return {terms:saved.terms,chain,error:saved.row.error,observation:saved.row.observation?JSON.parse(saved.row.observation):null,network:'devnet'};}
export async function freezeTerms(id:string){
 await assertDevnet();return db.transaction(async tx=>{
 await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${'terms:'+id}))`);
 const [existing]=await tx.select().from(marketRounds).where(eq(marketRounds.id,id));if(existing)return JSON.parse(existing.terms) as MarketTerms;
 const [battle]=await tx.select().from(battleChallenges).where(eq(battleChallenges.id,id)).for('share');if(!battle||battle.status!=='accepted')throw new HTTPException(409,{message:'Both owners must accept the proposal before freezing devnet terms'});
 const rows=await tx.select().from(marketLinks),a=rows.find(r=>r.communityId===battle.challengerId),b=rows.find(r=>r.communityId===battle.opponentId);
 if(!a||!b)throw new HTTPException(409,{message:'Both communities must link a devnet reserve first'});
 const da=JSON.parse(a.details),dbb=JSON.parse(b.details);
 const ra=await readReserve(da.mint),rb=await readReserve(dbb.mint);
 if(ra.owner!==da.wallet||rb.owner!==dbb.wallet||da.wallet===dbb.wallet||da.mint===dbb.mint||da.pool===dbb.pool||da.volumeMint===dbb.volumeMint)throw new HTTPException(409,{message:'Choose independent wallets, tokens and pools'});
 const [coinA]=await tx.select().from(communities).where(eq(communities.id,a.communityId)),[coinB]=await tx.select().from(communities).where(eq(communities.id,b.communityId));
 if(!coinA||!coinB||coinA.ownerId!==a.userId||coinB.ownerId!==b.userId||coinA.ca!==da.volumeMint||coinB.ca!==dbb.volumeMint)throw new HTTPException(409,{message:'Community identity changed; link reserves again'});
 await verifyPool(da.pool,da.volumeMint);await verifyPool(dbb.pool,dbb.volumeMint);
 if(BigInt(ra.availableUnits)<BigInt(battle.challengerStakeUnits)||BigInt(rb.availableUnits)<BigInt(battle.opponentStakeUnits))throw new HTTPException(409,{message:'Reserve balances do not cover the proposed stakes'});
 if(coinA.status!=='approved'||coinB.status!=='approved')throw new HTTPException(409,{message:'Both communities must remain approved'});
 const nonce=randomBytes(32).toString('hex'),start=Math.ceil(((await chainTime())+600)/60)*60;
 const base={network:'devnet' as const,dataPolicy:'devnet-gecko-proxy-v1' as const,program:marketProgram,oracle:oracle().publicKey.toBase58(),walletA:ra.owner,walletB:rb.owner,mintA:ra.mint,mintB:rb.mint,tokenA:ra.token,tokenB:rb.token,poolA:da.pool,poolB:dbb.pool,volumeMintA:da.volumeMint,volumeMintB:dbb.volumeMint,amountA:battle.challengerStakeUnits,amountB:battle.opponentStakeUnits,start,end:start+battle.durationSecs,deadline:start+battle.durationSecs+900,nonce,challengerId:a.communityId,opponentId:b.communityId,ownerIdA:a.userId,ownerIdB:b.userId};
 const terms:MarketTerms={...base,round:roundAddress(marketProgram,ra.owner,nonce),rulesHash:digest(base)};
 await tx.insert(marketRounds).values({id,terms:JSON.stringify(terms)});return terms;
 });
}
export async function actionAuthority(a:Action,userId:string){
 if(a.userId!==userId)throw new HTTPException(403,{message:'This wallet review belongs to another user'});
 const d=JSON.parse(a.details);if(a.kind==='link'){const [coin]=await db.select().from(communities).where(eq(communities.id,d.communityId));if(!coin||coin.ownerId!==userId)throw new HTTPException(403);}
 else {const s=await getTerms(d.roundId);if(!s)throw new HTTPException(404);const t=s.terms;const coinId=userId===t.ownerIdA?t.challengerId:userId===t.ownerIdB?t.opponentId:null;if(!coinId)throw new HTTPException(403);const [coin]=await db.select().from(communities).where(eq(communities.id,coinId));if(coin.ownerId!==userId)throw new HTTPException(403,{message:'Community ownership changed'});}
}

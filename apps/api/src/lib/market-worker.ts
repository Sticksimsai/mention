import {Keypair,VersionedTransaction} from '@solana/web3.js';
import {marketRounds,marketActions,eq,isNull,asc,inArray} from '@mention/db';
import {db} from './db.js';
import {collectVolumeEvidence} from './volume-evidence.js';
import {marketConfig,assertDevnet,chainTime,readRound,buildAction,sendAction,refreshAction,providerRead} from './market-execution.js';
import {settleRound,expireRound,claimRound,type MarketTerms} from './market-protocol.js';
let running=false;
// Deliberately opt-in: these are provider attestations for valueless devnet tokens, not consensus-finalized volume.
export function stableEvidence(previous:any,next:any){return next.failures.length===0&&next.candidate.volumeA!==null&&next.candidate.volumeB!==null&&previous?.evidenceHash===next.evidenceHash&&next.collectedAt-previous.collectedAt>=60;}
export async function processDevnetMarkets(){
 if(running||!marketConfig().enabled)return;running=true;
 try{
 await assertDevnet();
 const pending=await db.select().from(marketActions).where(inArray(marketActions.status,['submitted','needs_review'])).orderBy(asc(marketActions.updatedAt)).limit(10);
 for(const action of pending){try{await refreshAction(action)}catch{}}
 const rows=await db.select().from(marketRounds).where(isNull(marketRounds.closedAt)).orderBy(asc(marketRounds.updatedAt)).limit(3);
 for(const row of rows){try{
 const t=JSON.parse(row.terms) as MarketTerms,r=await readRound(t),now=await chainTime();if(!r)continue;
 let instructions:any[]=[],kind='';
 const signer=Keypair.fromSeed(Buffer.from(process.env.MARKETS_DEVNET_ORACLE_SEED!,'base64'));
 if(t.oracle!==signer.publicKey.toBase58())throw Error('Configured oracle does not match immutable terms');
 if(r.status!==0){
 instructions=[...(!r.claimedA?claimRound(t,r,0,t.oracle):[]),...(r.fundedB&&!r.claimedB?claimRound(t,r,1,t.oracle):[])];kind='claim';
 if(!instructions.length){await db.update(marketRounds).set({closedAt:new Date(),chainState:JSON.stringify(r),updatedAt:new Date(),error:null}).where(eq(marketRounds.id,row.id));continue;}
 }else if(now>(r.fundedB?t.deadline:t.start)){instructions=[expireRound(t)];kind='expire';}
 else if(r.fundedB&&now>=t.end+120){
 const next=await collectVolumeEvidence({start:t.start,end:t.end,poolA:t.poolA,poolB:t.poolB,mintA:t.volumeMintA,mintB:t.volumeMintB},now,providerRead);
 const previous=row.observation?JSON.parse(row.observation):null;
 if(stableEvidence(previous,next)){instructions=[settleRound(t,next.candidate.volumeA!,next.candidate.volumeB!,next.evidenceHash)];kind='settle';}
 // Keep first identical observation so timer does not reset on each worker tick.
 if(previous?.evidenceHash!==next.evidenceHash)await db.update(marketRounds).set({observation:JSON.stringify(next),updatedAt:new Date()}).where(eq(marketRounds.id,row.id));
 }
 if(instructions.length&&process.env.MARKETS_DEVNET_SETTLEMENT_ENABLED==='true'){
 const action=await buildAction('round:'+row.id,kind,null,{roundId:row.id,kind,rulesHash:t.rulesHash},t.oracle,async()=>instructions);
 // Never sign a user's pending review, even if sharing this round's serialization lock.
 if(action.userId!==null)continue;
 if(action.status==='prepared'){const tx=VersionedTransaction.deserialize(Buffer.from(action.transaction,'base64'));tx.sign([signer]);await sendAction(action,Buffer.from(tx.serialize()).toString('base64'));}else await refreshAction(action);
 }
 await db.update(marketRounds).set({chainState:JSON.stringify(r),error:null,updatedAt:new Date()}).where(eq(marketRounds.id,row.id));
 }catch{await db.update(marketRounds).set({error:'Devnet reconciliation paused. Check provider, signer funding and transaction status; deadlines still permit refunds.',updatedAt:new Date()}).where(eq(marketRounds.id,row.id));}}
 }finally{running=false;}
}

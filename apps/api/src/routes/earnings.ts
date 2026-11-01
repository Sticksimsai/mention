import { randomUUID } from "node:crypto";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { SystemProgram, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import { creatorReceipts, creatorEarnings, communities, moneyOperations, modAuditLog, eq, and, desc, sql, inArray } from "@mention/db";
import { db } from "../lib/db.js";
import { env } from "../env.js";
import { encrypt } from "../lib/crypto.js";
import { requireAuth, requireStaff, requireNotBanned, rateLimit } from "../auth/middleware.js";
import { connection, platformKeypair, positiveLamports, creatorShare, address, hash, publicOperation, broadcast, refreshOperation } from "../lib/money.js";
export const earningsRoute=new Hono();earningsRoute.use("*",requireAuth);
earningsRoute.get("/",async c=>{
 const rows=await db.select({id:creatorEarnings.id,name:communities.name,gross:creatorEarnings.grossLamports,amount:creatorEarnings.creatorLamports,wallet:creatorEarnings.wallet,receipt:creatorEarnings.receipt,payoutId:creatorEarnings.payoutId,status:moneyOperations.status,signature:moneyOperations.signature,createdAt:creatorEarnings.createdAt}).from(creatorEarnings).innerJoin(communities,eq(communities.id,creatorEarnings.communityId)).leftJoin(moneyOperations,eq(moneyOperations.id,creatorEarnings.payoutId)).where(eq(creatorEarnings.userId,c.get("user").id)).orderBy(desc(creatorEarnings.createdAt));
 return c.json({automationEnabled:env.PAYOUTS_ENABLED,items:rows.map(r=>({...r,gross:r.gross.toString(),amount:r.amount.toString(),status:r.status??"available"}))});
});
earningsRoute.use("/admin/*",async(c,next)=>{requireStaff(c,["admin"]);requireNotBanned(c);await next();});
earningsRoute.get("/admin/overview",async c=>{
 const credits=await db.select({id:creatorEarnings.id,community:communities.name,wallet:creatorEarnings.wallet,amount:creatorEarnings.creatorLamports,payoutId:creatorEarnings.payoutId}).from(creatorEarnings).innerJoin(communities,eq(communities.id,creatorEarnings.communityId)).orderBy(desc(creatorEarnings.createdAt)).limit(100);
 const operations=await db.select().from(moneyOperations).where(eq(moneyOperations.kind,"payout")).orderBy(desc(moneyOperations.createdAt)).limit(50);
 return c.json({enabled:env.PAYOUTS_ENABLED,maxSol:env.PAYOUT_MAX_SOL,dailyBudgetSol:env.PAYOUT_DAILY_BUDGET_SOL,credits:credits.map(r=>({...r,amount:r.amount.toString()})),operations:operations.map(publicOperation)});
});
// Admin supplies a reviewed per-token allocation: aggregate wallet receipts do NOT prove token attribution.
earningsRoute.post("/admin/receipts",rateLimit("receipts",10,60),zValidator("json",z.object({signature:z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{64,88}$/),note:z.string().trim().min(20).max(2000),allocations:z.array(z.object({communityId:z.string().uuid(),grossLamports:z.string()})).min(1).max(50)})),async c=>{
 const body=c.req.valid("json"),platform=platformKeypair();
 if(new Set(body.allocations.map(a=>a.communityId)).size!==body.allocations.length)throw new HTTPException(400,{message:"Duplicate community in allocation"});
 const tx=await connection.getTransaction(body.signature,{commitment:"finalized",maxSupportedTransactionVersion:0});if(!tx?.meta||tx.meta.err)throw new HTTPException(400,{message:"A successful finalized receipt is required"});
 const keys=tx.transaction.message.getAccountKeys({accountKeysFromLookups:tx.meta.loadedAddresses});let index=-1;for(let i=0;i<keys.length;i++)if(keys.get(i)?.equals(platform.publicKey))index=i;
 if(index<0)throw new HTTPException(400,{message:"Receipt does not include the platform treasury"});
 const received=tx.meta.postBalances[index]-tx.meta.preBalances[index]+(index===0?tx.meta.fee:0);
 if(!Number.isSafeInteger(received)||received<=0)throw new HTTPException(400,{message:"Receipt has no positive treasury inflow"});
 const total=body.allocations.reduce((n,a)=>n+positiveLamports(a.grossLamports),0n);if(total>BigInt(received))throw new HTTPException(400,{message:"Allocations exceed verified treasury inflow"});
 await db.transaction(async t=>{
  await t.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${body.signature}))`);
  const [existing]=await t.select().from(creatorReceipts).where(eq(creatorReceipts.signature,body.signature));if(existing)throw new HTTPException(409,{message:"This receipt is already allocated"});
  await t.insert(creatorReceipts).values({signature:body.signature,amountLamports:BigInt(received),approvedBy:c.get("user").id,note:body.note});
  for(const allocation of body.allocations){
   const [community]=await t.select().from(communities).where(eq(communities.id,allocation.communityId));if(!community?.creatorWallet||community.platformFeeShareBps===null)throw new HTTPException(400,{message:"Community has no fee recipient"});
   const [launch]=await t.execute(sql`SELECT user_id, details FROM money_operations WHERE kind='launch' AND status='complete' AND details::jsonb->>'ca'=${community.ca} LIMIT 1`);
   if(!launch)throw new HTTPException(409,{message:"Legacy launch requires verified original-launcher attribution before allocation"});
   const d=JSON.parse(String(launch.details));if(d.mode==="holders"||(d.quoteAsset&&d.quoteAsset!=="SOL"))throw new HTTPException(400,{message:"This launch does not use the SOL creator payout ledger"});const gross=positiveLamports(allocation.grossLamports);const amount=creatorShare(gross,d.platformFeeShareBps);address(d.creatorWallet);
   await t.insert(creatorEarnings).values({receipt:body.signature,communityId:community.id,userId:String(launch.user_id),wallet:d.creatorWallet,grossLamports:gross,creatorLamports:amount});
  }
  await t.insert(modAuditLog).values({actorId:c.get("user").id,action:"approve_creator_allocation",targetType:"receipt",targetId:body.signature,meta:JSON.stringify(body)});
 });return c.json({ok:true});
});
earningsRoute.post("/admin/payouts",zValidator("json",z.object({earningIds:z.array(z.string().uuid()).min(1).max(100)})),async c=>{
 const ids=c.req.valid("json").earningIds;
 if(!Number.isFinite(env.PAYOUT_MAX_SOL)||env.PAYOUT_MAX_SOL<=0||!Number.isFinite(env.PAYOUT_DAILY_BUDGET_SOL)||env.PAYOUT_DAILY_BUDGET_SOL<=0)throw new HTTPException(503,{message:"Configure payout limits before approving a payout"});
 const platform=platformKeypair();
 const result=await db.transaction(async t=>{
  await t.execute(sql`SELECT pg_advisory_xact_lock(721932)`);
  const rows=await t.select().from(creatorEarnings).where(inArray(creatorEarnings.id,ids));
  if(rows.length!==new Set(ids).size||rows.some(r=>r.payoutId))throw new HTTPException(409,{message:"One or more earnings are already reserved or do not exist"});
  if(new Set(rows.map(r=>r.wallet)).size!==1||new Set(rows.map(r=>r.userId)).size!==1)throw new HTTPException(400,{message:"Group a payout by the same creator and wallet"});
  const amount=rows.reduce((n,r)=>n+r.creatorLamports,0n);if(amount<=0n||amount>BigInt(Math.floor(env.PAYOUT_MAX_SOL*1e9)))throw new HTTPException(400,{message:"Payout exceeds per-payment limit or is empty"});
  const bh=await connection.getLatestBlockhash("confirmed");const tx=new VersionedTransaction(new TransactionMessage({payerKey:platform.publicKey,recentBlockhash:bh.blockhash,instructions:[SystemProgram.transfer({fromPubkey:platform.publicKey,toPubkey:address(rows[0].wallet),lamports:amount})]}).compileToV0Message());
  const fee=(await connection.getFeeForMessage(tx.message)).value;if(fee===null)throw new HTTPException(503,{message:"Network fee unavailable"});
  const [spent]=await t.execute(sql`SELECT COALESCE(SUM((details::jsonb->>'reservedLamports')::bigint),0)::text AS total FROM money_operations WHERE kind='payout' AND created_at >= date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'`);
  const reserved=amount+BigInt(fee);if(BigInt(String(spent.total))+reserved>BigInt(Math.floor(env.PAYOUT_DAILY_BUDGET_SOL*1e9)))throw new HTTPException(429,{message:"Daily payout budget reached"});
  if(BigInt(await connection.getBalance(platform.publicKey))<reserved)throw new HTTPException(400,{message:"Insufficient treasury balance"});
  const unsigned=Buffer.from(tx.serialize()).toString("base64");tx.sign([platform]);const id=randomUUID();
  const [op]=await t.insert(moneyOperations).values({id,userId:rows[0].userId,kind:"payout",status:"prepared",requestHash:hash(ids.sort()),details:JSON.stringify({wallet:rows[0].wallet,amountLamports:amount.toString(),reservedLamports:reserved.toString(),approvedBy:c.get("user").id}),transaction:unsigned,signedTransactionEnc:encrypt(Buffer.from(tx.serialize()).toString("base64")),lastValidBlockHeight:bh.lastValidBlockHeight}).returning();
  await t.update(creatorEarnings).set({payoutId:id}).where(inArray(creatorEarnings.id,ids));
  await t.insert(modAuditLog).values({actorId:c.get("user").id,action:"approve_creator_payout",targetType:"payout",targetId:id,meta:JSON.stringify({earningIds:ids})});return op;
 });return c.json(publicOperation(result),201);
});
// Same signed bytes are retried; an ambiguous payment is never released/rebuilt automatically.
let running=false;
export async function processApprovedPayouts(){
 if(!env.PAYOUTS_ENABLED||running)return;running=true;
 try{const rows=await db.select().from(moneyOperations).where(and(eq(moneyOperations.kind,"payout"),inArray(moneyOperations.status,["prepared","submitted"]))).orderBy(moneyOperations.createdAt).limit(10);
 for(const op of rows){try{const current=await refreshOperation(op);if(current.status!=="expired")await broadcast(current);}catch{ /* retained for reconciliation; no second payout */ }}
 }finally{running=false;}
}
earningsRoute.post("/admin/payouts/:id/check",async c=>{
 const [op]=await db.select().from(moneyOperations).where(and(eq(moneyOperations.id,z.string().uuid().parse(c.req.param("id"))),eq(moneyOperations.kind,"payout")));if(!op)throw new HTTPException(404);
 return c.json(publicOperation(await refreshOperation(op)));
});

import { createHash, createPublicKey, verify } from "node:crypto";
import { Connection, Keypair, PublicKey, VersionedTransaction } from "@solana/web3.js";
import { HTTPException } from "hono/http-exception";
import { moneyOperations, creatorEarnings, eq, and, sql } from "@mention/db";
import { db } from "./db.js";
import { env } from "../env.js";
import { decrypt, encrypt } from "./crypto.js";
export const connection = new Connection(env.SOLANA_RPC_URL, { commitment: "confirmed", disableRetryOnRateLimit: true, fetch: (url, init) => fetch(url, {...init,signal:AbortSignal.timeout(15000)}) });
export const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
export function base58(bytes: Uint8Array) {
  let n=BigInt("0x"+Buffer.from(bytes).toString("hex")); let out="";
  while(n){ out=alphabet[Number(n%58n)]+out;n/=58n; }
  for(const b of bytes){if(b!==0)break;out="1"+out;} return out;
}
export function platformKeypair() {
  const raw=env.PLATFORM_WALLET_SECRET.trim();
  if(raw.startsWith("[")) return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw)));
  if(!raw) throw new HTTPException(503,{message:"Platform wallet is not configured"});
  let n=0n;for(const c of raw){const d=alphabet.indexOf(c);if(d<0)throw new Error("Invalid platform key");n=n*58n+BigInt(d);}
  const hex=n.toString(16); const bytes=[...Buffer.from(hex.length%2?"0"+hex:hex,"hex")];for(const c of raw){if(c!=="1")break;bytes.unshift(0);}return Keypair.fromSecretKey(Uint8Array.from(bytes));
}
export function address(value:string) { try{return new PublicKey(value);}catch{throw new HTTPException(400,{message:"Invalid Solana address"});} }
export function positiveLamports(value:string) { if(!/^[1-9]\d{0,15}$/.test(value))throw new HTTPException(400,{message:"Invalid lamport amount"});const n=BigInt(value);if(n>BigInt(Number.MAX_SAFE_INTEGER))throw new HTTPException(400,{message:"Amount too large"});return n; }
export function creatorShare(gross:bigint,platformBps:number){if(!Number.isInteger(platformBps)||platformBps<0||platformBps>10000)throw new Error("Invalid fee split");return gross*BigInt(10000-platformBps)/10000n;}
export function verifySigned(original:string,signed:string){
  const tx=VersionedTransaction.deserialize(Buffer.from(signed,"base64"));
  const unsigned=VersionedTransaction.deserialize(Buffer.from(original,"base64"));
  if(!Buffer.from(tx.message.serialize()).equals(Buffer.from(unsigned.message.serialize())))throw new HTTPException(400,{message:"Transaction differs from the reviewed transaction"});
  for(let i=0;i<tx.message.header.numRequiredSignatures;i++){
    const key=createPublicKey({key:Buffer.concat([Buffer.from("302a300506032b6570032100","hex"),tx.message.staticAccountKeys[i].toBuffer()]),format:"der",type:"spki"});
    if(!verify(null,tx.message.serialize(),key,tx.signatures[i]))throw new HTTPException(400,{message:"Invalid transaction signature"});
  }
  return tx;
}
export type Operation = typeof moneyOperations.$inferSelect;
export async function ownOperation(id:string,userId:string,kind?:string){
  const [op]=await db.select().from(moneyOperations).where(and(eq(moneyOperations.id,id),eq(moneyOperations.userId,userId)));
  if(!op || (kind && op.kind!==kind))throw new HTTPException(404,{message:"Operation not found"});return op;
}
export function publicOperation(op:Operation){ return {id:op.id,kind:op.kind,status:op.status,details:JSON.parse(op.details),signature:op.signature,error:op.error,createdAt:op.createdAt,transaction:op.status==="prepared"&&op.kind==="trade"?op.transaction:undefined}; }
export async function refreshOperation(op:Operation){
  if(op.status==="prepared" && op.lastValidBlockHeight && await connection.getBlockHeight("finalized")>op.lastValidBlockHeight){
    return db.transaction(async t=>{
      const [expired]=await t.update(moneyOperations).set({status:"expired",error:"Review expired without submission. Create a new review.",signedTransactionEnc:null,updatedAt:new Date()}).where(and(eq(moneyOperations.id,op.id),eq(moneyOperations.status,"prepared"))).returning();
      if(expired?.kind==="payout")await t.update(creatorEarnings).set({payoutId:null}).where(eq(creatorEarnings.payoutId,op.id));
      return expired??op;
    });
  }
  if(!op.signature || !["submitted","confirmed"].includes(op.status))return op;
  const status=(await connection.getSignatureStatuses([op.signature],{searchTransactionHistory:true})).value[0];
  let next=op.status,error=op.error;
  if(status?.err){next="failed";error="Transaction failed on chain. Network fees may still apply.";}
  else if(status?.confirmationStatus==="finalized" || (op.kind!=="payout" && status?.confirmationStatus==="confirmed"))next="confirmed";
  else if(!status && op.lastValidBlockHeight && await connection.getBlockHeight("finalized")>op.lastValidBlockHeight){
    // A missing historical signature is not proof of non-execution. Require reconciliation.
    next="needs_review";error="Confirmation unavailable after expiry. Do not repeat this transaction; reconcile its signature.";
  }
  if(next!==op.status){const [row]=await db.update(moneyOperations).set({status:next,error,updatedAt:new Date()}).where(and(eq(moneyOperations.id,op.id),eq(moneyOperations.status,op.status))).returning();return row??await ownOperation(op.id,op.userId);}
  return op;
}
export async function broadcast(op:Operation,signed?:string){
  if(op.status==="prepared"){
    if(!op.transaction)throw new Error("Missing transaction");
    if(op.lastValidBlockHeight && await connection.getBlockHeight("confirmed")>op.lastValidBlockHeight)throw new HTTPException(409,{message:"Review expired. Build a new review before signing."});
    const bytes=signed??(op.signedTransactionEnc?decrypt(op.signedTransactionEnc):"");
    const tx=verifySigned(op.transaction,bytes);
    const saved=await db.transaction(async t=>{
      if(op.kind==="launch"){
        await t.execute(sql`SELECT pg_advisory_xact_lock(721931)`);
        const [current]=await t.select().from(moneyOperations).where(eq(moneyOperations.id,op.id));
        if(current.status!=="prepared")return current;
        const d=JSON.parse(op.details);
        if(!env.LAUNCH_ENABLED || !Number.isFinite(env.LAUNCH_MAX_COST_SOL) || !Number.isFinite(env.LAUNCH_DAILY_BUDGET_SOL) || env.LAUNCH_MAX_COST_SOL<=0 || env.LAUNCH_DAILY_BUDGET_SOL<=0 || d.estimatedCostLamports>Math.floor(env.LAUNCH_MAX_COST_SOL*1e9))throw new HTTPException(503,{message:"Launch execution limits are not configured"});
        const [spent]=await t.execute(sql`SELECT COALESCE(SUM((details::jsonb->>'reservedLamports')::bigint),0)::text AS total FROM money_operations WHERE kind='launch' AND status IN ('submitted','confirmed','complete','needs_review','failed') AND updated_at >= date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'`);
        if(BigInt(String(spent.total))+BigInt(d.reservedLamports)>BigInt(Math.floor(env.LAUNCH_DAILY_BUDGET_SOL*1e9)))throw new HTTPException(429,{message:"Daily launch execution limit reached"});
      }
      if(op.kind==="payout"){
        await t.execute(sql`SELECT pg_advisory_xact_lock(721932)`);
        const [current]=await t.select().from(moneyOperations).where(eq(moneyOperations.id,op.id));
        if(current.status!=="prepared")return current;
        const d=JSON.parse(op.details),amount=BigInt(d.reservedLamports);
        if(!env.PAYOUTS_ENABLED || !Number.isFinite(env.PAYOUT_MAX_SOL) || !Number.isFinite(env.PAYOUT_DAILY_BUDGET_SOL) || env.PAYOUT_MAX_SOL<=0 || env.PAYOUT_DAILY_BUDGET_SOL<=0 || BigInt(d.amountLamports)>BigInt(Math.floor(env.PAYOUT_MAX_SOL*1e9)))throw new HTTPException(503,{message:"Payout execution limits are not configured"});
        const [spent]=await t.execute(sql`SELECT COALESCE(SUM((details::jsonb->>'reservedLamports')::bigint),0)::text AS total FROM money_operations WHERE kind='payout' AND status IN ('submitted','confirmed','needs_review','failed') AND updated_at >= date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'`);
        if(BigInt(String(spent.total))+amount>BigInt(Math.floor(env.PAYOUT_DAILY_BUDGET_SOL*1e9)))throw new HTTPException(429,{message:"Daily payout execution limit reached"});
      }
      const [row]=await t.update(moneyOperations).set({status:"submitted",signature:base58(tx.signatures[0]),signedTransactionEnc:encrypt(bytes),updatedAt:new Date()}).where(and(eq(moneyOperations.id,op.id),eq(moneyOperations.status,"prepared"))).returning();return row;
    });
    op=saved??await ownOperation(op.id,op.userId);
  }
  if(op.status==="submitted" && op.signedTransactionEnc){
    // Persist signature and signed bytes BEFORE broadcast. Retries send exactly the same bytes.
    try{await connection.sendRawTransaction(Buffer.from(decrypt(op.signedTransactionEnc),"base64"),{skipPreflight:false,maxRetries:2});}
    catch { /* ambiguous network result stays submitted; never build another payment */ }
  }
  return refreshOperation(op);
}

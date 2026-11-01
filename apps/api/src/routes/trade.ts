import { randomUUID } from "node:crypto";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { SystemProgram, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import { tradeSchema } from "@mention/shared";
import { moneyOperations, sql } from "@mention/db";
import { db } from "../lib/db.js";
import { env } from "../env.js";
import { requireAuth, requireNotBanned, rateLimit } from "../auth/middleware.js";
import { address, connection, hash, ownOperation, publicOperation, refreshOperation, broadcast } from "../lib/money.js";

export const tradeRoute = new Hono();
async function tokenPair(ca:string){
 const [row]=await db.execute(sql`SELECT details::jsonb->>'quoteAsset' AS pair FROM money_operations WHERE kind='launch' AND status='complete' AND details::jsonb->>'ca'=${ca} LIMIT 1`);
 return String(row?.pair||"SOL");
}
tradeRoute.get("/capabilities/:ca",async c=>{address(c.req.param("ca"));const pair=await tokenPair(c.req.param("ca"));return c.json({pair,inAppTrading:pair==="SOL"});});
tradeRoute.use("*",requireAuth);
tradeRoute.post("/build",rateLimit("trade",15,60),zValidator("json",tradeSchema),async c=>{
  requireNotBanned(c);const body=c.req.valid("json");
  if(await tokenPair(body.ca)!=="SOL")throw new HTTPException(400,{message:"This pair currently trades on Pump. Mentions in-app trading supports SOL pairs only."});
  const wallet=address(body.wallet);address(body.ca);
  if(body.denominatedInSol!==(body.side==="buy"))throw new HTTPException(400,{message:"Buy amounts must use SOL; sell amounts must use tokens"});
  const bps=env.PLATFORM_TRADE_FEE_BPS;
  if(!env.PLATFORM_FEE_WALLET || !Number.isInteger(bps)||bps<0||bps>1000)throw new HTTPException(503,{message:"Trading fees are not configured"});
  const res=await fetch("https://pumpportal.fun/api/trade-local",{method:"POST",headers:{"Content-Type":"application/json"},signal:AbortSignal.timeout(20000),body:JSON.stringify({publicKey:body.wallet,action:body.side,mint:body.ca,amount:body.amount,denominatedInSol:String(body.denominatedInSol),slippage:body.slippageBps/100,priorityFee:0.0005,pool:"auto"})});
  if(!res.ok)throw new HTTPException(502,{message:"Could not build this trade. Please try again."});
  const original=VersionedTransaction.deserialize(new Uint8Array(await res.arrayBuffer()));
  const tables=await Promise.all(original.message.addressTableLookups.map(async l=>{const t=await connection.getAddressLookupTable(l.accountKey);if(!t.value)throw new Error("Lookup table unavailable");return t.value;}));
  const msg=TransactionMessage.decompile(original.message,{addressLookupTableAccounts:tables});
  if(!msg.payerKey.equals(wallet)||original.message.header.numRequiredSignatures!==1)throw new HTTPException(502,{message:"Unexpected transaction signer"});
  const bh=await connection.getLatestBlockhash("confirmed");msg.recentBlockhash=bh.blockhash;
  const base=new VersionedTransaction(msg.compileToV0Message(tables));
  const before=await connection.getBalance(wallet);
  const simulation=await connection.simulateTransaction(base,{sigVerify:false,accounts:{encoding:"base64",addresses:[body.wallet]}});
  if(simulation.value.err)throw new HTTPException(400,{message:"Trade simulation failed. Check your balance, token amount, and slippage."});
  const baseFee=(await connection.getFeeForMessage(base.message)).value;
  if(baseFee===null)throw new HTTPException(503,{message:"Network fee unavailable"});
  const after=simulation.value.accounts?.[0]?.lamports;
  if(after===undefined || after===null)throw new HTTPException(503,{message:"Trade balance simulation unavailable"});
  const notional=body.side==="buy"?Math.floor(body.amount*1e9):Math.max(0,after-before+baseFee);
  if(!Number.isSafeInteger(notional)||notional<=0)throw new HTTPException(400,{message:"Trade amount is too small or too large"});
  const feeLamports=Number(BigInt(notional)*BigInt(bps)/10000n);
  if(feeLamports>0)msg.instructions.push(SystemProgram.transfer({fromPubkey:wallet,toPubkey:address(env.PLATFORM_FEE_WALLET),lamports:feeLamports}));
  const tx=new VersionedTransaction(msg.compileToV0Message(tables));
  const finalSim=await connection.simulateTransaction(tx,{sigVerify:false});
  if(finalSim.value.err)throw new HTTPException(400,{message:"Insufficient funds or trade simulation failed after fees"});
  const networkFee=(await connection.getFeeForMessage(tx.message)).value;
  const details={...body,feeLamports,feeBps:bps,networkFeeLamports:networkFee,estimatedSolNotional:notional/1e9,feeBasis:body.side==="sell"?"Simulated SOL proceeds (fixed at review)":"SOL amount",venueFees:"PumpPortal and venue fees also apply; included in the venue transaction",reviewedAt:new Date().toISOString()};
  const [op]=await db.insert(moneyOperations).values({id:randomUUID(),userId:c.get("user").id,kind:"trade",status:"prepared",requestHash:hash(body),details:JSON.stringify(details),transaction:Buffer.from(tx.serialize()).toString("base64"),lastValidBlockHeight:bh.lastValidBlockHeight}).returning();
  return c.json(publicOperation(op));
});
tradeRoute.post("/:id/submit",rateLimit("trade-submit",20,60),zValidator("json",z.object({signedTransaction:z.string().max(5000)})),async c=>{
  requireNotBanned(c);const op=await ownOperation(z.string().uuid().parse(c.req.param("id")),c.get("user").id,"trade");
  return c.json(publicOperation(await broadcast(op,c.req.valid("json").signedTransaction)));
});
tradeRoute.get("/:id",async c=>c.json(publicOperation(await refreshOperation(await ownOperation(z.string().uuid().parse(c.req.param("id")),c.get("user").id,"trade")))));

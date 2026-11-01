import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { zValidator } from "@hono/zod-validator";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import { Keypair, VersionedTransaction } from "@solana/web3.js";
import { communities, communityMembers, moneyOperations, launchImages, eq, and, sql, desc } from "@mention/db";
import { db } from "../lib/db.js";
import { env } from "../env.js";
import { encrypt } from "../lib/crypto.js";
import { requireAuth, requireNotBanned, rateLimit } from "../auth/middleware.js";
import { address, connection, hash, platformKeypair, ownOperation, publicOperation, refreshOperation, broadcast, type Operation } from "../lib/money.js";

export const launchRoute=new Hono();
const input=z.object({id:z.string().uuid(),name:z.string().trim().min(2).max(50),ticker:z.string().regex(/^[A-Za-z0-9]{1,12}$/),description:z.string().max(2000),imageId:z.string().uuid(),creatorWallet:z.string().min(32).max(44),website:z.string().url().nullable().optional(),telegram:z.string().url().nullable().optional(),devBuySol:z.literal(0).default(0)});
launchRoute.get("/images/:id",async c=>{
 const id=z.string().uuid().safeParse(c.req.param("id"));if(!id.success)throw new HTTPException(404);
 const [image]=await db.select().from(launchImages).where(eq(launchImages.id,id.data));if(!image)throw new HTTPException(404);
 c.header("Content-Type",image.mime);c.header("X-Content-Type-Options","nosniff");c.header("Cache-Control","public, max-age=31536000, immutable");return c.body(new Uint8Array(Buffer.from(image.data,"base64")));
});
launchRoute.use("*",requireAuth);
launchRoute.get("/config",c=>c.json({enabled:env.LAUNCH_ENABLED&&env.LAUNCH_MAX_COST_SOL>0&&env.LAUNCH_DAILY_BUDGET_SOL>0,devBuyEnabled:false,platformFeeShareBps:env.PLATFORM_CREATOR_FEE_SHARE_BPS}));
launchRoute.post("/images",rateLimit("launch-image",10,3600),bodyLimit({maxSize:3_000_000}),zValidator("json",z.object({data:z.string().max(2_800_000)})),async c=>{
 requireNotBanned(c);const raw=c.req.valid("json").data;const match=/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(raw);
 if(!match)throw new HTTPException(400,{message:"Upload a PNG, JPEG, or WebP image"});const bytes=Buffer.from(match[2],"base64");
 const valid=match[1]==="image/png"?bytes.subarray(0,8).equals(Buffer.from("89504e470d0a1a0a","hex")):match[1]==="image/jpeg"?bytes[0]===255&&bytes[1]===216&&bytes[2]===255:bytes.toString("ascii",0,4)==="RIFF"&&bytes.toString("ascii",8,12)==="WEBP";
 if(!valid||bytes.length>2_000_000||bytes.length<16)throw new HTTPException(400,{message:"Invalid image or file exceeds 2 MB"});
 const [image]=await db.insert(launchImages).values({userId:c.get("user").id,mime:match[1],data:bytes.toString("base64")}).returning({id:launchImages.id});return c.json({id:image.id,url:`${env.PUBLIC_ASSET_ORIGIN}/v1/launch/images/${image.id}`},201);
});
function assertEnabled(){if(!Number.isInteger(env.PLATFORM_CREATOR_FEE_SHARE_BPS)||env.PLATFORM_CREATOR_FEE_SHARE_BPS<0||env.PLATFORM_CREATOR_FEE_SHARE_BPS>10000)throw new HTTPException(503,{message:"Creator fee split is not configured"});if(!env.LAUNCH_ENABLED||!Number.isFinite(env.LAUNCH_MAX_COST_SOL)||env.LAUNCH_MAX_COST_SOL<=0||!Number.isFinite(env.LAUNCH_DAILY_BUDGET_SOL)||env.LAUNCH_DAILY_BUDGET_SOL<=0)throw new HTTPException(503,{message:"Launches are awaiting platform funding and budget configuration"});}
launchRoute.post("/prepare",rateLimit("launch",2,3600),zValidator("json",input),async c=>{
 requireNotBanned(c);assertEnabled();const body=c.req.valid("json"),user=c.get("user");address(body.creatorWallet);
 const digest=hash(body);const [existing]=await db.select().from(moneyOperations).where(eq(moneyOperations.id,body.id));
 if(existing){if(existing.userId!==user.id||existing.kind!=="launch"||existing.requestHash!==digest)throw new HTTPException(409,{message:"Launch ID already used for different details"});return c.json(publicOperation(existing));}
 const [image]=await db.select().from(launchImages).where(and(eq(launchImages.id,body.imageId),eq(launchImages.userId,user.id)));if(!image)throw new HTTPException(400,{message:"Upload your token image first"});
 const platform=platformKeypair(),mint=Keypair.generate();
 const details={...body,ca:mint.publicKey.toBase58(),reservedLamports:Math.floor(env.LAUNCH_MAX_COST_SOL*1e9),platformFeeShareBps:env.PLATFORM_CREATOR_FEE_SHARE_BPS,imageUrl:`${env.PUBLIC_ASSET_ORIGIN}/v1/launch/images/${image.id}`};
 await db.transaction(async tx=>{
  await tx.execute(sql`SELECT pg_advisory_xact_lock(721931)`);
  const names=await tx.select({id:communities.id}).from(communities).where(eq(communities.name,body.name));if(names.length)throw new HTTPException(409,{message:"Community name is already taken"});
  const pending=await tx.execute(sql`SELECT id FROM money_operations WHERE kind='launch' AND status NOT IN ('failed','expired') AND details::jsonb->>'name'=${body.name}`);if(pending.length)throw new HTTPException(409,{message:"A launch with this name already exists"});
  const [spent]=await tx.execute(sql`SELECT COALESCE(SUM((details::jsonb->>'reservedLamports')::bigint),0)::text AS total FROM money_operations WHERE kind='launch' AND created_at >= date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'`);
  if(BigInt(String(spent.total))+BigInt(details.reservedLamports)>BigInt(Math.floor(env.LAUNCH_DAILY_BUDGET_SOL*1e9)))throw new HTTPException(429,{message:"Platform daily launch budget reached"});
  await tx.insert(moneyOperations).values({id:body.id,userId:user.id,kind:"launch",requestHash:digest,details:JSON.stringify(details)});
 });
 try{
  const form=new FormData();form.append("file",new Blob([new Uint8Array(Buffer.from(image.data,"base64"))],{type:image.mime}),"token");form.append("name",body.name);form.append("symbol",body.ticker.toUpperCase());form.append("description",body.description);form.append("showName","true");form.append("twitter",`https://x.com/${user.username}`);if(body.website)form.append("website",body.website);if(body.telegram)form.append("telegram",body.telegram);
  const ipfs=await fetch("https://pump.fun/api/ipfs",{method:"POST",body:form,signal:AbortSignal.timeout(20000)});if(!ipfs.ok)throw new Error("Token image publishing failed");const metadata=await ipfs.json() as {metadataUri:string};if(!metadata.metadataUri)throw new Error("Missing metadata URI");
  const res=await fetch("https://pumpportal.fun/api/trade-local",{method:"POST",headers:{"Content-Type":"application/json"},signal:AbortSignal.timeout(20000),body:JSON.stringify({publicKey:platform.publicKey.toBase58(),action:"create",tokenMetadata:{name:body.name,symbol:body.ticker.toUpperCase(),uri:metadata.metadataUri},mint:mint.publicKey.toBase58(),denominatedInSol:"true",amount:0,slippage:10,priorityFee:0.0005,pool:"pump"})});if(!res.ok)throw new Error("Launch transaction builder unavailable");
  const tx=VersionedTransaction.deserialize(new Uint8Array(await res.arrayBuffer()));
  const signers=tx.message.staticAccountKeys.slice(0,tx.message.header.numRequiredSignatures);
  if(signers.length!==2||!signers[0].equals(platform.publicKey)||!signers.some(k=>k.equals(mint.publicKey)))throw new Error("Unexpected launch signers");
  const bh=await connection.getLatestBlockhash("confirmed");tx.message.recentBlockhash=bh.blockhash;
  const before=await connection.getBalance(platform.publicKey);const sim=await connection.simulateTransaction(tx,{sigVerify:false,accounts:{encoding:"base64",addresses:[platform.publicKey.toBase58()]}});
  const after=sim.value.accounts?.[0]?.lamports;if(sim.value.err||after===undefined||after===null)throw new Error("Launch simulation failed; check platform funds");const cost=before-after;if(cost<0||cost>details.reservedLamports)throw new Error("Launch exceeds configured cost limit");
  const unsigned=Buffer.from(tx.serialize()).toString("base64");tx.sign([platform,mint]);
  const [op]=await db.update(moneyOperations).set({status:"prepared",transaction:unsigned,signedTransactionEnc:encrypt(Buffer.from(tx.serialize()).toString("base64")),lastValidBlockHeight:bh.lastValidBlockHeight,details:JSON.stringify({...details,estimatedCostLamports:cost}),updatedAt:new Date()}).where(and(eq(moneyOperations.id,body.id),eq(moneyOperations.status,"preparing"))).returning();if(!op)throw new Error("Preparation was cancelled");return c.json(publicOperation(op));
 }catch(e){await db.update(moneyOperations).set({status:"failed",error:"Preparation failed. No launch transaction was submitted.",updatedAt:new Date()}).where(eq(moneyOperations.id,body.id));throw new HTTPException(502,{message:e instanceof Error?e.message:"Could not prepare launch"});}
});
async function finish(op:Operation){
 if(op.status==="preparing" && Date.now()-op.createdAt.getTime()>600000){
  const [stale]=await db.update(moneyOperations).set({status:"failed",error:"Preparation was interrupted before submission. You may start a new launch."}).where(and(eq(moneyOperations.id,op.id),eq(moneyOperations.status,"preparing"))).returning();if(stale)return stale;
 }
 op=await refreshOperation(op);if(op.status!=="confirmed")return op;const d=JSON.parse(op.details);
 // Confirmation is checked before database writes. Retries repair only the community, never mint again.
 const account=await connection.getParsedAccountInfo(address(d.ca));const info=account.value?.data;if(!info||!("parsed" in info)||info.parsed.type!=="mint")throw new HTTPException(503,{message:"Waiting for mint verification"});
 return db.transaction(async tx=>{
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${op.id}))`);
  const [old]=await tx.select().from(communities).where(eq(communities.ca,d.ca));let community=old;
  if(!community){[community]=await tx.insert(communities).values({name:d.name,ticker:d.ticker.toUpperCase(),ca:d.ca,details:d.description,pfpUrl:d.imageUrl,ownerId:op.userId,creatorWallet:d.creatorWallet,platformFeeShareBps:d.platformFeeShareBps,launchedViaTribes:true,website:d.website,telegram:d.telegram}).returning();await tx.insert(communityMembers).values({communityId:community.id,userId:op.userId}).onConflictDoNothing();}
  const [done]=await tx.update(moneyOperations).set({status:"complete",details:JSON.stringify({...d,communityId:community.id}),updatedAt:new Date()}).where(eq(moneyOperations.id,op.id)).returning();return done;
 });
}
launchRoute.get("/recent",async c=>{const rows=await db.select().from(moneyOperations).where(and(eq(moneyOperations.userId,c.get("user").id),eq(moneyOperations.kind,"launch"))).orderBy(desc(moneyOperations.createdAt)).limit(20);return c.json(rows.map(publicOperation));});
launchRoute.post("/:id/submit",async c=>{requireNotBanned(c);assertEnabled();const op=await ownOperation(z.string().uuid().parse(c.req.param("id")),c.get("user").id,"launch");return c.json(publicOperation(await finish(await broadcast(op))));});
launchRoute.get("/:id",async c=>c.json(publicOperation(await finish(await ownOperation(z.string().uuid().parse(c.req.param("id")),c.get("user").id,"launch")))));
// The old one-shot endpoint must never spend funds without review.
launchRoute.post("/",c=>c.json({error:"Use the reviewed launch flow"},409));

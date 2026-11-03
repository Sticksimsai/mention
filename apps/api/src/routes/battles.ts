import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { battleChallenges, communities, communityMembers, eq, and, or, desc, sql, inArray, ilike } from "@mention/db";
import { battleChallengeSchema, BATTLE_RULES_VERSION, tokenAmountUnits, type BattleView, type BattleCoin } from "@mention/shared";
import { db } from "../lib/db.js";
import { hash } from "../lib/money.js";
import { requireAuth, requireNotBanned, rateLimit } from "../auth/middleware.js";

export const battlesRoute = new Hono();
const parseId = (id: string | undefined) => { const p=z.string().uuid().safeParse(id); if(!p.success)throw new HTTPException(400,{message:"Invalid ID"}); return p.data; };
function effectiveStatus(row: typeof battleChallenges.$inferSelect) {
  return row.status === "open" && row.expiresAt.getTime() <= Date.now() ? "expired" : row.status;
}
export async function battleViews(rows: (typeof battleChallenges.$inferSelect)[]): Promise<BattleView[]> {
  if (!rows.length) return [];
  const ids=[...new Set(rows.flatMap(r=>[r.challengerId,r.opponentId]))];
  const coins=await db.select({id:communities.id,name:communities.name,ticker:communities.ticker,pfpUrl:communities.pfpUrl,ownerId:communities.ownerId}).from(communities).where(inArray(communities.id,ids));
  const byId=new Map(coins.map(c=>[c.id,c as BattleCoin]));
  return rows.map(r=>({id:r.id,challenger:byId.get(r.challengerId)!,opponent:byId.get(r.opponentId)!,durationSecs:r.durationSecs,challengerStakeUnits:r.challengerStakeUnits,opponentStakeUnits:r.opponentStakeUnits,status:effectiveStatus(r) as BattleView["status"],rulesVersion:r.rulesVersion,createdAt:r.createdAt.toISOString(),expiresAt:r.expiresAt.toISOString(),acceptedAt:r.acceptedAt?.toISOString()??null,escrowFunded:false}));
}
battlesRoute.get("/config",c=>c.json({executionEnabled:false,reserveBpsOfDevBuy:5000,durations:[600,1800,3600],rulesVersion:BATTLE_RULES_VERSION}));
battlesRoute.get("/",async c=>{
  const communityId=c.req.query("communityId");if(communityId)parseId(communityId);
  const cursor=c.req.query("cursor");if(cursor&&!z.string().datetime().safeParse(cursor).success)throw new HTTPException(400,{message:"Invalid cursor"});
  const rows=await db.select().from(battleChallenges).where(and(communityId?or(eq(battleChallenges.challengerId,communityId),eq(battleChallenges.opponentId,communityId)):undefined,cursor?sql`${battleChallenges.createdAt} < ${new Date(cursor)}`:undefined)).orderBy(desc(battleChallenges.createdAt)).limit(41);
  const page=rows.slice(0,40);return c.json({items:await battleViews(page),nextCursor:rows.length>40?page[page.length-1].createdAt.toISOString():null});
});
battlesRoute.get("/community/:id/reserve",async c=>{
  const [coin]=await db.select({id:communities.id,ticker:communities.ticker}).from(communities).where(eq(communities.id,parseId(c.req.param("id"))));
  if(!coin)throw new HTTPException(404,{message:"Community not found"});
  return c.json({communityId:coin.id,ticker:coin.ticker,status:"not_connected",reserveBpsOfDevBuy:5000,availableUnits:null,lockedUnits:null,escrowAddress:null,executionEnabled:false});
});
battlesRoute.get("/coins",async c=>{
 const q=(c.req.query("q")??"").trim().slice(0,80);
 const pattern=`%${q.replace(/[%_\\]/g,"\\$&")}%`;
 const rows=await db.select({id:communities.id,name:communities.name,ticker:communities.ticker,pfpUrl:communities.pfpUrl,ownerId:communities.ownerId}).from(communities).where(and(eq(communities.status,"approved"),q?or(ilike(communities.name,pattern),ilike(communities.ticker,pattern)):undefined)).orderBy(desc(communities.createdAt)).limit(100);
 return c.json(rows);
});
battlesRoute.get("/mine",requireAuth,async c=>{
 const id=c.get("user").id;
 const owned=await db.select({id:communities.id,name:communities.name,ticker:communities.ticker,pfpUrl:communities.pfpUrl,ownerId:communities.ownerId}).from(communities).where(and(eq(communities.ownerId,id),eq(communities.status,"approved")));
 const joined=await db.select({id:communityMembers.communityId}).from(communityMembers).where(eq(communityMembers.userId,id));
 return c.json({ownedCoins:owned,ownedIds:owned.map(r=>r.id),communityIds:[...new Set([...owned,...joined].map(r=>r.id))]});
});
battlesRoute.get("/:id",async c=>{
 const [row]=await db.select().from(battleChallenges).where(eq(battleChallenges.id,parseId(c.req.param("id"))));
 if(!row)throw new HTTPException(404,{message:"Challenge not found"});return c.json((await battleViews([row]))[0]);
});
battlesRoute.post("/",requireAuth,rateLimit("battle-create",5,3600),zValidator("json",battleChallengeSchema),async c=>{
 requireNotBanned(c);const body=c.req.valid("json"),user=c.get("user"),digest=hash(body);
 const row=await db.transaction(async tx=>{
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${[body.challengerId,body.opponentId].sort().join(":")}))`);
  const [old]=await tx.select().from(battleChallenges).where(eq(battleChallenges.id,body.id));
  if(old){if(old.createdBy!==user.id||old.requestHash!==digest)throw new HTTPException(409,{message:"Challenge ID already used"});return old;}
  const coins=await tx.select().from(communities).where(inArray(communities.id,[body.challengerId,body.opponentId])).for("share");
  const a=coins.find(r=>r.id===body.challengerId),b=coins.find(r=>r.id===body.opponentId);
  if(!a||!b||a.status!=="approved"||b.status!=="approved")throw new HTTPException(400,{message:"Choose two approved communities"});
  if(a.ownerId!==user.id)throw new HTTPException(403,{message:"Only this community's owner can propose its stake"});
  if(a.ownerId===b.ownerId||a.ca===b.ca)throw new HTTPException(400,{message:"Choose an independently owned community with a different token"});
  const [duplicate]=await tx.select().from(battleChallenges).where(and(or(and(eq(battleChallenges.challengerId,a.id),eq(battleChallenges.opponentId,b.id)),and(eq(battleChallenges.challengerId,b.id),eq(battleChallenges.opponentId,a.id))),or(eq(battleChallenges.status,"accepted"),and(eq(battleChallenges.status,"open"),sql`${battleChallenges.expiresAt}>now()`))));
  if(duplicate)throw new HTTPException(409,{message:"These communities already have an open or agreed challenge"});
  const [created]=await tx.insert(battleChallenges).values({id:body.id,challengerId:a.id,opponentId:b.id,createdBy:user.id,challengerStakeUnits:tokenAmountUnits(body.challengerAmount).toString(),opponentStakeUnits:tokenAmountUnits(body.opponentAmount).toString(),durationSecs:body.durationSecs,rulesVersion:BATTLE_RULES_VERSION,requestHash:digest,expiresAt:new Date(Date.now()+86400000)}).returning();return created;
 });return c.json((await battleViews([row]))[0],201);
});
battlesRoute.post("/:id/:action",requireAuth,rateLimit("battle-action",20,60),async c=>{
 requireNotBanned(c);const id=parseId(c.req.param("id")),action=c.req.param("action")!,user=c.get("user");
 if(!["accept","cancel"].includes(action))throw new HTTPException(400,{message:"Unknown action"});
 const body=z.object({acknowledgeDraft:z.literal(true),rulesVersion:z.literal(BATTLE_RULES_VERSION)}).safeParse(await c.req.json());
 if(!body.success)throw new HTTPException(400,{message:"Acknowledge the current draft terms. No funds will be locked."});
 const result=await db.transaction(async tx=>{
  const [row]=await tx.select().from(battleChallenges).where(eq(battleChallenges.id,id)).for("update");
  if(!row)throw new HTTPException(404,{message:"Challenge not found"});
  const coins=await tx.select().from(communities).where(inArray(communities.id,[row.challengerId,row.opponentId])).for("share");
  const a=coins.find(r=>r.id===row.challengerId)!,b=coins.find(r=>r.id===row.opponentId)!;
  if(action==="accept"&&b.ownerId!==user.id)throw new HTTPException(403,{message:"Only the opposing community's owner can accept"});
  if(action==="cancel"&&a.ownerId!==user.id&&b.ownerId!==user.id)throw new HTTPException(403,{message:"Only the participating owners can cancel"});
  if(action==="accept"&&(a.ownerId===b.ownerId||a.status!=="approved"||b.status!=="approved"))throw new HTTPException(409,{message:"Both communities must remain independently owned and approved"});
  if(action==="accept"&&row.rulesVersion!==body.data.rulesVersion)throw new HTTPException(409,{message:"This challenge uses outdated draft terms"});
  if(action==="accept"&&row.status==="accepted")return row;
  if(action==="cancel"&&row.status==="cancelled")return row;
  const status=effectiveStatus(row);
  if((action==="accept"&&status!=="open")||(action==="cancel"&&!["open","accepted"].includes(status)))throw new HTTPException(409,{message:"This challenge is no longer open"});
  const [updated]=await tx.update(battleChallenges).set(action==="accept"?{status:"accepted",acceptedBy:user.id,acceptedAt:new Date()}:{status:"cancelled",closedAt:new Date()}).where(eq(battleChallenges.id,id)).returning();return updated;
 });return c.json((await battleViews([result]))[0]);
});

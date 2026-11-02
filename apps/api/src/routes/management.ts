import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { communities, communityMembers, users, posts, xPosts, xPostCommunities, modAuditLog, bannedUsers, xSyncState, eq, and, desc, sql } from "@mention/db";
import { db } from "../lib/db.js";
import { redis } from "../lib/redis.js";
import { requireAuth, requireStaff, requireNotBanned } from "../auth/middleware.js";
import { nativeToView, xToView } from "./feed.js";

export const managementRoute = new Hono();
managementRoute.use("*", requireAuth);
managementRoute.use("*", async (c, next) => { c.header("Cache-Control", "private, no-store"); requireNotBanned(c); await next(); });
const uuid = z.string().uuid();
function id(raw: string) { if (!uuid.safeParse(raw).success) throw new HTTPException(400, { message: "Invalid ID" }); return raw; }
export function canManageCommunity(user: {id:string;role:string|null}, ownerId: string) { return user.id === ownerId || user.role === "admin" || user.role === "moderator"; }

managementRoute.get("/communities", async c => {
 const u = c.get("user");
 const rows = await db.select().from(communities).where(u.role ? undefined : eq(communities.ownerId,u.id)).orderBy(desc(communities.createdAt)).limit(200);
 return c.json(rows);
});
managementRoute.get("/community/:id", async c => {
 const cid=id(c.req.param("id")); const u=c.get("user");
 const [community]=await db.select().from(communities).where(eq(communities.id,cid));
 if(!community) throw new HTTPException(404,{message:"Community not found"});
 if(!canManageCommunity(u,community.ownerId))throw new HTTPException(403,{message:"Community owner or staff only"});
 const [members,native,mirrored]=await Promise.all([
  db.select({id:users.id,username:users.username,displayName:users.displayName,pfpUrl:users.pfpUrl,joinedAt:communityMembers.createdAt}).from(communityMembers).innerJoin(users,eq(communityMembers.userId,users.id)).where(eq(communityMembers.communityId,cid)).orderBy(desc(communityMembers.createdAt)).limit(100),
  db.select({p:posts,u:users}).from(posts).innerJoin(users,eq(posts.authorId,users.id)).where(eq(posts.communityId,cid)).orderBy(desc(posts.createdAt)).limit(100),
  db.select({p:xPosts}).from(xPosts).innerJoin(xPostCommunities,eq(xPostCommunities.xPostId,xPosts.id)).where(eq(xPostCommunities.communityId,cid)).orderBy(desc(xPosts.tweetCreatedAt)).limit(100)
 ]);
 const searchState=await redis.get(`x-search:${cid}`);
 return c.json({community,members,sync:searchState?JSON.parse(searchState):null,canEdit:u.id===community.ownerId||u.role==="admin",posts:[...native.map(r=>({...nativeToView(r.p,r.u,community),hidden:r.p.hidden})),...mirrored.map(r=>({...xToView(r.p,cid,community),hidden:r.p.hidden}))].sort((a,b)=>b.createdAt.localeCompare(a.createdAt))});
});
managementRoute.get("/overview", async c => {
 requireStaff(c);
 const [[userCount],[communityCount],[postCount],bans,audit] = await Promise.all([
  db.select({n:sql<number>`count(*)::int`}).from(users),db.select({n:sql<number>`count(*)::int`}).from(communities),db.select({n:sql<number>`count(*)::int`}).from(posts),
  db.select({username:users.username,reason:bannedUsers.reason}).from(bannedUsers).innerJoin(users,eq(bannedUsers.userId,users.id)).limit(100),
  db.select().from(modAuditLog).orderBy(desc(modAuditLog.createdAt)).limit(30)
 ]);
 return c.json({users:userCount.n,communities:communityCount.n,posts:postCount.n,bans,audit});
});
managementRoute.get("/posts", async c => {
 requireStaff(c);
 const [native,mirrored]=await Promise.all([
  db.select({p:posts,u:users,c:communities}).from(posts).innerJoin(users,eq(posts.authorId,users.id)).leftJoin(communities,eq(posts.communityId,communities.id)).orderBy(desc(posts.createdAt)).limit(100),
  db.select().from(xPosts).orderBy(desc(xPosts.tweetCreatedAt)).limit(100)
 ]);
 return c.json([...native.map(r=>({...nativeToView(r.p,r.u,r.c),hidden:r.p.hidden})),...mirrored.map(p=>({...xToView(p,"",null),hidden:p.hidden}))].sort((a,b)=>b.createdAt.localeCompare(a.createdAt)));
});
const control = z.object({hidden:z.boolean().optional(),globalPinned:z.boolean().optional(),pinned:z.boolean().optional()}).strict().refine(v=>Object.keys(v).length>0,"Choose a control");
managementRoute.patch("/posts/:id",zValidator("json",control),async c=>{
 const raw=c.req.param("id");if(!/^[nx]:/.test(raw))throw new HTTPException(400,{message:"Invalid post ID"});const pid=id(raw.slice(2));
 const u=c.get("user"), body=c.req.valid("json"),native=raw.startsWith("n:");
 if(!native && body.pinned!==undefined)throw new HTTPException(400,{message:"Community pins are available for native posts"});
 const [post]=native?await db.select().from(posts).where(eq(posts.id,pid)):await db.select().from(xPosts).where(eq(xPosts.id,pid));
 if(!post)throw new HTTPException(404,{message:"Post not found"});
 let cid:string|null=native?(post as typeof posts.$inferSelect).communityId:null;
 if(body.hidden!==undefined||body.globalPinned!==undefined)requireStaff(c);
 if(body.pinned!==undefined){
  if(!cid)throw new HTTPException(400,{message:"Use Pin sitewide for this post"});
  const [comm]=await db.select().from(communities).where(eq(communities.id,cid));
  if(!comm||!canManageCommunity(u,comm.ownerId))throw new HTTPException(403,{message:"Community owner or staff only"});
 }
 const table=native?posts:xPosts;
 await db.transaction(async tx=>{
  await tx.update(table).set(body).where(eq(table.id,pid));
  await tx.insert(modAuditLog).values({actorId:u.id,action:"post.moderate",targetType:"post",targetId:raw,meta:JSON.stringify(body)});
 });
 await redis.del("feed:v3:markets:global","feed:v3:posts:global",...(cid?[`feed:v3:markets:${cid}`,`feed:v3:posts:${cid}`]:[])).catch(()=>{});
 return c.json({ok:true});
});
// Owners may remove native posts in their own community. They cannot hide an X
// post globally, grant staff privileges, or touch another community's content.
managementRoute.post("/community/:id/posts/:postId/hide",zValidator("json",z.object({hidden:z.boolean()})),async c=>{
 const cid=id(c.req.param("id")),pid=id(c.req.param("postId")),u=c.get("user");
 const [comm]=await db.select().from(communities).where(eq(communities.id,cid));
 if(!comm||!canManageCommunity(u,comm.ownerId))throw new HTTPException(403,{message:"Community owner or staff only"});
 const [post]=await db.select().from(posts).where(and(eq(posts.id,pid),eq(posts.communityId,cid)));
 if(!post)throw new HTTPException(404,{message:"Post not found in this community"});
 const {hidden}=c.req.valid("json");
 await db.transaction(async tx=>{await tx.update(posts).set({hidden}).where(eq(posts.id,pid));await tx.insert(modAuditLog).values({actorId:u.id,action:hidden?"community.post.hide":"community.post.restore",targetType:"post",targetId:`n:${pid}`,meta:JSON.stringify({communityId:cid})});});
 await redis.del("feed:v3:markets:global","feed:v3:posts:global",`feed:v3:markets:${cid}`,`feed:v3:posts:${cid}`).catch(()=>{});
 return c.json({ok:true});
});

managementRoute.get("/sync",async c=>{
 requireStaff(c);
 const [accounts,[pending],[failed],lastSearch]=await Promise.all([
  db.select({username:xSyncState.username,lastSyncedAt:xSyncState.lastSyncedAt,lastError:xSyncState.lastError,nextEligibleAt:xSyncState.nextEligibleAt}).from(xSyncState).orderBy(desc(xSyncState.lastSyncedAt)).limit(100),
  db.select({n:sql<number>`count(*)::int`}).from(posts).where(eq(posts.crosspostStatus,"pending")),
  db.select({n:sql<number>`count(*)::int`}).from(posts).where(eq(posts.crosspostStatus,"failed")),
  redis.get("x-search:last-run")
 ]);
 const comms=await db.select({id:communities.id,name:communities.name}).from(communities).where(eq(communities.status,"approved")).limit(100);
 const searches=await Promise.all(comms.map(async community=>{const value=await redis.get(`x-search:${community.id}`);return {...community,...(value?JSON.parse(value):{})};}));
 return c.json({pollSeconds:60,pendingWritebacks:pending.n,failedWritebacks:failed.n,lastSearch,accounts,searches});
});

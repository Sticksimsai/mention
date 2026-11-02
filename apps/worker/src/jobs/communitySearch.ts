import { communities, users, eq } from "@mention/db";
import { OFFICIAL_ACCOUNT_ID } from "@mention/shared";
import { db,redis } from "../lib/context.js";
import { sdGet } from "../lib/socialdata.js";
import { matchingCommunities,persistTweet } from "../lib/mirror.js";

export interface SearchState {since:number;query?:string;cursor?:string;windowEnd?:number;lastCheckedAt?:string;lastError?:string|null;lastImported?:number}
export function searchWindow(c:{ticker:string;ca:string},state:SearchState,now:number){
 if(state.query)return {query:state.query,windowEnd:state.windowEnd!,cursor:state.cursor};
 if(!/^[a-z0-9]{1,12}$/i.test(c.ticker)||!c.ca.match(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/))throw new Error("Invalid community search terms");
 return {query:`("$${c.ticker}" OR "${c.ca}") since_time:${Math.max(0,state.since-120)} until_time:${now}`,windowEnd:now,cursor:undefined};
}
export async function communitySearchJob(communityId:string){
 const [community]=await db.select().from(communities).where(eq(communities.id,communityId));
 if(!community||community.status!=="approved")return;
 const key=`x-search:${communityId}`;
 const saved=await redis.get(key);let state:SearchState=saved?JSON.parse(saved):{since:Math.floor(Date.now()/1000)-3600};
 const [account]=await db.select().from(users).where(eq(users.id,OFFICIAL_ACCOUNT_ID));
 const window=searchWindow(community,state,Math.floor(Date.now()/1000));
 let cursor=window.cursor,imported=0;
 try{
  // Bounded pages per run; retain the exact query/cursor for the next minute.
  for(let page=0;page<5;page++){
   const params=new URLSearchParams({query:window.query,type:"Latest"});if(cursor)params.set("cursor",cursor);
   const result=await sdGet("community-search",`/twitter/search?${params}`);
   for(const tweet of result?.tweets??[]){
    const matches=matchingCommunities(tweet.full_text??tweet.text??"",[community]);
    if(matches.length&&await persistTweet(tweet,matches,Boolean(account?.xUserId&&tweet.user?.id_str===account.xUserId)))imported++;
   }
   const next=typeof result?.next_cursor==="string"?result.next_cursor:undefined;
   if(!next||!(result?.tweets?.length)){
    state={since:window.windowEnd,lastCheckedAt:new Date().toISOString(),lastError:null,lastImported:imported};
    await redis.set(key,JSON.stringify(state));break;
   }
   if(next===cursor)throw new Error("Search cursor did not advance");
   cursor=next;
   state={...state,query:window.query,windowEnd:window.windowEnd,cursor,lastCheckedAt:new Date().toISOString(),lastError:null,lastImported:imported};
   await redis.set(key,JSON.stringify(state));
  }
  await redis.set("x-search:last-run",new Date().toISOString());
 }catch(error){
  state={...state,lastError:error instanceof Error?error.message.slice(0,160):"Search unavailable"};
  await redis.set(key,JSON.stringify(state));throw error;
 }
 return {imported,catchingUp:Boolean(state.cursor)};
}

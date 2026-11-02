// One-minute account polling, plus independent public ticker/CA discovery.
import {users,communities,xSyncState,eq} from "@mention/db";
import {OFFICIAL_ACCOUNT_ID} from "@mention/shared";
import {matchingCommunities,persistTweet} from "../lib/mirror.js";
import {db,redis} from "../lib/context.js";
import {fetchUserTweets} from "../lib/socialdata.js";
export async function tweetSyncJob(username:string):Promise<{found:number}>{
 const uname=username.toLowerCase();
 if(!/^\w{1,15}$/.test(uname))return {found:0};
 const [state]=await db.select().from(xSyncState).where(eq(xSyncState.username,uname));
 if(state?.nextEligibleAt&&state.nextEligibleAt>new Date())return {found:0};
 const key=`x-timeline:${uname}`,saved=await redis.get(key);
 let progress:{since:string|null;newest:string|null;cursor?:string}=saved?JSON.parse(saved):{since:state?.lastTweetId??null,newest:state?.lastTweetId??null};
 const [officialAccount]=await db.select().from(users).where(eq(users.id,OFFICIAL_ACCOUNT_ID));
 const matchers=await db.select({id:communities.id,ticker:communities.ticker,ca:communities.ca}).from(communities).where(eq(communities.status,"approved"));
 let found=0,complete=false;
 try{
  for(let page=0;page<5;page++){
   const data=await fetchUserTweets("tweet-sync",uname,progress.since,progress.cursor);
   for(const t of data?.tweets??[]){
    if(typeof t.id_str!=="string"||!/^\d+$/.test(t.id_str))continue;
    if(!progress.newest||BigInt(t.id_str)>BigInt(progress.newest))progress.newest=t.id_str;
    const matches=matchingCommunities(t.full_text??t.text??"",matchers);
    const official=Boolean(officialAccount?.xUserId&&t.user?.id_str===officialAccount.xUserId);
    if((matches.length||official)&&await persistTweet(t,matches,official))found++;
   }
   const cursor=typeof data?.next_cursor==="string"?data.next_cursor:undefined;
   if(!cursor||!data?.tweets?.length){complete=true;break;}
   if(cursor===progress.cursor)throw new Error("Timeline cursor did not advance");
   progress.cursor=cursor;await redis.set(key,JSON.stringify(progress));
  }
  const values={username:uname,lastTweetId:complete?progress.newest:state?.lastTweetId??null,consecutiveEmptyRuns:found?0:(state?.consecutiveEmptyRuns??0)+1,nextEligibleAt:new Date(Date.now()+60000),lastSyncedAt:new Date(),lastError:null};
  await db.insert(xSyncState).values(values).onConflictDoUpdate({target:xSyncState.username,set:values});
  if(complete)await redis.del(key);
  if(found)await redis.del("feed:v3:markets:global","feed:v3:posts:global");
 }catch(error){
  const lastError=error instanceof Error?error.message.slice(0,160):"Timeline unavailable";
  await db.insert(xSyncState).values({username:uname,lastError}).onConflictDoUpdate({target:xSyncState.username,set:{lastError}});
  throw error;
 }
 return {found};
}

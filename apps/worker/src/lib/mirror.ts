import { communities, xPosts, xPostCommunities, posts, eq, sql } from "@mention/db";
import { db, redis } from "./context.js";
export interface MatchCommunity {id:string;ticker:string;ca:string;isExample?:boolean}
export function matchingCommunities(text:string, rows:MatchCommunity[]) {
 return rows.flatMap(c=>{
  if(c.isExample)return [];
  // Solana addresses are case-sensitive. Require the full base58 token.
  const ca=c.ca && text.split(/[^1-9A-HJ-NP-Za-km-z]+/).includes(c.ca);
  const ticker=/^[a-z0-9]{1,12}$/i.test(c.ticker)&&new RegExp(`(?:^|[^a-z0-9_])\\$${c.ticker}(?![a-z0-9_])`,"i").test(text);
  return ca||ticker?[{communityId:c.id,matchedOn:ca?"ca":"ticker"}]:[];
 });
}
export async function persistTweet(t:any,matches:ReturnType<typeof matchingCommunities>,official=false){
 const tweetId=t?.id_str,username=t?.user?.screen_name;
 if(typeof tweetId!=="string"||!/^\d+$/.test(tweetId)||typeof username!=="string"||!/^\w{1,15}$/.test(username))return false;
 const verified=typeof t.user.is_blue_verified==="boolean"?t.user.is_blue_verified:t.user.verified;
 if(typeof verified==="boolean")await redis.set(`x-author-verification:${username.toLowerCase()}`,verified?"verified":"unverified","EX",900);
 const date=new Date(t.tweet_created_at??t.created_at);if(!Number.isFinite(date.getTime()))return false;
 // A successful native cross-post already has its own card and engagement.
 const [native]=await db.select({id:posts.id}).from(posts).where(eq(posts.xTweetId,tweetId)).limit(1);
 if(native)return false;
 const media=(t.extended_entities?.media??t.entities?.media??[])[0];
 const values={tweetId,authorUsername:username.toLowerCase(),authorName:t.user.name??username,authorPfpUrl:(t.user.profile_image_url_https??"").replace("_normal.","_400x400."),content:t.full_text??t.text??"",imageUrl:media?.media_url_https??null,tweetUrl:`https://x.com/${username}/status/${tweetId}`,tweetCreatedAt:date,likesCount:t.favorite_count??0,repostsCount:t.retweet_count??0,repliesCount:t.reply_count??0,viewsCount:Number(t.views_count??0),official};
 await db.transaction(async tx=>{
  const [post]=await tx.insert(xPosts).values(values).onConflictDoUpdate({target:xPosts.tweetId,set:{likesCount:values.likesCount,repostsCount:values.repostsCount,repliesCount:values.repliesCount,viewsCount:values.viewsCount,official:sql`${xPosts.official} OR ${official}`}}).returning();
  for(const m of matches)await tx.insert(xPostCommunities).values({xPostId:post.id,...m}).onConflictDoNothing();
 });
 return true;
}

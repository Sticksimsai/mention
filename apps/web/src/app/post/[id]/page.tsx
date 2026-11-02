"use client";
import Link from "next/link";
import { useState } from "react";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { type StickerView, type PostView } from "@mention/shared";
import { Shell } from "@/components/Shell";
import { PostCard } from "@/components/Feed";
import { api } from "@/lib/api";
import {PostInteraction} from "@/components/PostInteraction";
import {CommunitySticker} from "@/components/PostAttachments";
import {TickerText} from "@/components/TickerText";
import { useMe } from "@/lib/hooks";
interface Reply {id:string;content:string;mediaUrl?:string|null;sticker?:StickerView|null;createdAt:string;author:{username:string;name:string;pfpUrl:string}}
export default function ThreadPage(){
 const {id:routeId}=useParams<{id:string}>();
 // Next may retain the encoded colon in a dynamic route parameter.
 const id=routeId.replace(/^([nx])%3a/i,"$1:");const {me,login}=useMe();const [replyOpen,setReplyOpen]=useState(false);
 const post=useQuery({queryKey:["post",id,me?.id],queryFn:()=>api<PostView>(`/v1/posts/${encodeURIComponent(id)}${me?`?viewerId=${me.id}`:""}`,{auth:false})});
 const replies=useQuery({queryKey:["replies",id],enabled:!!post.data,queryFn:()=>api<Reply[]>(`/v1/posts/${encodeURIComponent(id)}/replies`,{auth:false}),refetchInterval:20000});

 return <Shell><header className="border-b hairline p-5"><Link href="/" className="text-xs text-muted">← Home</Link><h1 className="mt-3 font-display text-lg">conversation</h1></header>{post.isError?<div role="alert" className="p-5">{post.error.message} <button onClick={()=>post.refetch()} className="text-volt">Retry</button></div>:!post.data?<p className="p-5 text-muted">Loading post…</p>:<><PostCard post={post.data}/><section className="border-b hairline p-5"><h2 className="mb-4 text-sm font-semibold">Replies on Mentions</h2>{me?<><button onClick={()=>setReplyOpen(true)} className="w-full rounded-xl border hairline bg-surface px-4 py-4 text-left text-sm text-muted hover:bg-raised">Add to the conversation… <span className="float-right text-volt">Reply</span></button>{replyOpen&&<PostInteraction post={post.data} mode="reply" onClose={()=>setReplyOpen(false)}/>}</>:<button onClick={login} className="text-sm text-volt">Sign in to reply</button>}</section>{replies.isError?<div role="alert" className="p-5">Could not load replies. <button className="text-volt" onClick={()=>replies.refetch()}>Retry</button></div>:replies.isPending?<p className="p-5 text-sm text-muted">Loading replies…</p>:!replies.data?.length?<p className="p-8 text-center text-sm text-muted">Start the conversation.</p>:replies.data.map(r=><article key={r.id} className="flex gap-3 border-b hairline p-5">{r.author.pfpUrl?<img src={r.author.pfpUrl} alt="" className="h-9 w-9 rounded-full"/>:<div className="h-9 w-9 shrink-0 rounded-full bg-raised"/>}<div className="min-w-0"><Link href={`/u/${r.author.username}`} className="text-sm font-semibold">{r.author.name} <span className="font-normal text-muted">@{r.author.username}</span></Link><p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6"><TickerText text={r.content}/></p>{r.mediaUrl&&<img src={r.mediaUrl} alt="Reply attachment" loading="lazy" className="mt-3 max-h-96 max-w-full rounded-xl object-contain"/>}{r.sticker&&<CommunitySticker sticker={r.sticker}/>}<time dateTime={r.createdAt} className="mt-2 block text-xs text-muted">{new Date(r.createdAt).toLocaleString()}</time></div></article>)}{replies.data?.length===200&&<p className="p-5 text-xs text-muted">Showing the first 200 replies.</p>}</>}</Shell>;
}

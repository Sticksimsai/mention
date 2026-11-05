"use client";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { PostView } from "@mention/shared";
import { api } from "@/lib/api";
import { useMe } from "@/lib/hooks";

export const field = "w-full rounded-xl border hairline bg-ink px-3 py-2.5 text-sm outline-none focus:border-volt/60";
export const control = "rounded-lg border hairline px-3 py-2 text-xs font-medium hover:border-volt/50 hover:text-volt disabled:opacity-40";
export function ManagementGate({children,staff=false}:{children:React.ReactNode;staff?:boolean}){
 const {me,isLoading,authenticated,login,error,retry}=useMe();
 if(isLoading)return <p className="p-6 text-sm text-muted">Loading your permissions…</p>;
 if(!authenticated)return <div className="p-8"><h2 className="text-lg font-semibold">Sign in to manage onlycults</h2><p className="mt-2 text-sm text-muted">Your account determines which controls you can access.</p><button className="mt-5 rounded-xl bg-volt px-5 py-3 text-sm font-semibold text-ink" onClick={login}>Sign in with X</button></div>;
 if(error)return <div className="p-6 text-sm">Could not load permissions. <button className="text-volt" onClick={()=>retry()}>Retry</button></div>;
 if(!me||staff&&!me.role)return <p className="p-6 text-sm text-muted">This portal is for site staff. <Link className="text-volt" href="/manage">Open your community portal →</Link></p>;
 return <>{children}</>;
}
export function Panel({title,description,children}:{title:string;description?:string;children:React.ReactNode}){return <section className="rounded-2xl border hairline bg-surface p-4 sm:p-5"><h2 className="text-base font-semibold">{title}</h2>{description&&<p className="mt-1 text-sm leading-6 text-muted">{description}</p>}<div className="mt-4">{children}</div></section>}
export function Result({mutation}:{mutation:{isError:boolean;error:Error|null;isSuccess:boolean}}){return <p aria-live="polite" className={`mt-2 text-xs ${mutation.isError?"text-down":"text-volt"}`}>{mutation.isError?mutation.error?.message:mutation.isSuccess?"Saved.":""}</p>}
export type ManagedPost = PostView & {hidden:boolean};
export function PostControls({items,communityId}:{items:ManagedPost[];communityId?:string}){
 const {me}=useMe();const qc=useQueryClient();
 const change=useMutation({mutationFn:({post,kind,value}:{post:ManagedPost;kind:"hidden"|"pinned"|"globalPinned";value:boolean})=>{
  if(communityId&&kind==="hidden"&&!me?.role)return api(`/v1/manage/community/${communityId}/posts/${post.id.slice(2)}/hide`,{method:"POST",body:{hidden:value}});
  return api(`/v1/manage/posts/${post.id}`,{method:"PATCH",body:{[kind]:value}});
 },onSuccess:()=>{qc.invalidateQueries({queryKey:["manage"]});qc.invalidateQueries({queryKey:["feed"]});}});
 return <><Result mutation={change}/>{items.length===0?<p className="py-5 text-sm text-muted">No posts yet. Published posts will appear here.</p>:<div className="divide-y divide-white/10">{items.map(post=><article key={post.id} className="py-4"><div className="flex flex-wrap items-center gap-2 text-xs text-muted"><Link href={`/u/${post.author.username}`} className="font-medium text-fg">@{post.author.username}</Link><span>{post.source==="x"?"From X":"onlycults post"}</span>{post.official&&<span className="text-volt">Official</span>}{post.hidden&&<span className="text-down">Hidden</span>}{post.globalPinned&&<span className="text-volt">Pinned sitewide</span>}{post.pinned&&<span className="text-volt">Community pin</span>}</div><p className="my-3 whitespace-pre-wrap break-words text-sm leading-6">{post.content}</p><div className="flex flex-wrap gap-2"><Link className={control} href={`/post/${encodeURIComponent(post.id)}`}>View post ↗</Link>{me?.role&&<button className={control} disabled={change.isPending} onClick={()=>change.mutate({post,kind:"globalPinned",value:!post.globalPinned})}>{post.globalPinned?"Unpin sitewide":"Pin sitewide"}</button>}{communityId&&post.source==="native"&&<button className={control} disabled={change.isPending} onClick={()=>change.mutate({post,kind:"pinned",value:!post.pinned})}>{post.pinned?"Unpin in community":"Pin in community"}</button>}{(me?.role||communityId&&post.source==="native")&&<button className={control} disabled={change.isPending} onClick={()=>change.mutate({post,kind:"hidden",value:!post.hidden})}>{post.hidden?"Restore post":"Hide post"}</button>}</div></article>)}</div>}</>;
}
export interface ManagedCommunity {id:string;slug?:string;name:string;ticker:string;pfpUrl:string;bannerUrl:string;details:string;website:string|null;twitterUrl?:string|null;launchedViaTribes?:boolean;telegram:string|null;xCommunityUrl:string|null;postCooldownSecs:number;status:string;membersCount:number;ownerId:string;ca:string}
export function CommunityDirectory(){
 const list=useQuery({queryKey:["manage","communities"],queryFn:()=>api<ManagedCommunity[]>("/v1/manage/communities")});
 if(list.isPending)return <p className="text-sm text-muted">Loading communities…</p>;
 if(list.isError)return <p className="text-sm text-down">{list.error.message} <button onClick={()=>list.refetch()}>Retry</button></p>;
 if(!list.data.length)return <div className="py-6"><p className="text-sm text-muted">You don’t own a token community yet. Your community dashboard appears here after a successful launch.</p><Link className="mt-4 inline-block text-sm text-volt" href="/launch">Open launchpad →</Link></div>;
 return <div className="grid gap-3 sm:grid-cols-2">{list.data.map(c=><Link key={c.id} href={`/manage/${c.id}`} className="rounded-xl border hairline bg-ink p-4 hover:border-volt/40"><div className="flex items-center gap-3">{c.pfpUrl?<img src={c.pfpUrl} alt="" className="h-10 w-10 rounded-xl object-cover"/>:<span className="flex h-10 w-10 items-center justify-center rounded-xl bg-raised text-volt">$</span>}<div className="min-w-0"><p className="truncate font-semibold">{c.name}</p><p className="text-xs text-muted">${c.ticker} · {c.membersCount} members</p></div></div><p className="mt-4 flex justify-between text-xs"><span className="capitalize text-muted">{c.status}</span><span className="text-volt">Manage →</span></p></Link>)}</div>;
}
export { CommunitySettings } from "./CommunitySettings";

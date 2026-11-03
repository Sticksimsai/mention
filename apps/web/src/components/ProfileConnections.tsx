"use client";
import {useState} from "react";
import Link from "next/link";
import {useQuery,useMutation,useQueryClient,useInfiniteQuery} from "@tanstack/react-query";
import {api} from "@/lib/api";
import {useMe} from "@/lib/hooks";
import {Modal} from "./Modal";
export function FollowButton({username,id}:{username:string;id:string}){
 const {me,authenticated,login,isLoading}=useMe();const qc=useQueryClient();
 const relationship=useQuery({queryKey:["follow-status",username,me?.id],queryFn:()=>api<{following:boolean}>(`/v1/users/${encodeURIComponent(username)}/follow-status`),enabled:Boolean(me&&me.id!==id)});
 const change=useMutation({mutationFn:()=>api(`/v1/users/${encodeURIComponent(username)}/${relationship.data?.following?"unfollow":"follow"}`,{method:"POST"}),onSuccess:()=>{qc.invalidateQueries({queryKey:["follow-status",username]});qc.invalidateQueries({queryKey:["profile"]});qc.invalidateQueries({queryKey:["connections"]});}});
 if(me?.id===id)return null;
 return <div><button disabled={isLoading||change.isPending||Boolean(me&&relationship.isPending)} onClick={()=>authenticated?relationship.isError?relationship.refetch():change.mutate():login()} className={`rounded-xl px-4 py-2 text-xs font-semibold ${relationship.data?.following?"border hairline text-fg hover:text-down":"bg-volt text-ink"}`}>{change.isPending?"Saving…":relationship.isError?"Retry follow status":relationship.data?.following?"Following · Unfollow":"Follow"}</button>{change.isError&&<p role="alert" className="mt-2 max-w-48 text-xs text-down">{change.error.message}</p>}</div>;
}
export function ProfileConnections({username,followers,following}:{username:string;followers:number;following:number}){
 const [kind,setKind]=useState<"followers"|"following"|null>(null);
 return <><div className="mt-3 flex flex-wrap gap-5 text-xs text-muted"><button className="hover:underline" onClick={()=>setKind("following")}><strong className="mr-1 text-fg">{following.toLocaleString()}</strong>following on Mentions</button><button className="hover:underline" onClick={()=>setKind("followers")}><strong className="mr-1 text-fg">{followers.toLocaleString()}</strong>followers on Mentions</button></div><Modal open={Boolean(kind)} onClose={()=>setKind(null)} title={kind??"Connections"}>{kind&&<ConnectionList key={`${username}:${kind}`} username={username} kind={kind}/>}</Modal></>;
}
function ConnectionList({username,kind}:{username:string;kind:"followers"|"following"}){
 const query=useInfiniteQuery({queryKey:["connections",username,kind],initialPageParam:0,queryFn:({pageParam})=>api<{items:{id:string;username:string;displayName:string;pfpUrl:string}[];nextOffset:number|null}>(`/v1/users/${encodeURIComponent(username)}/connections?type=${kind}&offset=${pageParam}`,{auth:false}),getNextPageParam:last=>last.nextOffset??undefined});
 const people=query.data?.pages.flatMap(p=>p.items)??[];
 return <div className="p-6 pt-14"><h2 className="text-lg font-semibold capitalize">{kind}</h2><p className="mt-1 text-xs text-muted">@{username} · Mentions connections</p>{query.isPending?<p className="py-8 text-sm text-muted">Loading…</p>:query.isError?<button onClick={()=>query.refetch()} className="py-8 text-sm text-volt">Could not load connections. Retry</button>:people.length?<div className="mt-4 divide-y divide-white/10">{people.map(p=><div key={p.id} className="flex items-center gap-3 py-3">{p.pfpUrl&&<img alt="" src={p.pfpUrl} className="h-9 w-9 rounded-full"/>}<Link href={`/u/${p.username}`} className="min-w-0 flex-1"><p className="user-display-name truncate">{p.displayName}</p><p className="text-xs text-muted">@{p.username}</p></Link><FollowButton username={p.username} id={p.id}/></div>)}</div>:<p className="py-8 text-sm text-muted">No {kind} yet.</p>}{query.hasNextPage&&<button disabled={query.isFetchingNextPage} onClick={()=>query.fetchNextPage()} className="mt-4 text-sm text-volt">Show more</button>}</div>;
}

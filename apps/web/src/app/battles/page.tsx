"use client";
import { useState } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import type { BattleView } from "@mention/shared";
import { Shell } from "@/components/Shell";
import { BattleCard, BattleDemo, BattleNotice, ChallengeForm, battleButton } from "@/components/Battles";
import { api } from "@/lib/api";
import { useMe } from "@/lib/hooks";

export default function BattlesPage(){
 const {me,login}=useMe();const [filter,setFilter]=useState("All");const [search,setSearch]=useState("");const [form,setForm]=useState(false);const [demo,setDemo]=useState(false);
 const feed=useInfiniteQuery({queryKey:["battles"],initialPageParam:null as string|null,queryFn:({pageParam})=>api<{items:BattleView[];nextCursor:string|null}>(`/v1/battles${pageParam?`?cursor=${encodeURIComponent(pageParam)}`:""}`,{auth:false}),getNextPageParam:p=>p.nextCursor,refetchInterval:30000});
 const mine=useQuery({queryKey:["battle-mine",me?.id],enabled:!!me,queryFn:()=>api<{communityIds:string[]}>("/v1/battles/mine")});
 const items=(feed.data?.pages.flatMap(p=>p.items)??[]).filter(b=>{
  if(filter==="Live"||filter==="Completed")return false;
  if(filter==="Open"&&b.status!=="open")return false;
  if(filter==="My communities"&&!mine.data?.communityIds.some(id=>[b.challenger.id,b.opponent.id].includes(id)))return false;
  return `${b.challenger.ticker} ${b.challenger.name} ${b.opponent.ticker} ${b.opponent.name}`.toLowerCase().includes(search.toLowerCase());
 });
 return <Shell wide><div className="border-b hairline p-5 sm:p-7"><p className="mb-3 text-xs uppercase tracking-widest text-muted">Community vs community</p><h1 className="font-display text-xl">battles</h1><p className="mt-4 max-w-xl text-sm leading-6 text-muted">Your coin. Your side. Challenge another community to a 10-minute, 30-minute or one-hour token performance round.</p><div className="mt-5 flex flex-wrap gap-3"><button className={battleButton} onClick={()=>setForm(!form)}>Propose a battle</button><button aria-pressed={demo} className="rounded-xl border hairline px-4 py-3 text-sm" onClick={()=>setDemo(!demo)}>{demo?"Hide demo":"Try the demo"}</button></div></div><div className="space-y-5 p-4 sm:p-7"><BattleNotice/>{demo&&<BattleDemo/>}{form&&<ChallengeForm onClose={()=>setForm(false)}/>}
 <div className="flex flex-wrap gap-2" aria-label="Filter battles">{["All","Open","Live","Completed","My communities"].map(t=><button aria-pressed={filter===t} key={t} onClick={()=>setFilter(t)} className={`rounded-full border px-4 py-2 text-xs ${filter===t?"border-volt/30 bg-volt/10 text-volt":"hairline text-muted"}`}>{t}</button>)}</div><input aria-label="Search battles" placeholder="Search coins or communities" className="w-full rounded-xl border hairline bg-surface px-4 py-3 text-sm" value={search} onChange={e=>setSearch(e.target.value)}/>
 {feed.isError?<div role="alert" className="rounded-xl border hairline p-6">Could not load battles. <button onClick={()=>feed.refetch()} className="text-volt">Retry</button></div>:feed.isPending?<p className="py-10 text-center text-sm text-muted">Loading battles…</p>:filter==="My communities"&&!me?<button className={battleButton} onClick={login}>Sign in to see your communities</button>:filter==="My communities"&&mine.isError?<button onClick={()=>mine.refetch()} className="text-volt">Could not load memberships. Retry</button>:filter==="My communities"&&mine.isPending?<p className="text-muted">Loading your communities…</p>:items.length?<div className="grid gap-4 sm:grid-cols-2">{items.map(b=><BattleCard key={b.id} battle={b}/>)}</div>:<div className="rounded-2xl border border-dashed hairline px-6 py-14 text-center"><h2 className="font-semibold">{filter==="Live"?"No live rounds yet":filter==="Completed"?"No settled battles yet":"No matching challenges yet"}</h2><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted">{["Live","Completed"].includes(filter)?"Escrow and verified settlement must be connected before rounds can run. Explore the demo to see the format.":"Community owners can propose stakes and invite an opponent to agree on draft terms."}</p></div>}
 {feed.hasNextPage&&<button disabled={feed.isFetchingNextPage} className="text-sm text-volt" onClick={()=>feed.fetchNextPage()}>{feed.isFetchingNextPage?"Loading…":"Load more challenges"}</button>}
 <div className="grid gap-4 border-t hairline pt-6 sm:grid-cols-3">{[["01 · Build a reserve","Planned: 1% of purchased dev-buy tokens supports your community’s battles."],["02 · Pick your opponent","Owners agree on each coin’s proposed stake and the round length."],["03 · Watch the round","Once enabled, compare percentage price performance. Settlement rules are still being finalized."]].map(([title,body])=><div key={title}><h2 className="text-sm font-semibold">{title}</h2><p className="mt-2 text-xs leading-6 text-muted">{body}</p></div>)}</div></div></Shell>;
}

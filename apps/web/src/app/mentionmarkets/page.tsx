"use client";
import { useState } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import type { BattleView } from "@mention/shared";
import { Shell } from "@/components/Shell";
import { ChallengeForm, battleButton } from "@/components/Battles";
import { MarketCard, marketFromBattle, useArenaWatchlist } from "@/components/ArenaMarket";
import { api } from "@/lib/api";
import { useMe } from "@/lib/hooks";

export default function ArenaPage(){
 const {me,login}=useMe();const [filter,setFilter]=useState("All");const [search,setSearch]=useState("");const [form,setForm]=useState(false);const [duration,setDuration]=useState(0);const {saved,toggle}=useArenaWatchlist();
 const feed=useInfiniteQuery({queryKey:["battles"],initialPageParam:null as string|null,queryFn:({pageParam})=>api<{items:BattleView[];nextCursor:string|null}>(`/v1/battles${pageParam?`?cursor=${encodeURIComponent(pageParam)}`:""}`,{auth:false}),getNextPageParam:p=>p.nextCursor,refetchInterval:30000});
 const mine=useQuery({queryKey:["battle-mine",me?.id],enabled:!!me,queryFn:()=>api<{communityIds:string[]}>("/v1/battles/mine")});
 const records=feed.data?.pages.flatMap(p=>p.items)??[];
 const markets=records.filter(b=>{
   if(filter==="Live"||filter==="Completed")return false;
   if(filter==="Open"&&b.status!=="open")return false;
   if(filter==="My communities"&&!mine.data?.communityIds.some(id=>[b.challenger.id,b.opponent.id].includes(id)))return false;
   return true;
 }).map(marketFromBattle);
 const visible=markets.filter(m=>(!duration||m.duration===duration)&&(filter!=="Watchlist"||saved.includes(m.id))&&m.coins.some(c=>`${c.ticker} ${c.name}`.toLowerCase().includes(search.toLowerCase())));
 return <Shell wide><div className="arena-page"><header className="arena-page-header"><div><p className="arena-eyebrow">The community market</p><h1 className="font-display">mentionmarkets</h1><p>Pick a rival. Set the clock. Follow your coin.</p></div><button className={battleButton} onClick={()=>setForm(!form)}>Create challenge <span aria-hidden="true">↗</span></button></header>
 <div className="arena-topbar"><p className="text-sm text-muted">Real community challenges · updates also appear in the home feed</p><label className="arena-search"><span aria-hidden="true">⌕</span><input aria-label="Search mentionmarkets" placeholder="Search coins or communities" value={search} onChange={e=>setSearch(e.target.value)}/></label></div>
 <div className="arena-controls"><div className="arena-filters" aria-label="Filter mentionmarkets">{["All","Open","Live","Completed","My communities","Watchlist"].map(t=><button key={t} aria-pressed={filter===t} onClick={()=>setFilter(t)}>{t}</button>)}</div><select aria-label="Round duration" value={duration} onChange={e=>setDuration(Number(e.target.value))}><option value="0">All durations</option><option value="600">10 min</option><option value="1800">30 min</option><option value="3600">1 hour</option></select></div>
 <div className="arena-status-note"><span className="arena-status-dot"/><p>{"Preview release · challenge proposals are open. Escrow and live wagering are not connected yet."}</p></div>
 {form&&<div className="mb-5"><ChallengeForm onClose={()=>setForm(false)}/></div>}
 {feed.isError?<div role="alert" className="arena-empty">Could not load markets. <button onClick={()=>feed.refetch()}>Retry</button></div>:feed.isPending?<div className="arena-market-grid">{[0,1,2,3,4,5].map(n=><div key={n} className="arena-skeleton"/>)}</div>:filter==="My communities"&&!me?<div className="arena-empty"><button onClick={login}>Sign in to see your communities</button></div>:filter==="My communities"&&mine.isError?<div className="arena-empty"><button onClick={()=>mine.refetch()}>Could not load communities. Retry</button></div>:filter==="My communities"&&mine.isPending?<div className="arena-empty">Loading communities…</div>:visible.length?<div className="arena-market-grid">{visible.map(m=><MarketCard key={m.id} market={m} saved={saved.includes(m.id)} onSave={()=>toggle(m.id)}/>)}</div>:<div className="arena-empty"><span className="arena-empty-symbol">↗</span><h2>{filter==="Watchlist"?"Your watchlist starts here":filter==="Live"?"No live rounds yet":filter==="Completed"?"No settled rounds yet":"The next rivalry starts here"}</h2><p>{filter==="Watchlist"?"Save a market using the bookmark on its card.":"Real challenge proposals will appear here and in the home feed. No sample markets are shown."}</p><button onClick={()=>setForm(true)}>Create a challenge →</button></div>}

 {feed.hasNextPage&&<button className="mt-5 text-sm text-volt" disabled={feed.isFetchingNextPage} onClick={()=>feed.fetchNextPage()}>{feed.isFetchingNextPage?"Loading…":"Load more markets"}</button>}
 <footer className="arena-page-footer"><span>Community reserves · 50% of purchased dev-buy tokens planned</span><a href="/docs#mentionmarkets">How mentionmarkets works ↗</a></footer></div></Shell>;
}

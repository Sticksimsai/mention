"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BATTLE_RULES_VERSION, battleChallengeSchema, formatTokenUnits, type BattleView, type BattleCoin } from "@mention/shared";
import { api } from "@/lib/api";
import { useMe } from "@/lib/hooks";

export const battleButton = "rounded-xl bg-volt px-4 py-3 text-sm font-semibold text-ink disabled:opacity-40 hover:bg-volt-deep";
const input = "w-full rounded-xl border hairline bg-ink px-3 py-3 text-sm text-fg focus:outline-none focus:ring-2 focus:ring-volt";
export const durationLabel = (seconds: number) => seconds === 3600 ? "1 hour" : `${seconds / 60} min`;
export const statusLabel = (status: BattleView["status"]) => ({ open: "Open challenge", accepted: "Awaiting escrow", cancelled: "Cancelled", expired: "Expired" })[status];

export function BattleNotice() {
  return <div className="rounded-xl border border-volt/20 bg-volt/[0.04] p-4 text-sm leading-6"><p className="font-semibold text-volt">Challenge preview · wagering is not live</p><p className="text-muted">Owners can agree on terms. No tokens are reserved, transferred or paid out yet. A round can start only after escrow and settlement are available.</p></div>;
}
export function BattleCard({ battle: b }: { battle: BattleView }) {
  return <Link href={`/battles/${b.id}`} className="block rounded-2xl border hairline bg-surface p-5 transition-colors hover:border-volt/40 focus-visible:outline-volt">
    <div className="mb-5 flex items-center justify-between gap-2 text-xs"><span className={b.status === "open" ? "text-volt" : "text-muted"}>{statusLabel(b.status)}</span><span className="rounded-full bg-raised px-3 py-1 text-muted">{durationLabel(b.durationSecs)}</span></div>
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">{[b.challenger,b.opponent].map((coin,i)=><div key={coin.id} className="contents">{i===1&&<span className="text-xs text-muted">VS</span>}<div className="min-w-0"><div className="mb-3 flex h-11 w-11 items-center justify-center overflow-hidden rounded-xl bg-raised text-volt">{coin.pfpUrl?<img src={coin.pfpUrl} alt="" className="h-full w-full object-cover"/>:coin.ticker.slice(0,2)}</div><h3 className="truncate font-semibold">${coin.ticker}</h3><p className="truncate text-xs text-muted">{coin.name}</p><p className="mt-3 break-words text-sm">{formatTokenUnits(i===0?b.challengerStakeUnits:b.opponentStakeUnits)} <span className="text-muted">tokens</span></p></div></div>)}</div>
    <div className="mt-5 flex justify-between gap-2 border-t hairline pt-3 text-xs text-muted"><span>Proposed stakes · not funded</span><span>View terms ↗</span></div>
  </Link>;
}

export function ChallengeForm({ onClose }: { onClose: () => void }) {
  const { me, login } = useMe();
  const qc = useQueryClient();
  const [coinSearch,setCoinSearch]=useState("");
  const {data: coins=[],isError,refetch}=useQuery({queryKey:["battle-coins",coinSearch],queryFn:()=>api<BattleCoin[]>(`/v1/battles/coins?q=${encodeURIComponent(coinSearch)}`,{auth:false})});
  const own=useQuery({queryKey:["battle-mine",me?.id],enabled:!!me,queryFn:()=>api<{ownedCoins:BattleCoin[]}>("/v1/battles/mine")});
  const owned=own.data?.ownedCoins??[];
  const [challengerId,setChallenger]=useState("");const [opponentId,setOpponent]=useState("");
  const [challengerAmount,setAmount]=useState("");const [opponentAmount,setOtherAmount]=useState("");
  const [durationSecs,setDuration]=useState(600);const [ack,setAck]=useState(false);
  const request=useRef<{key:string;id:string}|null>(null);
  const mutation=useMutation({mutationFn:async()=>{
    const terms={challengerId,opponentId,challengerAmount,opponentAmount,durationSecs,acknowledgeDraft:ack};
    const key=JSON.stringify(terms);if(request.current?.key!==key)request.current={key,id:crypto.randomUUID()};
    const parsed=battleChallengeSchema.safeParse({...terms,id:request.current.id});
    if(!parsed.success)throw new Error(parsed.error.issues[0]?.message??"Check the challenge terms");
    return api<BattleView>("/v1/battles",{method:"POST",body:parsed.data});
  },onSuccess:()=>{qc.invalidateQueries({queryKey:["battles"]});onClose();}});
  return <section className="rounded-2xl border hairline bg-surface p-5" aria-label="Propose a challenge"><div className="mb-4 flex justify-between"><h2 className="font-semibold">Propose a challenge</h2><button onClick={onClose} className="text-sm text-muted">Close</button></div>
    {!me?<button className={battleButton} onClick={login}>Sign in to propose</button>:(isError||own.isError)?<button onClick={()=>{refetch();own.refetch();}} className="text-volt">Could not load communities. Retry</button>:own.isPending?<p className="text-sm text-muted">Loading your communities…</p>:!owned.length?<p className="text-sm text-muted">Only community owners can propose stakes. <Link href="/launch" className="text-volt">Visit Launchpad</Link></p>:<form className="space-y-4" onSubmit={e=>{e.preventDefault();mutation.mutate();}}>
    <label className="block space-y-2 text-sm">Find an opponent<input value={coinSearch} onChange={e=>{setCoinSearch(e.target.value);setOpponent("");}} placeholder="Search by name or ticker" className={input}/></label><div className="grid gap-4 sm:grid-cols-2"><label className="space-y-2 text-sm block">Your community<select required value={challengerId} onChange={e=>{setChallenger(e.target.value);setOpponent("");}} className={input}><option value="">Choose your coin</option>{owned.map(c=><option value={c.id} key={c.id}>${c.ticker} · {c.name}</option>)}</select></label><label className="space-y-2 text-sm block">Opponent<select required value={opponentId} onChange={e=>setOpponent(e.target.value)} className={input}><option value="">Choose an opponent</option>{coins.filter(c=>c.ownerId!==me.id&&c.id!==challengerId).map(c=><option value={c.id} key={c.id}>${c.ticker} · {c.name}</option>)}</select></label>
    <label className="space-y-2 text-sm block">Your proposed stake (tokens)<input required inputMode="decimal" placeholder="e.g. 1000" value={challengerAmount} onChange={e=>setAmount(e.target.value)} className={input}/></label><label className="space-y-2 text-sm block">Opponent's proposed stake (tokens)<input required inputMode="decimal" placeholder="e.g. 1000" value={opponentAmount} onChange={e=>setOtherAmount(e.target.value)} className={input}/></label></div>
    <label className="block space-y-2 text-sm">Round length<select value={durationSecs} onChange={e=>setDuration(Number(e.target.value))} className={input}>{[600,1800,3600].map(n=><option key={n} value={n}>{durationLabel(n)}</option>)}</select></label>
    <p className="text-xs leading-5 text-muted">Each stake is denominated in its own coin; equal token counts do not imply equal value. Proposed scoring: highest percentage price change over the round. Pricing source, averaging and refund rules are not finalized. Proposals expire after 24 hours.</p>
    <label className="flex items-start gap-3 text-sm text-muted"><input required type="checkbox" checked={ack} onChange={e=>setAck(e.target.checked)} className="mt-1 accent-volt"/>I understand these are draft terms. Acceptance does not lock funds or start a round; final settlement terms require fresh consent.</label>
    {mutation.error&&<p role="alert" className="text-sm text-down">{mutation.error.message}</p>}<button disabled={mutation.isPending||!ack} className={battleButton}>{mutation.isPending?"Saving…":"Publish challenge proposal"}</button></form>}
  </section>;
}

export function BattleActions({ battle:b }: {battle:BattleView}) {
  const {me,login}=useMe();const qc=useQueryClient();const [ack,setAck]=useState(false);
  const action=useMutation({mutationFn:(kind:"accept"|"cancel")=>api(`/v1/battles/${b.id}/${kind}`,{method:"POST",body:{acknowledgeDraft:true,rulesVersion:BATTLE_RULES_VERSION}}),onSuccess:()=>{qc.invalidateQueries({queryKey:["battle",b.id]});qc.invalidateQueries({queryKey:["battles"]});}});
  const owner=me&&(me.id===b.challenger.ownerId||me.id===b.opponent.ownerId);
  if(!me)return <button className={battleButton} onClick={login}>Sign in</button>;
  if(!owner||!["open","accepted"].includes(b.status))return null;
  return <div className="space-y-4"><label className="flex items-start gap-3 text-sm text-muted"><input type="checkbox" checked={ack} onChange={e=>setAck(e.target.checked)} className="mt-1 accent-volt"/>I understand these are draft terms and no funds will move.</label><div className="flex flex-wrap gap-3">{me.id===b.opponent.ownerId&&b.status==="open"&&<button disabled={!ack||action.isPending} className={battleButton} onClick={()=>action.mutate("accept")}>Accept draft terms</button>}<button disabled={!ack||action.isPending} className="rounded-xl border hairline px-4 py-3 text-sm disabled:opacity-40" onClick={()=>action.mutate("cancel")}>Cancel challenge</button></div>{action.error&&<p role="alert" className="text-sm text-down">{action.error.message}</p>}</div>;
}

export function CommunityBattles({id}:{id:string}) {
  const reserve=useQuery({queryKey:["battle-reserve",id],queryFn:()=>api<{status:string}>(`/v1/battles/community/${id}/reserve`,{auth:false})});
  const feed=useQuery({queryKey:["battles",id],queryFn:()=>api<{items:BattleView[]}>(`/v1/battles?communityId=${id}`,{auth:false})});
  return <div className="space-y-5 p-5"><h2 className="font-semibold">Community battle reserve</h2><div className="grid grid-cols-2 gap-3"><div className="rounded-xl border hairline p-4"><p className="text-xs text-muted">Planned allocation</p><p className="mt-2 text-xl text-volt">1% of dev buy</p></div><div className="rounded-xl border hairline p-4"><p className="text-xs text-muted">Escrow balance</p><p className="mt-2 text-sm">{reserve.isError?"Unavailable":reserve.isPending?"Loading…":"Not connected"}</p></div></div><p className="text-sm leading-6 text-muted">For Battle Mode launches, the planned reserve is 1% of the tokens the developer purchases. The other 99% stays with the developer. This is not 1% of total supply. Nothing has been allocated yet.</p><Link className="inline-block text-sm text-volt" href="/battles">Explore battles →</Link>{feed.isError?<p role="alert">Could not load challenges. <button className="text-volt" onClick={()=>feed.refetch()}>Retry</button></p>:feed.isPending?<p className="text-sm text-muted">Loading challenges…</p>:feed.data?.items.length?feed.data.items.map(b=><BattleCard key={b.id} battle={b}/>):<p className="text-sm text-muted">No challenge proposals yet.</p>}</div>;
}

export function BattleDemo() {
  const [duration,setDuration]=useState(600);const [start,setStart]=useState<number|null>(null);const [elapsed,setElapsed]=useState(0);
  useEffect(()=>{if(start===null)return;const id=setInterval(()=>setElapsed(Math.min(duration,Math.floor((Date.now()-start)/1000))),1000);return()=>clearInterval(id);},[start,duration]);
  const progress=elapsed/duration;const a=progress*4+Math.sin(progress*15)*0.5;const b=progress*2+Math.sin(progress*11)*0.4;
  const points=(side:number)=>Array.from({length:41},(_,i)=>{const t=progress*i/40;return `${i*10},${70-(t*(side===0?4:2)+Math.sin(t*(side===0?15:11))*(side===0?.5:.4))*12}`;}).join(" ");
  return <section className="rounded-2xl border border-volt/25 bg-surface p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs uppercase tracking-wider text-volt">Illustrative demo</p><h2 className="mt-2 text-lg font-semibold">$ALPHA vs $BETA</h2></div><span className="font-mono text-xl">{Math.floor((duration-elapsed)/60).toString().padStart(2,"0")}:{((duration-elapsed)%60).toString().padStart(2,"0")}</span></div><p className="mt-2 text-sm text-muted">Synthetic prices · no funds · no real market or result</p><div className="mt-5 grid grid-cols-2 gap-3"><div className="rounded-xl bg-ink p-4"><p className="text-xs text-muted">$ALPHA · price change</p><p className="mt-2 text-2xl text-volt">+{a.toFixed(2)}%</p></div><div className="rounded-xl bg-ink p-4"><p className="text-xs text-muted">$BETA · price change</p><p className="mt-2 text-2xl text-sky-300">+{b.toFixed(2)}%</p></div></div><svg viewBox="0 0 400 100" className="my-5 h-28 w-full" role="img" aria-label="Synthetic percentage price performance"><path d="M0 70H400" stroke="currentColor" opacity=".15"/><polyline points={points(0)} fill="none" stroke="#b2ff00" strokeWidth="2"/><polyline points={points(1)} fill="none" stroke="#7dd3fc" strokeWidth="2"/></svg><div className="flex flex-wrap items-center gap-3"><select aria-label="Demo round length" value={duration} className="rounded-xl border hairline bg-ink p-3 text-sm" onChange={e=>{setDuration(Number(e.target.value));setStart(null);setElapsed(0);}}>{[600,1800,3600].map(n=><option key={n} value={n}>{durationLabel(n)}</option>)}</select><button className={battleButton} onClick={()=>{setElapsed(0);setStart(Date.now());}}>{start===null?"Start demo":"Restart demo"}</button><button className="text-sm text-muted" onClick={()=>{setStart(null);setElapsed(duration);}}>Preview demo finish</button></div><p className="mt-4 text-xs text-muted">{elapsed===duration?"Demo finished. No settlement or payout occurred.":"The leader is provisional until the full round ends."}</p></section>;
}

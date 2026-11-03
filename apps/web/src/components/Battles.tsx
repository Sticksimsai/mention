"use client";

import Link from "next/link";
import {DevnetReserve} from "./DevnetMarkets";
import { MarketCard, marketFromBattle, useArenaWatchlist } from "./ArenaMarket";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BATTLE_RULES_VERSION, type BattleView } from "@mention/shared";
import { api } from "@/lib/api";
import { useMe } from "@/lib/hooks";

export const battleButton = "rounded-xl bg-volt px-4 py-3 text-sm font-semibold text-ink disabled:opacity-40 hover:bg-volt-deep";
export const durationLabel = (seconds: number) => seconds === 3600 ? "1 hour" : `${seconds / 60} min`;
export const statusLabel = (status: BattleView["status"]) => ({ open: "Open challenge", accepted: "Awaiting escrow", cancelled: "Cancelled", expired: "Expired" })[status];

export function BattleNotice() {
  return <div className="rounded-xl border border-volt/20 bg-volt/[0.04] p-4 text-sm leading-6"><p className="font-semibold text-volt">Challenge preview · wagering is not live</p><p className="text-muted">Owners can agree on terms. No tokens are reserved, transferred or paid out yet. A round can start only after escrow and settlement are available.</p></div>;
}
export function BattleCard({battle}:{battle:BattleView}) {
 const {saved,toggle}=useArenaWatchlist();
 return <MarketCard market={marketFromBattle(battle)} saved={saved.includes(battle.id)} onSave={()=>toggle(battle.id)}/>;
}

export {ChallengeForm} from "./ChallengeForm";

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
  return <div className="space-y-5 p-5"><DevnetReserve communityId={id}/><h2 className="font-semibold">Community mentionmarkets reserve</h2><div className="grid grid-cols-2 gap-3"><div className="rounded-xl border hairline p-4"><p className="text-xs text-muted">Planned allocation</p><p className="mt-2 text-xl text-volt">50% of dev buy</p></div><div className="rounded-xl border hairline p-4"><p className="text-xs text-muted">Mainnet escrow balance</p><p className="mt-2 text-sm">{reserve.isError?"Unavailable":reserve.isPending?"Loading…":"Not connected"}</p></div></div><p className="text-sm leading-6 text-muted">For mentionmarkets launches, half of the tokens the developer purchases is reserved for wagers and half stays with the developer. At the maximum 2% buy, the reserve equals 1% of total supply. Live reserves are not connected yet.</p><Link className="inline-block text-sm text-volt" href="/mentionmarkets">Explore mentionmarkets →</Link>{feed.isError?<p role="alert">Could not load challenges. <button className="text-volt" onClick={()=>feed.refetch()}>Retry</button></p>:feed.isPending?<p className="text-sm text-muted">Loading challenges…</p>:feed.data?.items.length?feed.data.items.map(b=><BattleCard key={b.id} battle={b}/>):<p className="text-sm text-muted">No challenge proposals yet.</p>}</div>;
}


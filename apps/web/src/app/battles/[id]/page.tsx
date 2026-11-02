"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import type { BattleView } from "@mention/shared";
import { Shell } from "@/components/Shell";
import { BattleActions, BattleCard, BattleNotice, durationLabel } from "@/components/Battles";
import { api } from "@/lib/api";
export default function BattleDetail(){
 const {id}=useParams<{id:string}>();const q=useQuery({queryKey:["battle",id],queryFn:()=>api<BattleView>(`/v1/battles/${id}`,{auth:false}),refetchInterval:15000});
 return <Shell><div className="space-y-5 p-5"><Link href="/battles" className="text-sm text-muted">← All battles</Link><h1 className="font-display text-lg">battle terms</h1>{q.isError?<p role="alert">{q.error.message} <button onClick={()=>q.refetch()} className="text-volt">Retry</button></p>:!q.data?<p>Loading…</p>:<><BattleNotice/><BattleCard battle={q.data}/><dl className="space-y-4 rounded-2xl border hairline p-5 text-sm"><div><dt className="text-muted">Round duration</dt><dd>{durationLabel(q.data.durationSecs)} · timer has not started</dd></div><div><dt className="text-muted">Proposed scoring</dt><dd>Highest percentage price change over the round, not highest token price.</dd></div><div><dt className="text-muted">Settlement</dt><dd>Not connected. Price source, averaging, tie handling and refunds need final rules and renewed owner consent.</dd></div><div><dt className="text-muted">Proposal expires</dt><dd>{new Date(q.data.expiresAt).toLocaleString()}</dd></div><div><dt className="text-muted">Terms version</dt><dd>{q.data.rulesVersion}</dd></div></dl><BattleActions battle={q.data}/></>}</div></Shell>;
}

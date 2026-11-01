"use client";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "./AuthProvider";
import { api } from "@/lib/api";
interface Earning {id:string;name:string;amount:string;status:string;wallet:string;signature?:string;receipt:string}
const sol=(s:string)=>(Number(s)/1e9).toLocaleString(undefined,{maximumFractionDigits:9});
export function CreatorEarnings(){
 const {userId,authenticated}=useAuth();const q=useQuery({queryKey:["earnings",userId],enabled:authenticated,queryFn:()=>api<{items:Earning[];automationEnabled:boolean}>("/v1/earnings"),refetchInterval:15000});
 if(!authenticated)return null;
 return <section className="mt-5 rounded-xl border hairline p-4"><h2 className="font-semibold">Creator earnings</h2><p className="mt-2 text-xs leading-5 text-muted">Verified, allocated earnings only. Uncollected or unallocated protocol fees are not included.</p>{q.isPending?<p className="mt-4 text-sm text-muted">Loading earnings…</p>:q.isError?<button className="mt-4 text-volt" onClick={()=>q.refetch()}>Could not load earnings. Retry</button>:<><div className="my-4 grid grid-cols-2 gap-3">{["available","confirmed"].map(status=><div key={status} className="rounded-lg bg-surface p-3"><p className="text-[10px] text-muted">{status==="available"?"Awaiting payout approval":"Paid"}</p><p className="mt-1 text-sm">{sol(String(q.data!.items.filter(i=>i.status===status).reduce((n,i)=>n+BigInt(i.amount),0n)))} SOL</p></div>)}</div>{!q.data!.items.length&&<p className="text-sm text-muted">No allocated earnings yet.</p>}{q.data!.items.map(i=><div key={i.id} className="space-y-1 border-t hairline py-3 text-xs"><div className="flex justify-between gap-3"><strong>{i.name}</strong><span>{sol(i.amount)} SOL</span></div><p className="capitalize text-muted">{i.status.replaceAll("_"," ")}</p><p className="break-all text-muted">Recipient: {i.wallet}</p><a href={`https://solscan.io/tx/${i.signature||i.receipt}`} target="_blank" rel="noreferrer" className="text-volt">{i.signature?"Payout transaction":"Source receipt"} ↗</a></div>)}{!q.data!.automationEnabled&&<p className="mt-3 text-xs text-muted">Automatic payouts are not enabled yet.</p>}</>}</section>;
}

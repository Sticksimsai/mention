"use client";

// Community page — header banner with the live mcap pulse, join, bio with
// token info + CA, embedded chart, trade box, and the merged feed.
import Link from "next/link";
import { useState } from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CommunityView, TokenStats } from "@mention/shared";
import { CommunityBattles } from "@/components/Battles";
import { TradeTab } from "@/components/TradeTab";
import { Shell } from "@/components/Shell";
import { Feed } from "@/components/Feed";
import { Composer } from "@/components/Composer";
import { TokenPulse } from "@/components/TokenPulse";
import { api, fmtUsd, shortCa } from "@/lib/api";
import { useMe } from "@/lib/hooks";

export default function TribePage() {
  const { id } = useParams<{ id: string }>();
  const { authenticated, login, me } = useMe();
  const qc = useQueryClient();
  const [selectedTab, setTab] = useState<"feed" | "chart" | "trade" | "mentionmarkets" | null>(null);

  const { data: tribe } = useQuery({
    queryKey: ["community", id],
    queryFn: () => api<CommunityView>(`/v1/communities/${id}`, { auth: false }),
  });
  const { data: membership } = useQuery({
    queryKey: ["membership", id, me?.id],
    queryFn: () => api<{ isMember: boolean }>(`/v1/communities/${id}/membership`),
    enabled: Boolean(me),
  });

  const joinLeave = useMutation({
    mutationFn: (join: boolean) =>
      api(`/v1/communities/${id}/${join ? "join" : "leave"}`, { method: "POST" }),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["membership", id] });
      qc.invalidateQueries({ queryKey: ["community", id] });
    },
  });

  if (!tribe) {
    return <Shell><p className="px-5 py-8 text-sm text-muted">Loading…</p></Shell>;
  }

  const isMember = membership?.isMember ?? false;
  const tab=selectedTab??(tribe.isExample?"chart":"feed");

  return (
    <Shell>
      {tribe.isExample&&<div className="border-b hairline bg-surface px-5 py-3 text-xs leading-5 text-muted"><span className="mr-2 rounded bg-volt/10 px-2 py-1 font-semibold text-volt">EXAMPLE COMMUNITY</span>Live wrapped SOL chart. No token launched here. X discovery is off.</div>}
      {/* banner + pulse */}
      <div className="relative h-44 bg-raised" style={tribe.isExample?{background:"radial-gradient(ellipse at top right, #365923, transparent 70%), linear-gradient(135deg, #171c15, #111510)"}:undefined}>
        {tribe.bannerUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={tribe.bannerUrl} alt="" className="h-full w-full object-cover" />
        )}
        <div className="absolute inset-x-4 bottom-3">
          <TokenPulse ca={tribe.ca} />
        </div>
      </div>

      <div className="border-b hairline px-5 pb-4">
        <div className="flex items-end justify-between">
          <div className="-mt-8">
            {tribe.pfpUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={tribe.pfpUrl} alt="" className="h-20 w-20 rounded-2xl border-4 border-ink object-cover" />
            ) : (
              <div className="flex h-20 w-20 items-center justify-center rounded-2xl border-4 border-ink bg-raised font-display text-volt">
                ${tribe.ticker.slice(0, 4)}
              </div>
            )}
          </div>
          <button
            onClick={() => (authenticated ? joinLeave.mutate(!isMember) : login())}
            disabled={joinLeave.isPending}
            className={`mt-3 rounded-full px-5 py-2 text-sm font-semibold ${
              isMember
                ? "border hairline text-fg hover:border-down hover:text-down"
                : "bg-volt text-ink hover:bg-volt-deep"
            }`}
          >
            {isMember ? "Joined" : "Join"}
          </button>
        </div>

        {(me?.id===tribe.owner.id || me?.role) && <Link href={`/manage/${tribe.id}`} className="mt-4 inline-block rounded-xl border hairline px-3 py-2 text-xs text-volt">Manage community →</Link>}
        <h1 className="mt-3 font-display text-xl font-medium">{tribe.name}</h1>
        <p className="text-sm text-muted">
          ${tribe.ticker} · {tribe.membersCount} members · led by{" "}
          <a href={`/u/${tribe.owner.username}`} className="text-volt hover:underline">@{tribe.owner.username}</a>
          {tribe.launchedViaTribes && " · launched on Mentions"}
        </p>
        {tribe.details && <p className="mt-2 text-[13px] leading-relaxed">{tribe.details}</p>}
        <p className="mt-2 font-mono text-xs text-muted">
          CA{" "}
          <button onClick={() => navigator.clipboard?.writeText(tribe.ca)} className="hover:text-volt" title="Copy">
            {shortCa(tribe.ca)} ⧉
          </button>
          {tribe.website && <> · <a className="hover:text-volt" href={tribe.website} target="_blank" rel="noreferrer">website</a></>}
          {tribe.telegram && <> · <a className="hover:text-volt" href={tribe.telegram} target="_blank" rel="noreferrer">telegram</a></>}
          {!tribe.isExample&&<> · <a className="hover:text-volt" href={`https://pump.fun/coin/${tribe.ca}`} target="_blank" rel="noreferrer">pump.fun</a></>}
        </p>

        <div className="mt-4 flex gap-4 overflow-x-auto text-sm sm:gap-6">
          {(["feed", "chart", "trade", "mentionmarkets"] as const).filter(t=>!tribe.isExample || (t!=="trade"&&t!=="mentionmarkets")).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`shrink-0 border-b-2 pb-2 ${t === "mentionmarkets" ? "" : "capitalize"} ${tab === t ? "border-volt text-fg" : "border-transparent text-muted hover:text-fg"}`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {tab === "feed" && (
        <>
          {(isMember || me?.role || me?.id===tribe.owner.id) && <Composer communityId={tribe.id} />}
          <Feed communityId={tribe.id} />
        </>
      )}
      {tab === "chart" && <ChartTab ca={tribe.ca} />}
      {tab === "mentionmarkets" && <CommunityBattles id={tribe.id} />}
      {!tribe.isExample && tab === "trade" && <TradeTab ca={tribe.ca} ticker={tribe.ticker} />}
    </Shell>
  );
}

function ChartTab({ ca }: { ca: string }) {
  const { data,isLoading,isError,refetch } = useQuery({
    queryKey: ["token", ca],
    queryFn: () => api<TokenStats>(`/v1/token/${ca}/stats`, { auth: false }),
    refetchInterval:15000,
  });
  if(isLoading)return <p className="p-8 text-sm text-muted">Loading live market data…</p>;
  if (isError || !data?.pairAddress) return <div className="p-8 text-center text-sm text-muted"><p>Chart data is not available yet.</p><button className="mt-3 text-volt" onClick={()=>refetch()}>Retry</button></div>;
  return <div className="p-3 sm:p-5">
    <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">{[["Price",fmtUsd(data.priceUsd)],["24h change",data.change24h===null?"—":`${data.change24h>=0?"+":""}${data.change24h.toFixed(2)}%`],["Pair volume · 24h",fmtUsd(data.volume24h)],["Pair liquidity",fmtUsd(data.liquidityUsd)]].map(([label,value])=><div key={label} className="rounded-xl border hairline bg-surface p-3"><p className="text-[10px] text-muted">{label}</p><p className="mt-2 font-mono text-sm font-semibold">{value}</p></div>)}</div>
    <div className="overflow-hidden rounded-xl border hairline bg-surface"><div className="flex items-center justify-between border-b hairline px-4 py-3 text-xs"><span className="font-semibold">Price chart <span className="ml-2 font-normal text-muted">· Solana</span></span><a href={`https://dexscreener.com/solana/${data.pairAddress}`} target="_blank" rel="noreferrer" className="text-volt">Open chart ↗</a></div><iframe title="Live token price chart" src={`https://dexscreener.com/solana/${data.pairAddress}?embed=1&theme=dark&trades=0&info=0`} className="h-[560px] w-full border-0"/></div>
    <p className="mt-3 text-[11px] leading-5 text-muted">Market data from DexScreener · highest-liquidity indexed pair · stats refresh every 15 seconds. If the embedded chart is blocked, use Open chart.</p>
  </div>;
}

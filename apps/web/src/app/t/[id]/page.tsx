"use client";

// Community page — header banner with the live mcap pulse, join, bio with
// token info + CA, embedded chart, trade box, and the merged feed.
import {CommunityStickerPack} from "@/components/PostAttachments";
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
import {CommunityMetrics,CommunityChart} from "@/components/CommunityMarket";
import {DEFAULT_BANNER} from "@/components/BannerEditor";
import { api, fmtUsd, shortCa } from "@/lib/api";
import { useMe } from "@/lib/hooks";

export default function TribePage() {
  const { id } = useParams<{ id: string }>();
  const { authenticated, login, me } = useMe();
  const qc = useQueryClient();
  const [selectedTab, setTab] = useState<"feed" | "chart" | "trade" | "mentionmarkets" | "stickers" | null>(null);

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
      <div className="relative z-0 aspect-[3/1] w-full overflow-hidden bg-raised"><img src={tribe.bannerUrl||DEFAULT_BANNER} alt={`${tribe.name} community banner`} className="h-full w-full object-cover"/></div>

      <div className="border-b hairline px-5 pb-4">
        <div className="flex items-end justify-between">
          <div className="relative z-10 -mt-10 shrink-0">
            {tribe.pfpUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={tribe.pfpUrl} alt="" className="h-24 w-24 rounded-2xl border-4 border-ink object-cover" />
            ) : (
              <div className="flex h-24 w-24 items-center justify-center rounded-2xl border-4 border-ink bg-raised font-display text-volt">
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
          {(["feed", "chart", "stickers", "trade", "mentionmarkets"] as const).filter(t=>!tribe.isExample || (t!=="trade"&&t!=="mentionmarkets")).map((t) => (
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

      <CommunityMetrics ca={tribe.ca}/>
      {tab === "feed" && (
        <>
          {(isMember || me?.role || me?.id===tribe.owner.id) && <Composer communityId={tribe.id} />}
          <Feed communityId={tribe.id} />
        </>
      )}
      {tab === "chart" && <CommunityChart ca={tribe.ca} ticker={tribe.ticker}/>}
      {tab === "stickers"&&<CommunityStickerPack communityId={tribe.id}/>}
      {tab === "mentionmarkets" && <CommunityBattles id={tribe.id} />}
      {!tribe.isExample && tab === "trade" && <TradeTab ca={tribe.ca} ticker={tribe.ticker} />}
    </Shell>
  );
}

"use client";

// Trending strip — horizontally scrolling community cards pinned to the top
// of the home feed. Banner-style card: pfp, name, ticker, members, live mcap.
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import type { CommunityView, TokenStats } from "@mention/shared";
import { api, fmtUsd } from "@/lib/api";

function CardMcap({ ca }: { ca: string }) {
  const { data } = useQuery({
    queryKey: ["token", ca],
    queryFn: () => api<TokenStats>(`/v1/token/${ca}/stats`, { auth: false }),
    refetchInterval: 15_000,
  });
  const change = data?.change24h ?? null;
  return (
    <div className="mt-2 flex items-baseline gap-2">
      <span className="font-mono text-sm font-semibold text-fg">{fmtUsd(data?.marketCap)}</span>
      {change !== null && (
        <span className={`font-mono text-[11px] ${change >= 0 ? "text-up" : "text-down"}`}>
          {change >= 0 ? "+" : ""}{change.toFixed(1)}%
        </span>
      )}
    </div>
  );
}

export function TrendingCards() {
  const { data: trending } = useQuery({
    queryKey: ["communities", "trending"],
    queryFn: () => api<CommunityView[]>("/v1/communities?sort=trending", { auth: false }),
    refetchInterval: 30_000,
  });
  const { data: newest } = useQuery({
    queryKey: ["communities", "new"],
    queryFn: () => api<CommunityView[]>("/v1/communities?sort=new", { auth: false }),
  });
  const list = (trending?.length ? trending : newest ?? []).slice(0, 10);
  if (list.length === 0) return null;

  return (
    <div className="border-b hairline">
      <div className="flex items-center justify-between px-5 pt-4">
        <h2 className="font-display text-sm font-medium">Trending now</h2>
        <Link href="/explore" className="text-xs text-volt hover:underline">See all</Link>
      </div>
      <div className="flex snap-x gap-3 overflow-x-auto px-5 py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {list.map((t) => (
          <Link
            key={t.id}
            href={`/t/${t.id}`}
            className="group relative w-44 shrink-0 snap-start overflow-hidden rounded-2xl border hairline bg-surface p-4 transition hover:border-volt/40"
          >
            {t.bannerUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={t.bannerUrl} alt=""
                className="absolute inset-0 h-full w-full object-cover opacity-20 transition group-hover:opacity-30" />
            )}
            <div className="relative">
              {t.pfpUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={t.pfpUrl} alt="" className="h-11 w-11 rounded-xl border hairline object-cover" />
              ) : (
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-raised font-display text-xs text-volt">
                  ${t.ticker.slice(0, 3)}
                </div>
              )}
              <p className="mt-2.5 truncate text-sm font-medium">{t.name}</p>
              <p className="truncate text-xs text-muted">${t.ticker} · {t.membersCount} members</p>
              <CardMcap ca={t.ca} />
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

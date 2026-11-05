"use client";
import { communityHref } from "@mention/shared";

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
  if (list.length === 0) return <section className="rounded-xl border hairline bg-surface p-4"><h2 className="font-display text-xs">Trending</h2><p className="mt-3 text-sm text-muted">Trending cults will appear here.</p></section>;

  return (
    <div className="border-b hairline">
      <div className="flex items-center justify-between px-5 pt-4">
        <h2 className="font-display text-sm font-medium">Trending now</h2>
        <Link href="/cult" className="text-xs text-volt hover:underline">See all</Link>
      </div>
      <div className="grid gap-3 py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {list.map((t) => (
          <Link
            key={t.id}
            href={communityHref(t)}
            className="group relative w-full min-w-0 snap-start overflow-hidden rounded-2xl border hairline bg-surface p-4 transition-colors hover:border-volt/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-volt"
          >
            <div aria-hidden="true" className="pointer-events-none absolute inset-0">
              <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(163,237,0,0.10),transparent_65%)]" />
              <div className="absolute right-0 top-0 h-20 w-28 opacity-25 [background-image:radial-gradient(rgba(163,237,0,0.5)_1px,transparent_1px)] [background-size:8px_8px] [mask-image:linear-gradient(to_bottom_left,black,transparent)]" />
              <span className="absolute right-5 top-5 h-2 w-2 bg-volt/20" />
              <span className="absolute right-8 top-8 h-1 w-1 bg-volt/30" />
            </div>
            <div className="relative">
              {t.pfpUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={t.pfpUrl} alt="" className="h-11 w-11 rounded-xl border hairline bg-ink object-cover" />
              ) : (
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-raised font-display text-xs text-volt">
                  ${t.ticker.slice(0, 3)}
                </div>
              )}
              <p className="mt-2.5 truncate text-sm font-medium">{t.name}</p>
              <p className="mt-1 break-all text-xs text-muted">${t.ticker}</p>
              <p className="mt-1 text-[11px] text-muted">{t.membersCount} {t.membersCount === 1 ? "member" : "members"}</p>
              <CardMcap ca={t.ca} />
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

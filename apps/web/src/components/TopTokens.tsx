"use client";

// Top 10 tokens by live market cap. Rail mode for the sidebar card,
// full mode for the /top page.
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { api, fmtUsd } from "@/lib/api";

export interface TopToken {
  communityId: string;
  name: string;
  ticker: string;
  ca: string;
  pfpUrl: string;
  marketCap: number | null;
  change24h: number | null;
  volume24h: number | null;
}

export function useTopTokens() {
  return useQuery({
    queryKey: ["token", "top"],
    queryFn: () => api<TopToken[]>("/v1/token/top", { auth: false }),
    refetchInterval: 15_000,
  });
}

function Change({ v }: { v: number | null }) {
  if (v === null) return <span className="font-mono text-[11px] text-muted">—</span>;
  return (
    <span className={`font-mono text-[11px] ${v >= 0 ? "text-up" : "text-down"}`}>
      {v >= 0 ? "+" : ""}{v.toFixed(1)}%
    </span>
  );
}

export function TopTokensRail() {
  const { data } = useTopTokens();
  if (!data?.length) return null;

  return (
    <div className="rounded-2xl border hairline bg-surface p-4">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="font-display text-sm font-medium">Top 10</h2>
        <span className="flex items-center gap-1.5 text-[11px] text-muted">
          <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-volt" /> live mcap
        </span>
      </div>
      <ol className="space-y-0.5">
        {data.map((t, i) => (
          <li key={t.communityId}>
            <Link href={`/t/${t.communityId}`}
              className="flex items-center gap-2.5 rounded-xl px-2 py-1.5 -mx-2 hover:bg-raised">
              <span className={`w-4 text-right font-mono text-xs ${i < 3 ? "text-volt" : "text-muted"}`}>
                {i + 1}
              </span>
              {t.pfpUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={t.pfpUrl} alt="" className="h-7 w-7 rounded-lg object-cover" />
              ) : (
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-raised font-display text-[9px] text-volt">
                  {t.ticker.slice(0, 3)}
                </div>
              )}
              <span className="min-w-0 flex-1 truncate text-sm">${t.ticker}</span>
              <span className="text-right">
                <span className="block font-mono text-xs">{fmtUsd(t.marketCap)}</span>
                <Change v={t.change24h} />
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function TopTokensTable() {
  const { data, isLoading } = useTopTokens();
  if (isLoading) return <p className="px-5 py-8 text-sm text-muted">Loading…</p>;
  if (!data?.length) {
    return (
      <div className="px-5 py-16 text-center">
        <p className="font-medium">No tokens yet</p>
        <Link href="/launch" className="text-sm text-volt hover:underline">Be the first to launch</Link>
      </div>
    );
  }
  return (
    <table className="w-full">
      <thead>
        <tr className="border-b hairline text-left text-xs text-muted">
          <th className="px-5 py-3 font-normal">#</th>
          <th className="py-3 font-normal">Token</th>
          <th className="py-3 text-right font-normal">Market cap</th>
          <th className="py-3 text-right font-normal">24h</th>
          <th className="hidden py-3 pr-5 text-right font-normal sm:table-cell">Volume 24h</th>
        </tr>
      </thead>
      <tbody>
        {data.map((t, i) => (
          <tr key={t.communityId} className="border-b hairline hover:bg-surface/50">
            <td className={`px-5 py-3 font-mono text-sm ${i < 3 ? "text-volt" : "text-muted"}`}>{i + 1}</td>
            <td className="py-3">
              <Link href={`/t/${t.communityId}`} className="flex items-center gap-3">
                {t.pfpUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={t.pfpUrl} alt="" className="h-9 w-9 rounded-lg object-cover" />
                ) : (
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-raised font-display text-[10px] text-volt">
                    {t.ticker.slice(0, 3)}
                  </div>
                )}
                <span>
                  <span className="block text-sm font-medium">{t.name}</span>
                  <span className="text-xs text-muted">${t.ticker}</span>
                </span>
              </Link>
            </td>
            <td className="py-3 text-right font-mono text-sm">{fmtUsd(t.marketCap)}</td>
            <td className="py-3 text-right"><Change v={t.change24h} /></td>
            <td className="hidden py-3 pr-5 text-right font-mono text-sm text-muted sm:table-cell">{fmtUsd(t.volume24h)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

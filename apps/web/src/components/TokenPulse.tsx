"use client";

// Live market-cap pulse — the signature element. Full mode sits inside the
// tribe header banner; compact mode rides along in lists.
import { useQuery } from "@tanstack/react-query";
import type { TokenStats } from "@tribes/shared";
import { api, fmtUsd, shortCa } from "@/lib/api";

export function TokenPulse({ ca, compact = false }: { ca: string; compact?: boolean }) {
  const { data } = useQuery({
    queryKey: ["token", ca],
    queryFn: () => api<TokenStats>(`/v1/token/${ca}/stats`, { auth: false }),
    refetchInterval: 15_000,
  });

  const change = data?.change24h ?? null;
  const dir = change === null ? "text-muted" : change >= 0 ? "text-up" : "text-down";

  if (compact) {
    return (
      <div className="text-right">
        <p className="font-mono text-xs">{fmtUsd(data?.marketCap)}</p>
        {change !== null && (
          <p className={`font-mono text-[11px] ${dir}`}>
            {change >= 0 ? "+" : ""}{change.toFixed(1)}%
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl bg-ink/70 px-4 py-3 backdrop-blur">
      <span className="flex items-center gap-2">
        <span className="pulse-dot h-2 w-2 rounded-full bg-volt" />
        <span className="font-mono text-lg font-semibold">{fmtUsd(data?.marketCap)}</span>
        <span className="text-xs text-muted">mcap</span>
      </span>
      {change !== null && (
        <span className={`font-mono text-sm ${dir}`}>
          {change >= 0 ? "+" : ""}{change.toFixed(1)}% 24h
        </span>
      )}
      {data?.volume24h != null && (
        <span className="font-mono text-sm text-muted">{fmtUsd(data.volume24h)} vol</span>
      )}
      <button
        onClick={() => navigator.clipboard?.writeText(ca)}
        className="font-mono text-xs text-muted hover:text-volt"
        title="Copy contract address"
      >
        {shortCa(ca)} ⧉
      </button>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { CommunityView } from "@mention/shared";
import { Shell } from "@/components/Shell";
import { TokenPulse } from "@/components/TokenPulse";
import { api } from "@/lib/api";

const SORTS = [
  { id: "trending", label: "Trending" },
  { id: "new", label: "New" },
  { id: "members", label: "Largest" },
] as const;

export default function ExplorePage() {
  const [sort, setSort] = useState<string>("trending");
  const { data, isLoading } = useQuery({
    queryKey: ["communities", sort],
    queryFn: () => api<CommunityView[]>(`/v1/communities?sort=${sort}`, { auth: false }),
  });

  return (
    <Shell>
      <div className="sticky top-0 z-10 border-b hairline bg-ink/80 px-5 pt-4 backdrop-blur">
        <h1 className="font-display text-base font-medium">Explore</h1>
        <div className="mt-3 flex gap-6 text-sm">
          {SORTS.map((s) => (
            <button
              key={s.id}
              onClick={() => setSort(s.id)}
              className={`border-b-2 pb-2 ${sort === s.id ? "border-volt text-fg" : "border-transparent text-muted hover:text-fg"}`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading && <p className="px-5 py-8 text-sm text-muted">Loading…</p>}
      {data?.length === 0 && (
        <div className="px-5 py-16 text-center">
          <p className="font-medium">No communities yet</p>
          <Link href="/launch" className="text-sm text-volt hover:underline">Launch the first token →</Link>
        </div>
      )}
      <ul>
        {data?.map((t) => (
          <li key={t.id} className="border-b hairline">
            <Link href={`/t/${t.id}`} className="flex items-center gap-4 px-5 py-4 hover:bg-surface/40">
              {t.pfpUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={t.pfpUrl} alt="" className="h-12 w-12 rounded-xl object-cover" />
              ) : (
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-raised font-display text-sm text-volt">
                  ${t.ticker.slice(0, 3)}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="font-medium">{t.name} <span className="text-sm text-muted">${t.ticker}</span></p>
                <p className="truncate text-sm text-muted">{t.details || `${t.membersCount} members`}</p>
              </div>
              <TokenPulse ca={t.ca} compact />
            </Link>
          </li>
        ))}
      </ul>
    </Shell>
  );
}

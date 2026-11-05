"use client";
import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { communityHref, type CommunityView } from "@mention/shared";
import { api } from "@/lib/api";
import { Shell } from "@/components/Shell";
import { Composer } from "@/components/Composer";

export default function CultPage() {
  const [page,setPage] = useState(0);
  const query = useQuery({
    queryKey: ["cult-directory",page],
    queryFn: () => api<{items:CommunityView[];hasMore:boolean}>(`/v1/communities/directory?page=${page}`, {auth:false}),
    refetchInterval: 15000,
  });
  return <Shell>
    <header className="border-b hairline px-5 py-6"><h1 className="font-display text-base">Cult</h1><p className="mt-2 text-sm text-muted">Newly launched communities, newest first.</p></header>
    <Composer />
    <div className="p-5">
      {query.isLoading && <p role="status">Loading cults…</p>}
      {query.isError && <button onClick={()=>query.refetch()}>Directory unavailable · Retry</button>}
      {query.data?.items.length===0 && <div className="rounded-xl border border-dashed hairline p-8 text-center"><h2>No launches yet</h2><Link href="/launch" className="mt-3 inline-block underline">Launch a cult</Link></div>}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {query.data?.items.map(c=><Link key={c.id} href={communityHref(c)} className="overflow-hidden rounded-2xl border hairline bg-surface hover:border-white/50">
          <img src={c.bannerUrl || "/brand/community-banner.svg"} alt="" className="aspect-[3/1] w-full object-cover" />
          <div className="p-4"><img src={c.pfpUrl || "/brand/onlycults.webp"} alt="" className="relative -mt-9 mb-2 h-11 w-11 rounded-xl border-2 border-surface bg-ink object-cover" />
            <h2 className="break-words text-sm">{c.name}</h2><p className="text-xs text-muted">${c.ticker} · {c.membersCount} {c.membersCount===1?"member":"members"}</p>
          </div>
        </Link>)}
      </div>
      {(page>0 || query.data?.hasMore) && <div className="mt-5 flex justify-between">
        <button disabled={!page} onClick={()=>setPage(page-1)}>Previous</button><button disabled={!query.data?.hasMore} onClick={()=>setPage(page+1)}>Next</button>
      </div>}
    </div>
  </Shell>;
}

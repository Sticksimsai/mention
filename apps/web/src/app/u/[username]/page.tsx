"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Shell } from "@/components/Shell";
import { Feed } from "@/components/Feed";
import { api } from "@/lib/api";

interface Profile {
  username: string; displayName: string; pfpUrl: string; bannerUrl: string; bio: string;
  followers: number; following: number; tribes: number;
  ownedTribes: Array<{ id: string; name: string; ticker: string; pfpUrl: string }>;
}

export default function ProfilePage() {
  const { username } = useParams<{ username: string }>();
  const { data: p } = useQuery({
    queryKey: ["profile", username],
    queryFn: () => api<Profile>(`/v1/users/${username}`, { auth: false }),
  });

  if (!p) return <Shell><p className="px-5 py-8 text-sm text-muted">Loading…</p></Shell>;

  return (
    <Shell>
      <div className="h-36 bg-raised">
        {p.bannerUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.bannerUrl} alt="" className="h-full w-full object-cover" />
        )}
      </div>
      <div className="border-b hairline px-5 pb-4">
        <div className="-mt-9">
          {p.pfpUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.pfpUrl} alt="" className="h-20 w-20 rounded-full border-4 border-ink" />
          ) : <div className="h-20 w-20 rounded-full border-4 border-ink bg-raised" />}
        </div>
        <h1 className="mt-2 font-display text-lg font-medium">{p.displayName}</h1>
        <p className="text-sm text-muted">
          <a href={`https://x.com/${p.username}`} target="_blank" rel="noreferrer" className="hover:text-ember">@{p.username} 𝕏</a>
          {" "}· {p.followers} followers · {p.tribes} tribes
        </p>
        {p.bio && <p className="mt-2 text-[15px]">{p.bio}</p>}
        {p.ownedTribes.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {p.ownedTribes.map((t) => (
              <Link key={t.id} href={`/t/${t.id}`}
                className="rounded-full bg-surface px-3 py-1 text-xs text-ember hover:bg-raised">
                leads ${t.ticker}
              </Link>
            ))}
          </div>
        )}
      </div>
      <Feed author={p.username} />
    </Shell>
  );
}

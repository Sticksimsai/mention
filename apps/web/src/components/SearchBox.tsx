"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { SearchIcon } from "./icons";

interface Results {
  tribes: Array<{ id: string; name: string; ticker: string; pfpUrl: string; membersCount: number }>;
  users: Array<{ username: string; displayName: string; pfpUrl: string }>;
}

export function SearchBox() {
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const { data } = useQuery({
    queryKey: ["search", debounced],
    queryFn: () => api<Results>(`/v1/search?q=${encodeURIComponent(debounced)}`, { auth: false }),
    enabled: debounced.length >= 1,
  });

  const hasResults = Boolean(data && (data.tribes.length || data.users.length));

  return (
    <div ref={boxRef} className="relative">
      <div className="flex items-center gap-2 rounded-full border hairline bg-surface px-4 py-2.5 focus-within:border-volt/60">
        <span className="text-muted"><SearchIcon /></span>
        <input
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder="Search tribes, tickers, people"
          className="w-full bg-transparent text-sm outline-none placeholder:text-muted"
        />
      </div>

      {open && debounced && (
        <div className="absolute z-30 mt-2 w-full overflow-hidden rounded-2xl border hairline bg-raised shadow-xl shadow-black/50">
          {!hasResults && (
            <p className="px-4 py-3 text-sm text-muted">No matches for “{debounced}”</p>
          )}
          {data?.tribes.map((t) => (
            <Link key={t.id} href={`/t/${t.id}`} onClick={() => setOpen(false)}
              className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface">
              {t.pfpUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={t.pfpUrl} alt="" className="h-8 w-8 rounded-lg object-cover" />
              ) : (
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-ink font-display text-[10px] text-volt">
                  ${t.ticker.slice(0, 3)}
                </div>
              )}
              <div className="min-w-0">
                <p className="truncate text-sm">{t.name}</p>
                <p className="text-xs text-muted">${t.ticker} · {t.membersCount} members</p>
              </div>
            </Link>
          ))}
          {data?.users.map((u) => (
            <Link key={u.username} href={`/u/${u.username}`} onClick={() => setOpen(false)}
              className="flex items-center gap-3 border-t hairline px-4 py-2.5 hover:bg-surface">
              {u.pfpUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={u.pfpUrl} alt="" className="h-8 w-8 rounded-full" />
              ) : <div className="h-8 w-8 rounded-full bg-ink" />}
              <div className="min-w-0">
                <p className="truncate text-sm">{u.displayName}</p>
                <p className="text-xs text-muted">@{u.username}</p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

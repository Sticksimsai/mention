"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import type { CommunityView } from "@tribes/shared";
import { api, fmtUsd } from "@/lib/api";
import { useMe } from "@/lib/hooks";
import { TokenPulse } from "./TokenPulse";

export function Shell({ children }: { children: React.ReactNode }) {
  const { ready, authenticated, login, logout, me } = useMe();

  return (
    <div className="mx-auto flex min-h-screen max-w-7xl">
      {/* left nav */}
      <header className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col justify-between border-r hairline px-5 py-6 md:flex">
        <div className="space-y-7">
          <Link href="/" className="font-display text-xl font-bold tracking-tight text-ember">
            tribes
          </Link>
          <nav className="flex flex-col gap-1 text-[15px]">
            <NavItem href="/">Feed</NavItem>
            <NavItem href="/tribes">Tribes</NavItem>
            <NavItem href="/launch">Launch</NavItem>
            {me && <NavItem href={`/u/${me.username}`}>Profile</NavItem>}
            {me && <NavItem href="/settings">Settings</NavItem>}
            {me?.role === "admin" && <NavItem href="/admin">Admin</NavItem>}
          </nav>
          <Link
            href="/launch"
            className="block rounded-full bg-ember px-5 py-2.5 text-center text-sm font-semibold text-ink transition-colors hover:bg-ember-deep"
          >
            Launch a token
          </Link>
        </div>

        <div>
          {!ready ? null : authenticated && me ? (
            <div className="flex items-center gap-3">
              {me.pfpUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={me.pfpUrl} alt="" className="h-9 w-9 rounded-full" />
              ) : (
                <div className="h-9 w-9 rounded-full bg-raised" />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{me.displayName}</p>
                <p className="truncate text-xs text-muted">@{me.username}</p>
              </div>
              <button onClick={logout} className="text-xs text-muted hover:text-fg">
                Log out
              </button>
            </div>
          ) : (
            <button
              onClick={login}
              className="w-full rounded-full border hairline px-5 py-2.5 text-sm font-semibold hover:bg-surface"
            >
              Sign in with X
            </button>
          )}
        </div>
      </header>

      {/* main column */}
      <main className="min-h-screen w-full max-w-2xl border-r hairline">{children}</main>

      {/* right rail */}
      <aside className="sticky top-0 hidden h-screen w-80 shrink-0 overflow-y-auto px-5 py-6 lg:block">
        <TrendingRail />
      </aside>
    </div>
  );
}

function NavItem({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="rounded-lg px-3 py-2 -mx-3 hover:bg-surface">
      {children}
    </Link>
  );
}

function TrendingRail() {
  const { data } = useQuery({
    queryKey: ["communities", "trending"],
    queryFn: () => api<CommunityView[]>("/v1/communities?sort=trending", { auth: false }),
    refetchInterval: 30_000,
  });
  const { data: newest } = useQuery({
    queryKey: ["communities", "new"],
    queryFn: () => api<CommunityView[]>("/v1/communities?sort=new", { auth: false }),
  });
  const list = (data?.length ? data : newest ?? []).slice(0, 8);

  return (
    <div className="rounded-2xl bg-surface p-4">
      <h2 className="mb-3 font-display text-sm font-medium text-fg">Trending tribes</h2>
      {list.length === 0 && (
        <p className="text-sm text-muted">No tribes yet. Launch the first one.</p>
      )}
      <ul className="space-y-1">
        {list.map((t) => (
          <li key={t.id}>
            <Link href={`/t/${t.id}`} className="flex items-center gap-3 rounded-xl p-2 hover:bg-raised">
              {t.pfpUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={t.pfpUrl} alt="" className="h-9 w-9 rounded-lg object-cover" />
              ) : (
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-raised font-display text-xs text-ember">
                  ${t.ticker.slice(0, 3)}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{t.name}</p>
                <p className="text-xs text-muted">${t.ticker} · {t.membersCount} members</p>
              </div>
              <TokenPulse ca={t.ca} compact />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export { fmtUsd };

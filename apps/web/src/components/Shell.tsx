"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import type { CommunityView } from "@mention/shared";
import { api } from "@/lib/api";
import { useMe } from "@/lib/hooks";
import { TokenPulse } from "./TokenPulse";
import { SearchBox } from "./SearchBox";
import { TopTokensRail } from "./TopTokens";
import {
  HomeIcon, FlameIcon, RocketIcon, TrophyIcon, UserIcon, GearIcon, ShieldIcon, BookIcon,
} from "./icons";

export function Shell({ children }: { children: React.ReactNode }) {
  const { ready, authenticated, login, logout, me } = useMe();

  return (
    <div className="mx-auto flex min-h-screen max-w-7xl">
      {/* ── left nav ── */}
      <header className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col justify-between border-r hairline px-4 py-5 md:flex">
        <div>
          <Link href="/" className="mb-6 flex items-center gap-2.5 px-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="" className="h-9 w-9 rounded-xl" />
            <span className="font-display text-lg font-bold tracking-tight text-volt">mention</span>
          </Link>

          <nav className="flex flex-col gap-0.5">
            <NavItem href="/" icon={<HomeIcon />}>Home</NavItem>
            <NavItem href="/explore" icon={<FlameIcon />}>Explore</NavItem>
            <NavItem href="/top" icon={<TrophyIcon />}>Leaderboard</NavItem>
            <NavItem href="/launch" icon={<RocketIcon />}>Launchpad</NavItem>
            <NavItem href="/docs" icon={<BookIcon />}>Docs</NavItem>
            {me && <NavItem href={`/u/${me.username}`} icon={<UserIcon />}>Profile</NavItem>}
            {me && <NavItem href="/settings" icon={<GearIcon />}>Settings</NavItem>}
            {me?.role === "admin" && <NavItem href="/admin" icon={<ShieldIcon />}>Admin</NavItem>}
          </nav>

          <Link
            href="/launch"
            className="mt-5 block rounded-2xl bg-volt px-5 py-3 text-center text-sm font-bold text-ink shadow-[0_0_24px_rgba(155,240,0,0.25)] transition hover:bg-volt-deep hover:shadow-[0_0_32px_rgba(155,240,0,0.35)]"
          >
            Launch a token
          </Link>
        </div>

        <div>
          {!ready ? null : authenticated && me ? (
            <div className="flex items-center gap-3 rounded-2xl border hairline bg-surface p-3">
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
              <button onClick={logout} className="text-xs text-muted hover:text-fg" title="Log out">
                ⎋
              </button>
            </div>
          ) : (
            <button
              onClick={login}
              className="w-full rounded-2xl border hairline px-5 py-3 text-sm font-semibold transition hover:border-volt/50 hover:text-volt"
            >
              Sign in with X
            </button>
          )}
        </div>
      </header>

      {/* ── main column ── */}
      <main className="min-h-screen w-full max-w-2xl border-r hairline">{children}</main>

      {/* ── right rail: search · top 10 · trending ── */}
      <aside className="sticky top-0 hidden h-screen w-[340px] shrink-0 space-y-4 overflow-y-auto px-5 py-5 lg:block">
        <SearchBox />
        <TopTokensRail />
        <TrendingRail />
      </aside>
    </div>
  );
}

function NavItem({ href, icon, children }: { href: string; icon: React.ReactNode; children: React.ReactNode }) {
  const pathname = usePathname();
  const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
  return (
    <Link
      href={href}
      className={`flex items-center gap-3.5 rounded-xl px-3 py-2.5 text-[13px] transition-colors ${
        active ? "bg-surface font-semibold text-volt" : "text-fg hover:bg-surface"
      }`}
    >
      <span className={active ? "text-volt" : "text-muted"}>{icon}</span>
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
  const list = (data?.length ? data : newest ?? []).slice(0, 6);

  return (
    <div className="rounded-2xl border hairline bg-surface p-4">
      <h2 className="mb-3 font-display text-sm font-medium">Trending</h2>
      {list.length === 0 && (
        <p className="text-sm text-muted">Quiet so far. Launch the first token.</p>
      )}
      <ul className="space-y-0.5">
        {list.map((t) => (
          <li key={t.id}>
            <Link href={`/t/${t.id}`} className="flex items-center gap-3 rounded-xl px-2 py-2 -mx-2 hover:bg-raised">
              {t.pfpUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={t.pfpUrl} alt="" className="h-9 w-9 rounded-lg object-cover" />
              ) : (
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-raised font-display text-xs text-volt">
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

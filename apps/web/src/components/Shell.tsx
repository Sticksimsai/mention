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
import { AccountButton } from "./AccountButton";
import { WalletCard } from "./WalletCard";
import { BrandLogo } from "./BrandLogo";
import {
  HomeIcon, FlameIcon, RocketIcon, TrophyIcon, UserIcon, GearIcon, ShieldIcon, BookIcon,
} from "./icons";

export function Shell({ children }: { children: React.ReactNode }) {
  const { me } = useMe();

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[1280px]">
      {/* ── left nav ── */}
      <header className="sticky top-0 hidden h-dvh w-56 shrink-0 flex-col justify-between overflow-y-auto border-r hairline px-4 py-6 md:flex xl:w-60">
        <div>
          <div className="mb-7">
            <BrandLogo />
          </div>

          <nav aria-label="Main navigation" className="flex flex-col gap-1">
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
            className="mt-6 flex min-h-11 items-center justify-center rounded-xl bg-volt px-4 py-3 text-center text-sm font-semibold text-ink transition-colors hover:bg-volt-deep"
          >
            Launch a token
          </Link>
        </div>

        <div className="mt-6"><AccountButton /></div>
      </header>

      {/* ── main column ── */}
      <main className="min-h-screen min-w-0 flex-1 border-r hairline">
        <div className="flex items-center justify-between gap-4 border-b hairline px-4 py-2 md:hidden">
          <BrandLogo compact />
          <div className="max-w-[220px]"><AccountButton /></div>
        </div>
        {children}
      </main>

      {/* ── right rail: search · top 10 · trending ── */}
      <aside className="sticky top-0 hidden h-dvh w-[296px] shrink-0 space-y-5 overflow-y-auto px-5 py-6 lg:block xl:w-[312px]">
        <SearchBox />
        {me && <WalletCard />}
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
      aria-current={active ? "page" : undefined}
      className={`flex min-h-11 items-center gap-3 rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors ${
        active ? "border-volt/15 bg-volt/[0.07] text-volt" : "border-transparent text-muted hover:bg-surface hover:text-fg"
      }`}
    >
      <span aria-hidden="true" className="flex h-5 w-5 shrink-0 items-center justify-center">{icon}</span>
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
      <h2 className="mb-3 font-display text-xs font-normal">Trending</h2>
      {list.length === 0 && (
        <p className="text-[13px] leading-6 text-muted">New communities will appear here.</p>
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

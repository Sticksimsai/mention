"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AccountButton } from "./AccountButton";
import { SearchBox } from "./SearchBox";
import { TrendingCards } from "./TrendingCards";
import { Composer } from "./Composer";
import { BrandLogo } from "./BrandLogo";
import {
  HomeIcon, RocketIcon, FlameIcon, BookIcon,
} from "./icons";

export function Shell({ children }: { children: React.ReactNode; wide?: boolean }) {

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[1340px]">
      {/* ── left nav ── */}
      <header className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col justify-between overflow-y-auto border-r hairline px-4 py-6 md:flex xl:w-60">
        <div>
          <div className="mb-5 ml-3">
            <BrandLogo />
          </div>

          <nav aria-label="Main navigation" className="flex flex-col gap-1">
            <NavItem href="/" icon={<HomeIcon />}>Feed</NavItem>
            <NavItem href="/cult" icon={<FlameIcon />}>Cult</NavItem>
            <NavItem href="/launch" icon={<RocketIcon />}>Launch</NavItem>
            <NavItem href="/how-it-works" icon={<BookIcon />}>How it works</NavItem>
          </nav>
          <Composer placement="sidebar" />

        </div>

        <div className="mt-6"><AccountButton /></div>
      </header>

      {/* ── main column ── */}
      <main className="min-h-screen min-w-0 flex-1 border-r hairline pb-24 md:pb-0">
        <div className="flex items-center justify-between gap-4 border-b hairline px-4 py-2 md:hidden">
          <BrandLogo compact />
          <div className="max-w-[220px]"><AccountButton /></div>
        </div>
        {children}
      </main>
      <aside aria-label="Discovery" className="sticky top-0 hidden h-dvh w-64 shrink-0 space-y-5 overflow-y-auto px-4 py-5 lg:block xl:w-72">
        <SearchBox />
        <TrendingCards />
      </aside>

      <nav aria-label="Mobile navigation" className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-around border-t hairline bg-ink px-1 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] md:hidden">
        <MobileLink href="/" icon={<HomeIcon />} label="Feed" />
        <MobileLink href="/cult" icon={<FlameIcon />} label="Cult" />
        <Composer placement="mobile" />
        <MobileLink href="/launch" icon={<RocketIcon />} label="Launch" />
        <MobileLink href="/how-it-works" icon={<BookIcon />} label="How it works" />
      </nav>

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

function MobileLink({href,icon,label}:{href:string;icon:React.ReactNode;label:string}) {
 const pathname=usePathname();const active=href==="/"?pathname===href:pathname.startsWith(href);
 return <Link href={href} aria-current={active?"page":undefined} className={`flex min-h-12 min-w-14 flex-col items-center justify-center gap-1 text-[10px] ${active?"text-volt":"text-muted"}`}><span className="h-5 w-5" aria-hidden="true">{icon}</span>{label}</Link>;
}

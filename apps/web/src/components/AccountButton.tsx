"use client";
import Link from "next/link";
import { useMe } from "@/lib/hooks";

export function AccountButton({ compact = false }: { compact?: boolean }) {
  const { ready, authenticated, login, logout, me, error, retry } = useMe();
  if (!ready) return <div className="h-14 animate-pulse rounded-xl bg-surface" aria-label="Loading account" />;
  if (authenticated && !me) return <div className="rounded-xl border hairline p-3 text-xs text-muted" role="status">
    {error ? <><p>Could not load your profile.</p><button onClick={() => retry()} className="mt-2 text-volt">Retry</button><button onClick={logout} className="ml-4">Sign out</button></> : "Loading your X profile…"}
  </div>;
  if (!authenticated || !me) return <button onClick={login} className="min-h-11 w-full rounded-xl border hairline bg-surface px-4 py-3 text-sm font-semibold hover:border-volt/50 hover:text-volt">Sign in with 𝕏</button>;
  return <div className="flex items-center gap-1 rounded-xl border hairline bg-surface p-2">
    <Link href={`/u/${encodeURIComponent(me.username)}`} aria-label={`Open ${me.displayName}'s profile`} className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg p-1 hover:bg-raised">
      {me.pfpUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={me.pfpUrl} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />
      ) : <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-raised text-sm text-volt">{me.displayName.slice(0, 1)}</span>}
      {!compact && <span className="min-w-0"><span className="block truncate text-xs font-semibold">{me.displayName}</span><span className="block truncate text-[11px] text-muted">@{me.username}</span></span>}
      <span className="ml-auto text-muted" aria-hidden="true">↗</span>
    </Link>
    <button onClick={logout} aria-label="Sign out" title="Sign out" className="grid h-9 w-8 shrink-0 place-items-center rounded-lg text-muted hover:bg-raised hover:text-fg">⎋</button>
  </div>;
}

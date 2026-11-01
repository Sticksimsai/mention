"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Shell } from "@/components/Shell";
import { Feed } from "@/components/Feed";
import { WalletCard } from "@/components/WalletCard";
import { Modal } from "@/components/Modal";
import { api, ApiError } from "@/lib/api";
import { useMe } from "@/lib/hooks";

interface Community { id: string; name: string; ticker: string; pfpUrl: string; membersCount?: number; isOwner?: boolean }
interface Profile {
  id: string; username: string; displayName: string; pfpUrl: string; bannerUrl: string; bio: string;
  createdAt: string; followers: number; following: number; tribes: number;
  postCount?: number; ownedTribes: Community[]; joinedCommunities?: Community[];
}

export default function ProfilePage() {
  const { username } = useParams<{ username: string }>();
  const { me } = useMe();
  const qc = useQueryClient();
  const [tab, setTab] = useState<"posts" | "communities" | "wallet">("posts");
  const [editing, setEditing] = useState(false);
  const [bio, setBio] = useState("");
  const profile = useQuery({
    queryKey: ["profile", username],
    queryFn: () => api<Profile>(`/v1/users/${encodeURIComponent(username)}`, { auth: false }),
  });
  const save = useMutation({
    mutationFn: () => api("/v1/users/me", { method: "PATCH", body: { bio } }),
    onSuccess: async () => { await qc.invalidateQueries({ queryKey: ["profile", username] }); setEditing(false); },
  });
  const p = profile.data;
  const own = Boolean(me && p && me.id === p.id);
  if (profile.isPending) return <Shell><div className="animate-pulse p-6" role="status"><div className="h-36 rounded-xl bg-surface" /><p className="mt-6 text-sm text-muted">Loading profile…</p></div></Shell>;
  if (!p || profile.isError) return <Shell><div className="p-8 text-center"><h1 className="text-lg font-semibold">{profile.error instanceof ApiError && profile.error.status === 404 ? "Profile not found" : "Could not load this profile"}</h1><button onClick={() => profile.refetch()} className="mt-4 text-sm text-volt">Try again</button><Link href="/" className="ml-5 text-sm text-muted">Back home</Link></div></Shell>;
  const activeTab = tab === "wallet" && !own ? "posts" : tab;
  return <Shell>
    <header className="flex items-center gap-4 border-b hairline px-5 py-4">
      <Link href="/" aria-label="Back home" className="text-xl text-muted">←</Link>
      <div className="min-w-0"><h1 className="truncate text-base font-semibold">{p.displayName}</h1><p className="text-[11px] text-muted">{own ? "Your profile" : `@${p.username}`}</p></div>
      {own && <span className="ml-auto shrink-0 rounded-full border hairline px-2 py-1 text-[10px] text-muted"><span className="mr-1 text-volt">●</span>X connected</span>}
    </header>
    <div className="relative h-32 overflow-hidden bg-gradient-to-br from-[#26391a] via-[#3c5420] to-[#90ae42] sm:h-36">
      {p.bannerUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={p.bannerUrl} alt="" className="h-full w-full object-cover" />
      ) : <><span aria-hidden="true" className="absolute -right-3 -top-20 rotate-[-15deg] text-[240px] font-black leading-none text-volt/15">@</span><p className="absolute bottom-4 right-5 text-[10px] text-white/80">where conversations become communities.</p></>}
    </div>
    <section className="px-5 pb-6 sm:px-6">
      <div className="relative flex items-start justify-between">
        {p.pfpUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.pfpUrl} alt={`${p.displayName}'s X avatar`} className="-mt-10 h-20 w-20 rounded-full border-4 border-ink object-cover sm:h-24 sm:w-24" />
        ) : <div className="-mt-10 grid h-20 w-20 place-items-center rounded-full border-4 border-ink bg-raised text-3xl text-volt">{p.displayName.slice(0, 1)}</div>}
        {own ? <button onClick={() => { setBio(p.bio); save.reset(); setEditing(true); }} className="mt-3 rounded-xl border hairline px-4 py-2 text-xs font-semibold hover:bg-surface">Edit profile</button> : <a href={`https://x.com/${encodeURIComponent(p.username)}`} target="_blank" rel="noreferrer" className="mt-3 rounded-xl border hairline px-4 py-2 text-xs font-semibold">View on 𝕏 ↗</a>}
      </div>
      <h2 className="mt-3 break-words text-2xl font-semibold tracking-tight">{p.displayName}</h2>
      <a href={`https://x.com/${encodeURIComponent(p.username)}`} target="_blank" rel="noreferrer" className="text-xs text-muted hover:text-volt">@{p.username} · 𝕏</a>
      {p.bio ? <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed">{p.bio}</p> : own && <p className="mt-3 text-sm text-muted">Tell your community a little about yourself. <button onClick={() => { setBio(""); setEditing(true); }} className="text-volt">Add a bio</button></p>}
      <p className="mt-3 text-xs text-muted">Joined {new Date(p.createdAt).toLocaleDateString(undefined, { month: "long", year: "numeric" })}</p>
      <div className="mt-3 flex gap-5 text-xs text-muted"><span><strong className="mr-1 text-fg">{p.following.toLocaleString()}</strong>following on Mentions</span><span><strong className="mr-1 text-fg">{p.followers.toLocaleString()}</strong>followers on Mentions</span></div>
    </section>
    <section className="grid grid-cols-3 gap-2 px-5 pb-6 sm:px-6" aria-label="Profile stats">
      <Stat label="Communities joined" value={p.tribes} />
      <Stat label="Mentions posts" value={p.postCount} />
      <Stat label="Communities created" value={p.ownedTribes.length} />
    </section>
    {own && <div className="px-5 pb-5 lg:hidden"><button onClick={() => setTab("wallet")} className="w-full rounded-xl border hairline bg-surface px-4 py-3 text-left text-sm font-medium">My wallet <span className="float-right text-volt">Add funds ↗</span></button></div>}
    <nav className="flex border-b hairline px-4" aria-label="Profile sections">{(["posts", "communities", ...(own ? ["wallet"] : [])] as const).map(t => <button key={t} onClick={() => setTab(t as typeof tab)} aria-current={activeTab === t ? "page" : undefined} className={`flex-1 border-b-2 px-2 py-3 text-sm font-medium capitalize ${activeTab === t ? "border-volt text-fg" : "border-transparent text-muted hover:text-fg"}`}>{t === "wallet" ? "Wallet & activity" : t}</button>)}</nav>
    {activeTab === "posts" && <Feed author={p.username} />}
    {activeTab === "communities" && <div className="p-5 sm:p-6">
      {!p.joinedCommunities ? <p className="text-sm text-muted">Community details are temporarily unavailable. Please refresh shortly.</p> : p.joinedCommunities.length ? <div className="space-y-2">{p.joinedCommunities.map(c => <Link key={c.id} href={`/t/${c.id}`} className="flex items-center gap-3 rounded-xl border hairline bg-surface p-3 hover:border-volt/30">
        {c.pfpUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={c.pfpUrl} alt="" className="h-10 w-10 rounded-xl object-cover" />
        ) : <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-raised text-sm font-semibold text-volt">{c.ticker.slice(0, 2)}</span>}
        <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{c.name}</span><span className="text-xs text-muted">${c.ticker} · {c.membersCount?.toLocaleString()} members</span></span><span className="text-[10px] text-volt">{c.isOwner ? "Creator" : "Member"}</span>
      </Link>)}</div> : <div className="py-10 text-center"><p className="text-sm text-muted">No communities joined yet.</p><Link href="/explore" className="mt-3 inline-block text-sm text-volt">Explore communities ↗</Link></div>}
      {p.tribes > (p.joinedCommunities?.length ?? 0) && p.joinedCommunities && <p className="mt-4 text-xs text-muted">Showing the {p.joinedCommunities.length} most recently joined communities.</p>}
    </div>}
    {activeTab === "wallet" && own && <div className="p-5 sm:p-6"><WalletCard showActivity /></div>}
    <Modal open={editing && own} onClose={() => setEditing(false)} title="Edit your profile">
      <form className="p-7 pt-14" onSubmit={e => { e.preventDefault(); save.mutate(); }}><h2 className="text-xl font-semibold">Edit profile</h2><p className="mt-2 text-xs text-muted">Your name, username and photo sync from X.</p><label htmlFor="profile-bio" className="mb-2 mt-6 block text-sm">Bio</label><textarea id="profile-bio" value={bio} onChange={e => setBio(e.target.value)} maxLength={500} rows={5} className="w-full resize-y rounded-xl border hairline bg-ink p-3 text-sm focus:border-volt focus:outline-none" /><p className="mt-1 text-right text-xs text-muted">{bio.length}/500</p>{save.isError && <p role="alert" className="mt-3 text-sm text-down">{save.error.message}</p>}<button disabled={save.isPending} className="mt-5 w-full rounded-xl bg-volt px-5 py-3 text-sm font-semibold text-ink disabled:opacity-50">{save.isPending ? "Saving…" : "Save changes"}</button></form>
    </Modal>
  </Shell>;
}
function Stat({ label, value }: { label: string; value?: number }) {
  return <div className="rounded-xl border hairline bg-surface p-3"><p className="text-[10px] leading-relaxed text-muted">{label}</p><p className="mt-2 text-xl font-semibold tracking-tight">{value === undefined ? "—" : value.toLocaleString()}</p></div>;
}

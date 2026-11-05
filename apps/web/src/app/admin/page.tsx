"use client";

import Link from "next/link";
import { OFFICIAL_ACCOUNT_ID } from "@mention/shared";
import { Composer } from "@/components/Composer";
import { ManagementGate, Panel, CommunityDirectory, PostControls, ManagedPost, control, Result } from "@/components/Management";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LaunchReadiness } from "@/components/LaunchReadiness";
import { CreatorPayoutAdmin } from "@/components/CreatorPayoutAdmin";
import { Shell } from "@/components/Shell";
import { api } from "@/lib/api";
import { useMe } from "@/lib/hooks";

export default function AdminPage() {
 return <Shell wide><header className="border-b hairline p-5 sm:p-6"><p className="text-xs text-volt">SITE PORTAL</p><h1 className="mt-2 text-2xl font-semibold">onlycults administration</h1><p className="mt-2 text-sm text-muted">Official updates, community oversight and moderation.</p></header><ManagementGate staff><AdminDashboard/></ManagementGate></Shell>;
}
function AdminDashboard(){
 const {me}=useMe();const [tab,setTab]=useState("Overview");
 const overview=useQuery({queryKey:["manage","overview"],queryFn:()=>api<{users:number;communities:number;posts:number;bans:{username:string;reason:string}[];audit:{id:string;action:string;targetId:string;createdAt:string}[]}>("/v1/manage/overview")});
 const recent=useQuery({queryKey:["manage","posts"],queryFn:()=>api<ManagedPost[]>("/v1/manage/posts"),enabled:tab==="Posts"});
 const qc=useQueryClient();const unban=useMutation({mutationFn:(username:string)=>api(`/v1/admin/bans/${username}`,{method:"DELETE"}),onSuccess:()=>qc.invalidateQueries({queryKey:["manage"]})});
 const tabs=["Overview","Posts","Communities","Moderation","X sync",...(me?.role==="admin"?["Readiness","Settings","Payouts"]:[])];
 return <><nav className="flex gap-5 overflow-x-auto border-b hairline px-5 pt-4">{tabs.map(t=><button className={`shrink-0 border-b-2 pb-3 text-sm ${tab===t?"border-volt text-fg":"border-transparent text-muted"}`} key={t} onClick={()=>setTab(t)}>{t}</button>)}</nav><div className="space-y-5 p-5 sm:p-6">
 {tab==="Overview"&&<>{overview.isError?<p className="text-sm text-down">{overview.error.message}</p>:<div className="grid grid-cols-3 gap-3">{([['Accounts',overview.data?.users],['Communities',overview.data?.communities],['Native posts',overview.data?.posts]] as const).map(([label,value])=><div key={label} className="rounded-xl border hairline bg-surface p-4"><p className="text-xs text-muted">{label}</p><p className="mt-3 text-2xl font-semibold">{value??"—"}</p></div>)}</div>}
 {me?.id===OFFICIAL_ACCOUNT_ID&&<Panel title="Publish an official update" description="Every post from this account appears in everyone’s For you and Joined feeds. Pin important updates from the Posts tab."><Composer/></Panel>}
 <Panel title="Your two workspaces"><div className="grid gap-3 sm:grid-cols-2"><button className="rounded-xl border hairline p-4 text-left" onClick={()=>setTab("Posts")}><p className="font-medium">Sitewide moderation</p><p className="mt-2 text-sm text-muted">Pin updates, hide posts and manage site access.</p></button><Link href="/manage" className="rounded-xl border hairline p-4"><p className="font-medium">Community portal →</p><p className="mt-2 text-sm text-muted">Member lists, community settings and post controls.</p></Link></div></Panel>
 <Panel title="Recent moderation activity">{overview.data?.audit.length?<ul className="divide-y divide-white/10">{overview.data.audit.map(a=><li key={a.id} className="py-3 text-sm"><span>{a.action}</span><p className="mt-1 break-all text-xs text-muted">{a.targetId} · {new Date(a.createdAt).toLocaleString()}</p></li>)}</ul>:<p className="text-sm text-muted">No moderation actions recorded yet.</p>}</Panel></>}
 {tab==="X sync"&&<SyncStatus/>}
 {tab==="Posts"&&<Panel title="Posts & feed pins" description="The 100 most recent native posts and 100 mirrored X posts. Sitewide pins appear at the top of Home for everyone. These controls do not pin posts on x.com.">{recent.isPending?<p className="text-sm text-muted">Loading posts…</p>:recent.isError?<p className="text-sm text-down">{recent.error.message}</p>:<PostControls items={recent.data}/>}</Panel>}
 {tab==="Communities"&&<Panel title="All token communities" description="Open a dashboard to review its details, members and posts."><CommunityDirectory/></Panel>}
 {tab==="Moderation"&&<><Bans/><Panel title="Restricted accounts"><Result mutation={unban}/>{overview.data?.bans.length?overview.data.bans.map(b=><div key={b.username} className="flex items-center justify-between gap-3 border-b hairline py-3"><div><p className="text-sm">@{b.username}</p><p className="text-xs text-muted">{b.reason}</p></div><button className={control} disabled={unban.isPending} onClick={()=>unban.mutate(b.username)}>Unban</button></div>):<p className="text-sm text-muted">No banned accounts.</p>}</Panel></>}
 {tab==="Settings"&&me?.role==="admin"&&<><Staff/><Announcement/><Usage/></>}
 {tab==="Readiness"&&me?.role==="admin"&&<LaunchReadiness/>}
 {tab==="Payouts"&&me?.role==="admin"&&<CreatorPayoutAdmin/>}
 </div></>;
}

const inputCls = "rounded-xl bg-raised px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-volt";
const btnCls = "rounded-full bg-volt px-4 py-1.5 text-sm font-semibold text-ink hover:bg-volt-deep disabled:opacity-40";

function Bans() {
  const qc=useQueryClient();
  const [username, setUsername] = useState("");
  const [reason, setReason] = useState("");
  const ban = useMutation({
    mutationFn: () => api("/v1/admin/bans", { method: "POST", body: { username, reason } }),
    onSuccess: () => { setUsername(""); setReason(""); qc.invalidateQueries({queryKey:["manage"]}); },
  });
  return (
    <section className="rounded-2xl bg-surface p-5">
      <h2 className="mb-3 font-medium">Ban a user</h2>
      <div className="flex flex-wrap gap-2">
        <input className={inputCls} placeholder="username" value={username} onChange={(e) => setUsername(e.target.value)} />
        <input className={`${inputCls} flex-1`} placeholder="reason" value={reason} onChange={(e) => setReason(e.target.value)} />
        <button className={btnCls} disabled={!username || ban.isPending} onClick={() => ban.mutate()}>Ban</button>
      </div>
      {ban.isError && <p className="mt-2 text-xs text-down">{(ban.error as Error).message}</p>}
      {ban.isSuccess && <p className="mt-2 text-xs text-up">Banned.</p>}
    </section>
  );
}

function Staff() {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["admin", "staff"],
    queryFn: () => api<Array<{ username: string; role: string }>>("/v1/admin/staff"),
  });
  const [username, setUsername] = useState("");
  const [role, setRole] = useState<"moderator" | "admin">("moderator");
  const add = useMutation({
    mutationFn: () => api("/v1/admin/staff", { method: "POST", body: { username, role } }),
    onSettled: () => qc.invalidateQueries({ queryKey: ["admin", "staff"] }),
  });
  return (
    <section className="rounded-2xl bg-surface p-5">
      <h2 className="mb-3 font-medium">Staff</h2>
      <Result mutation={add}/>
      <ul className="mb-3 space-y-1 text-sm">
        {data?.map((s) => (
          <li key={s.username} className="flex items-center gap-2">
            <span>@{s.username}</span>
            <span className="rounded-md bg-raised px-1.5 py-0.5 text-[11px] text-volt">{s.role}</span>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <input className={inputCls} placeholder="username" value={username} onChange={(e) => setUsername(e.target.value)} />
        <select className={inputCls} value={role} onChange={(e) => setRole(e.target.value as any)}>
          <option value="moderator">moderator</option>
          <option value="admin">admin</option>
        </select>
        <button className={btnCls} disabled={!username || add.isPending} onClick={() => add.mutate()}>Add</button>
      </div>
    </section>
  );
}

function Announcement() {
  const [message, setMessage] = useState("");
  const post = useMutation({
    mutationFn: () => api("/v1/admin/announcements", { method: "POST", body: { message } }),
    onSuccess: () => setMessage(""),
  });
  const clear = useMutation({
    mutationFn: () => api("/v1/admin/announcements", { method: "DELETE" }),
  });
  return (
    <section className="rounded-2xl bg-surface p-5">
      <h2 className="mb-3 font-medium">Site announcement</h2>
      <Result mutation={post}/><Result mutation={clear}/>
      <div className="flex gap-2">
        <input className={`${inputCls} flex-1`} placeholder="message" value={message} onChange={(e) => setMessage(e.target.value)} />
        <button className={btnCls} disabled={!message || post.isPending} onClick={() => post.mutate()}>Publish</button>
        <button className="rounded-full border hairline px-4 py-1.5 text-sm" onClick={() => clear.mutate()}>Clear</button>
      </div>
    </section>
  );
}

function Usage() {
  const { data } = useQuery({
    queryKey: ["admin", "sd-usage"],
    queryFn: () => api<Array<{ jobName: string; day: string; items: number; requests: number }>>("/v1/admin/socialdata-usage"),
  });
  return (
    <section className="rounded-2xl bg-surface p-5">
      <h2 className="mb-3 font-medium">SocialData spend</h2>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-muted">
            <th className="pb-2 font-normal">day</th>
            <th className="pb-2 font-normal">job</th>
            <th className="pb-2 text-right font-normal">items</th>
            <th className="pb-2 text-right font-normal">≈ cost</th>
          </tr>
        </thead>
        <tbody className="font-mono text-xs">
          {data?.slice(0, 20).map((r, i) => (
            <tr key={i} className="border-t hairline">
              <td className="py-1.5">{r.day}</td>
              <td className="py-1.5">{r.jobName}</td>
              <td className="py-1.5 text-right">{r.items.toLocaleString()}</td>
              <td className="py-1.5 text-right">${(r.items * 0.0002).toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function SyncStatus(){
 const query=useQuery({queryKey:["manage","sync"],queryFn:()=>api<{pollSeconds:number;pendingWritebacks:number;failedWritebacks:number;lastSearch:string|null;accounts:{username:string;lastSyncedAt:string|null;lastError:string|null}[];searches:{id:string;name:string;lastCheckedAt?:string;lastError?:string;cursor?:string}[]}>("/v1/manage/sync"),refetchInterval:15000});
 if(query.isPending)return <p className="text-muted">Loading sync status…</p>;
 if(query.isError)return <p className="text-down">{query.error.message}</p>;
 const d=query.data;
 return <><Panel title="X → onlycults" description="Public ticker/CA searches and account checks run every minute. Indexing delays, queue load and the provider’s daily usage cap can delay imports."><p className="text-sm">Latest public search: {d.lastSearch?new Date(d.lastSearch).toLocaleString():"Waiting for an approved token community"}</p><div className="mt-4 space-y-3">{d.searches.map(s=><div key={s.id} className="border-t hairline pt-3 text-sm"><Link className="text-volt" href={`/manage/${s.id}`}>{s.name}</Link><p className="mt-1 text-xs text-muted">{s.lastCheckedAt?new Date(s.lastCheckedAt).toLocaleString():"Waiting for first check"}{s.cursor?" · catching up older results":""}</p>{s.lastError&&<p className="text-xs text-down">{s.lastError}</p>}</div>)}</div><div className="mt-4 space-y-2">{d.accounts.map(a=><p key={a.username} className="text-xs text-muted">@{a.username} · {a.lastSyncedAt?new Date(a.lastSyncedAt).toLocaleString():"Not yet synced"}{a.lastError&&<span className="ml-2 text-down">{a.lastError}</span>}</p>)}</div></Panel><Panel title="onlycults → X" description="Opted-in posts queue immediately. A recovery sweep runs every 15 seconds. X write access and an enabled cross-post setting are required."><div className="flex gap-8 text-sm"><p>{d.pendingWritebacks} pending</p><p>{d.failedWritebacks} failed</p></div></Panel></>;
}

"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CreatorPayoutAdmin } from "@/components/CreatorPayoutAdmin";
import { Shell } from "@/components/Shell";
import { api } from "@/lib/api";
import { useMe } from "@/lib/hooks";

export default function AdminPage() {
  const { me } = useMe();

  return (
    <Shell>
      <div className="border-b hairline px-5 py-4">
        <h1 className="font-display text-base font-medium">Admin</h1>
      </div>
      {me?.role !== "admin" ? (
        <p className="px-5 py-10 text-sm text-muted">Admins only.</p>
      ) : (
        <div className="space-y-6 px-5 py-6">
          <CreatorPayoutAdmin />
          <Bans />
          <Staff />
          <Announcement />
          <Usage />
        </div>
      )}
    </Shell>
  );
}

const inputCls = "rounded-xl bg-raised px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-volt";
const btnCls = "rounded-full bg-volt px-4 py-1.5 text-sm font-semibold text-ink hover:bg-volt-deep disabled:opacity-40";

function Bans() {
  const [username, setUsername] = useState("");
  const [reason, setReason] = useState("");
  const ban = useMutation({
    mutationFn: () => api("/v1/admin/bans", { method: "POST", body: { username, reason } }),
    onSuccess: () => { setUsername(""); setReason(""); },
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

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { Shell } from "@/components/Shell";
import { api } from "@/lib/api";
import { useMe } from "@/lib/hooks";

export default function LaunchPage() {
  const { authenticated, login } = useMe();
  const router = useRouter();
  const [mode, setMode] = useState<"launch" | "link">("launch");

  return (
    <Shell>
      <div className="border-b hairline px-5 py-4">
        <h1 className="font-display text-base font-medium">Launch</h1>
        <p className="text-xs text-muted">Every token minted here gets its own tribe, mirrored with X from day one.</p>
        <div className="mt-3 flex gap-6 text-sm">
          <button onClick={() => setMode("launch")}
            className={`border-b-2 pb-2 ${mode === "launch" ? "border-ember" : "border-transparent text-muted"}`}>
            Mint a new token
          </button>
          <button onClick={() => setMode("link")}
            className={`border-b-2 pb-2 ${mode === "link" ? "border-ember" : "border-transparent text-muted"}`}>
            Link an existing CA
          </button>
        </div>
      </div>

      {!authenticated ? (
        <div className="px-5 py-12 text-center">
          <button onClick={login} className="rounded-full bg-ember px-6 py-2.5 font-semibold text-ink">
            Sign in with X to launch
          </button>
        </div>
      ) : mode === "launch" ? (
        <LaunchForm onDone={(communityId) => router.push(`/t/${communityId}`)} />
      ) : (
        <LinkForm onDone={(communityId) => router.push(`/t/${communityId}`)} />
      )}
    </Shell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs text-muted">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

const inputCls = "w-full rounded-xl bg-surface px-4 py-3 text-sm outline-none focus:ring-1 focus:ring-ember";

function LaunchForm({ onDone }: { onDone: (communityId: string) => void }) {
  const [f, setF] = useState({
    name: "", ticker: "", description: "", imageUrl: "",
    website: "", telegram: "", creatorWallet: "", devBuySol: "0",
  });
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setF((p) => ({ ...p, [k]: e.target.value }));

  const launch = useMutation({
    mutationFn: () => api<{ ca: string; communityId: string; pumpUrl: string }>("/v1/launch", {
      method: "POST",
      body: {
        name: f.name, ticker: f.ticker, description: f.description,
        imageUrl: f.imageUrl,
        website: f.website || null, telegram: f.telegram || null,
        creatorWallet: f.creatorWallet,
        devBuySol: Number(f.devBuySol) || 0,
      },
    }),
    onSuccess: (d) => onDone(d.communityId),
  });

  return (
    <div className="space-y-4 px-5 py-6">
      <div className="grid grid-cols-2 gap-4">
        <Field label="Token name"><input className={inputCls} value={f.name} onChange={set("name")} placeholder="Night Market" /></Field>
        <Field label="Ticker"><input className={inputCls} value={f.ticker} onChange={set("ticker")} placeholder="NIGHT" /></Field>
      </div>
      <Field label="Description">
        <textarea className={inputCls} rows={3} value={f.description} onChange={set("description")} placeholder="What is this tribe about?" />
      </Field>
      <Field label="Token image URL"><input className={inputCls} value={f.imageUrl} onChange={set("imageUrl")} placeholder="https://…" /></Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Website (optional)"><input className={inputCls} value={f.website} onChange={set("website")} /></Field>
        <Field label="Telegram (optional)"><input className={inputCls} value={f.telegram} onChange={set("telegram")} /></Field>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Your wallet (receives your fee share)">
          <input className={`${inputCls} font-mono`} value={f.creatorWallet} onChange={set("creatorWallet")} placeholder="Solana address" />
        </Field>
        <Field label="Dev buy (SOL, optional)"><input className={inputCls} value={f.devBuySol} onChange={set("devBuySol")} inputMode="decimal" /></Field>
      </div>

      <div className="rounded-xl bg-surface p-4 text-xs leading-relaxed text-muted">
        Launches go live on pump.fun. Creator fees on all trading volume are collected by the
        platform and split with you — your share pays out to the wallet above. Your tribe opens
        instantly with the chart, CA and X mirroring wired in.
      </div>

      <button
        onClick={() => launch.mutate()}
        disabled={launch.isPending || !f.name || !f.ticker || !f.imageUrl || !f.creatorWallet}
        className="w-full rounded-xl bg-ember py-3 font-semibold text-ink hover:bg-ember-deep disabled:opacity-40"
      >
        {launch.isPending ? "Launching…" : "Launch token + tribe"}
      </button>
      {launch.isError && <p className="text-xs text-down">{(launch.error as Error).message}</p>}
    </div>
  );
}

function LinkForm({ onDone }: { onDone: (communityId: string) => void }) {
  const [f, setF] = useState({ name: "", ticker: "", ca: "", details: "" });
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setF((p) => ({ ...p, [k]: e.target.value }));

  const create = useMutation({
    mutationFn: () => api<{ id: string }>("/v1/communities", {
      method: "POST",
      body: { name: f.name, ticker: f.ticker, ca: f.ca, details: f.details },
    }),
    onSuccess: (d) => onDone(d.id),
  });

  return (
    <div className="space-y-4 px-5 py-6">
      <div className="grid grid-cols-2 gap-4">
        <Field label="Tribe name"><input className={inputCls} value={f.name} onChange={set("name")} /></Field>
        <Field label="Ticker"><input className={inputCls} value={f.ticker} onChange={set("ticker")} /></Field>
      </div>
      <Field label="Contract address (CA)">
        <input className={`${inputCls} font-mono`} value={f.ca} onChange={set("ca")} placeholder="Already-launched Solana mint" />
      </Field>
      <Field label="About">
        <textarea className={inputCls} rows={3} value={f.details} onChange={set("details")} />
      </Field>
      <button
        onClick={() => create.mutate()}
        disabled={create.isPending || !f.name || !f.ticker || !f.ca}
        className="w-full rounded-xl bg-ember py-3 font-semibold text-ink hover:bg-ember-deep disabled:opacity-40"
      >
        {create.isPending ? "Creating…" : "Create tribe"}
      </button>
      {create.isError && <p className="text-xs text-down">{(create.error as Error).message}</p>}
    </div>
  );
}

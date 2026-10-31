"use client";

// Launch: the only way a tribe is born. Mint on pump.fun through Tribes —
// the token, the community, the chart and the X mirroring all go live at once.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { Shell } from "@/components/Shell";
import { api } from "@/lib/api";
import { useMe } from "@/lib/hooks";

export default function LaunchPage() {
  const { authenticated, login } = useMe();
  const router = useRouter();

  return (
    <Shell>
      <div className="border-b hairline px-5 py-4">
        <h1 className="font-display text-base font-medium">Launchpad</h1>
        <p className="text-xs text-muted">
          Mint a token, mint a tribe. One launch creates both — feed, chart and X mirroring included.
        </p>
      </div>

      {!authenticated ? (
        <div className="px-5 py-14 text-center">
          <button onClick={login} className="rounded-2xl bg-volt px-6 py-3 font-bold text-ink hover:bg-volt-deep">
            Sign in with X to launch
          </button>
        </div>
      ) : (
        <LaunchForm onDone={(communityId) => router.push(`/t/${communityId}`)} />
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

const inputCls = "w-full rounded-xl border hairline bg-surface px-4 py-3 text-sm outline-none transition focus:border-volt/60";

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

      <div className="rounded-2xl border border-volt/25 bg-volt/5 p-4 text-xs leading-relaxed text-muted">
        <span className="text-volt">How launches work:</span> your token goes live on pump.fun
        instantly. Creator fees on all trading volume are collected by the platform and split
        with you — your share pays out to the wallet above. Your tribe opens the moment the
        mint lands, with the chart, CA and X mirroring already wired in.
      </div>

      <button
        onClick={() => launch.mutate()}
        disabled={launch.isPending || !f.name || !f.ticker || !f.imageUrl || !f.creatorWallet}
        className="w-full rounded-2xl bg-volt py-3.5 font-bold text-ink shadow-[0_0_24px_rgba(155,240,0,0.2)] transition hover:bg-volt-deep disabled:opacity-40 disabled:shadow-none"
      >
        {launch.isPending ? "Launching…" : "Launch token + tribe"}
      </button>
      {launch.isError && <p className="text-xs text-down">{(launch.error as Error).message}</p>}
    </div>
  );
}

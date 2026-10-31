"use client";

// Tribe page — header banner with the live mcap pulse, join, bio with token
// info + CA, embedded chart, trade box, and the tribe's merged feed.
import { useState } from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CommunityView, TokenStats } from "@tribes/shared";
import { Shell } from "@/components/Shell";
import { Feed } from "@/components/Feed";
import { Composer } from "@/components/Composer";
import { TokenPulse } from "@/components/TokenPulse";
import { api, shortCa } from "@/lib/api";
import { useMe } from "@/lib/hooks";

export default function TribePage() {
  const { id } = useParams<{ id: string }>();
  const { authenticated, login, me } = useMe();
  const qc = useQueryClient();
  const [tab, setTab] = useState<"feed" | "chart" | "trade">("feed");

  const { data: tribe } = useQuery({
    queryKey: ["community", id],
    queryFn: () => api<CommunityView>(`/v1/communities/${id}`, { auth: false }),
  });
  const { data: membership } = useQuery({
    queryKey: ["membership", id, me?.id],
    queryFn: () => api<{ isMember: boolean }>(`/v1/communities/${id}/membership`),
    enabled: Boolean(me),
  });

  const joinLeave = useMutation({
    mutationFn: (join: boolean) =>
      api(`/v1/communities/${id}/${join ? "join" : "leave"}`, { method: "POST" }),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["membership", id] });
      qc.invalidateQueries({ queryKey: ["community", id] });
    },
  });

  if (!tribe) {
    return <Shell><p className="px-5 py-8 text-sm text-muted">Loading…</p></Shell>;
  }

  const isMember = membership?.isMember ?? false;

  return (
    <Shell>
      {/* banner + pulse */}
      <div className="relative h-44 bg-raised">
        {tribe.bannerUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={tribe.bannerUrl} alt="" className="h-full w-full object-cover" />
        )}
        <div className="absolute inset-x-4 bottom-3">
          <TokenPulse ca={tribe.ca} />
        </div>
      </div>

      <div className="border-b hairline px-5 pb-4">
        <div className="flex items-end justify-between">
          <div className="-mt-8">
            {tribe.pfpUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={tribe.pfpUrl} alt="" className="h-20 w-20 rounded-2xl border-4 border-ink object-cover" />
            ) : (
              <div className="flex h-20 w-20 items-center justify-center rounded-2xl border-4 border-ink bg-raised font-display text-ember">
                ${tribe.ticker.slice(0, 4)}
              </div>
            )}
          </div>
          <button
            onClick={() => (authenticated ? joinLeave.mutate(!isMember) : login())}
            disabled={joinLeave.isPending}
            className={`mt-3 rounded-full px-5 py-2 text-sm font-semibold ${
              isMember
                ? "border hairline text-fg hover:border-down hover:text-down"
                : "bg-ember text-ink hover:bg-ember-deep"
            }`}
          >
            {isMember ? "Joined" : "Join the tribe"}
          </button>
        </div>

        <h1 className="mt-3 font-display text-xl font-medium">{tribe.name}</h1>
        <p className="text-sm text-muted">
          ${tribe.ticker} · {tribe.membersCount} members · led by{" "}
          <a href={`/u/${tribe.owner.username}`} className="text-ember hover:underline">@{tribe.owner.username}</a>
          {tribe.launchedViaTribes && " · launched on Tribes"}
        </p>
        {tribe.details && <p className="mt-2 text-[15px] leading-relaxed">{tribe.details}</p>}
        <p className="mt-2 font-mono text-xs text-muted">
          CA{" "}
          <button onClick={() => navigator.clipboard?.writeText(tribe.ca)} className="hover:text-ember" title="Copy">
            {shortCa(tribe.ca)} ⧉
          </button>
          {tribe.website && <> · <a className="hover:text-ember" href={tribe.website} target="_blank" rel="noreferrer">website</a></>}
          {tribe.telegram && <> · <a className="hover:text-ember" href={tribe.telegram} target="_blank" rel="noreferrer">telegram</a></>}
          {" · "}
          <a className="hover:text-ember" href={`https://pump.fun/coin/${tribe.ca}`} target="_blank" rel="noreferrer">pump.fun</a>
        </p>

        <div className="mt-4 flex gap-6 text-sm">
          {(["feed", "chart", "trade"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`border-b-2 pb-2 capitalize ${tab === t ? "border-ember text-fg" : "border-transparent text-muted hover:text-fg"}`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {tab === "feed" && (
        <>
          {isMember && <Composer communityId={tribe.id} />}
          <Feed communityId={tribe.id} />
        </>
      )}
      {tab === "chart" && <ChartTab ca={tribe.ca} />}
      {tab === "trade" && <TradeTab ca={tribe.ca} ticker={tribe.ticker} />}
    </Shell>
  );
}

function ChartTab({ ca }: { ca: string }) {
  const { data } = useQuery({
    queryKey: ["token", ca],
    queryFn: () => api<TokenStats>(`/v1/token/${ca}/stats`, { auth: false }),
  });
  if (!data?.pairAddress) {
    return (
      <p className="px-5 py-10 text-center text-sm text-muted">
        Chart appears once the token has an indexed pair. Early bonding-curve trading lives on{" "}
        <a className="text-ember hover:underline" href={`https://pump.fun/coin/${ca}`} target="_blank" rel="noreferrer">pump.fun</a>.
      </p>
    );
  }
  return (
    <iframe
      title="chart"
      src={`https://dexscreener.com/solana/${data.pairAddress}?embed=1&theme=dark&trades=0&info=0`}
      className="h-[560px] w-full border-0"
    />
  );
}

function TradeTab({ ca, ticker }: { ca: string; ticker: string }) {
  const { authenticated, login } = useMe();
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("0.1");
  const [status, setStatus] = useState<string | null>(null);

  async function trade() {
    if (!authenticated) return login();
    const provider = (window as any).solana;
    if (!provider?.isPhantom && !provider) {
      setStatus("No Solana wallet found — install Phantom.");
      return;
    }
    try {
      setStatus("Connecting wallet…");
      await provider.connect();
      const wallet = provider.publicKey.toString();
      setStatus("Building transaction…");
      const { tx, feeLamports } = await api<{ tx: string; feeLamports: number }>("/v1/trade/build", {
        method: "POST",
        body: {
          ca, side, amount: Number(amount),
          denominatedInSol: side === "buy",
          slippageBps: 500, wallet,
        },
      });
      setStatus("Awaiting signature…");
      const raw = Uint8Array.from(atob(tx), (ch) => ch.charCodeAt(0));
      const { signature } = await provider.signAndSendTransaction({ serialize: () => raw, serializeMessage: () => raw } as any)
        .catch(async () => {
          // Phantom's modern API takes a VersionedTransaction; fall back to request()
          return provider.request({ method: "signAndSendTransaction", params: { message: tx } });
        });
      setStatus(`Sent ✓ ${String(signature).slice(0, 12)}… (platform fee ${(feeLamports / 1e9).toFixed(5)} SOL)`);
    } catch (err: any) {
      setStatus(err?.message ?? "Trade failed");
    }
  }

  return (
    <div className="mx-auto max-w-sm px-5 py-8">
      <div className="rounded-2xl bg-surface p-5">
        <div className="mb-4 grid grid-cols-2 gap-2">
          <button onClick={() => setSide("buy")}
            className={`rounded-xl py-2 text-sm font-semibold ${side === "buy" ? "bg-up/15 text-up" : "bg-raised text-muted"}`}>
            Buy
          </button>
          <button onClick={() => setSide("sell")}
            className={`rounded-xl py-2 text-sm font-semibold ${side === "sell" ? "bg-down/15 text-down" : "bg-raised text-muted"}`}>
            Sell
          </button>
        </div>
        <label className="text-xs text-muted">
          {side === "buy" ? "Amount (SOL)" : `Amount (${ticker})`}
        </label>
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          inputMode="decimal"
          className="mt-1 w-full rounded-xl bg-raised px-4 py-3 font-mono outline-none focus:ring-1 focus:ring-ember"
        />
        <button
          onClick={trade}
          className="mt-4 w-full rounded-xl bg-ember py-3 font-semibold text-ink hover:bg-ember-deep"
        >
          {side === "buy" ? `Buy $${ticker}` : `Sell $${ticker}`}
        </button>
        <p className="mt-3 text-center text-xs text-muted">
          Signed in your wallet. Includes a 1% platform fee.
        </p>
        {status && <p className="mt-2 text-center text-xs text-fg">{status}</p>}
      </div>
    </div>
  );
}

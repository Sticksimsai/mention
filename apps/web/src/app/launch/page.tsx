"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { LAUNCH_PAIRS, MAX_DEV_BUY_BPS } from "@mention/shared";
import { Shell } from "@/components/Shell";
import { useAuth } from "@/components/AuthProvider";
import { api, ApiError } from "@/lib/api";

type Mode = "fair" | "creator" | "holders";
type Pair = typeof LAUNCH_PAIRS[number]["id"];
interface Launch {
  id: string; status: string; signature?: string; error?: string; transaction?: string;
  details: {
    name: string; ticker: string; description: string; creatorWallet: string; imageUrl: string; ca: string;
    estimatedCostLamports?: number; platformFeeShareBps: number; communityId?: string; funding?: string;
    mode?: Mode; quoteAsset?: Pair; devBuyBps?: number; devBuyTokenUnits?: string;
    totalSupplyUnits?: string; maxQuoteUnits?: string; quoteDecimals?: number; quoteSymbol?: string;
  };
}
interface Config { enabled: boolean; platformFeeShareBps: number; tradeFeeBps: number; maxDevBuyBps: number }
const DEFAULT_IMAGE = "/brand/mention-still.webp";
const MODES: { id: Mode; title: string; caption: string }[] = [
  { id: "fair", title: "Fair start", caption: "No developer buy. SOL pair. Creator fees shared with you." },
  { id: "creator", title: "Creator launch", caption: "Optional first buy, up to 2% of supply. SOL pair." },
  { id: "holders", title: "Holder rewards", caption: "Direct protocol creator fees to eligible holders. Any listed pair." },
];
function units(value: string | undefined, decimals = 6) {
  if (!value) return "0";
  const s = value.padStart(decimals + 1, "0");
  return decimals ? `${s.slice(0, -decimals)}.${s.slice(-decimals)}`.replace(/\.?0+$/, "") : s;
}
const inputClass = "mt-2 w-full rounded-xl border hairline bg-surface px-3.5 py-3 text-sm text-fg outline-none focus:border-volt/60";
const primary = "rounded-xl bg-volt px-5 py-3 text-sm font-semibold text-ink transition hover:brightness-110 disabled:opacity-40";

export default function LaunchPage() {
  const auth = useAuth();
  const [f, setF] = useState({ name: "", ticker: "", description: "", website: "", telegram: "", creatorWallet: "" });
  const [image, setImage] = useState<{ id: string; url: string } | null>(null);
  const [mode, setMode] = useState<Mode>("fair");
  const [pairId, setPairId] = useState<Pair>("SOL");
  const [devBuyBps, setDevBuyBps] = useState(0);
  const [op, setOp] = useState<Launch | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);
  const config = useQuery({ queryKey: ["launch-config-v2"], queryFn: () => api<Config>("/v1/launch/config", { auth: false }) });
  const recent = useQuery({ queryKey: ["launches", auth.userId], enabled: auth.authenticated, queryFn: () => api<Launch[]>("/v1/launch/recent") });
  const storageKey = `mentions:launch:${auth.userId}`;

  useEffect(() => {
    let active = true;
    setOp(null); setImage(null); setError("");
    const id = localStorage.getItem(storageKey);
    if (id && auth.authenticated) api<Launch>(`/v1/launch/${id}`).then(r => { if (active) setOp(r); }).catch(() => { if (active) setError("Could not load your previous launch. Check recent launches before starting another."); });
    return () => { active = false; };
  }, [storageKey, auth.authenticated]);
  useEffect(() => {
    if (!op || !["preparing", "submitted", "confirmed"].includes(op.status)) return;
    let active = true;
    const t = setInterval(() => api<Launch>(`/v1/launch/${op.id}`).then(r => { if (active) setOp(r); }).catch(() => { if (active) setError("Confirmation is temporarily unavailable. Recover this launch before starting another."); }), 4000);
    return () => { active = false; clearInterval(t); };
  }, [op?.id, op?.status]);

  async function run(fn: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError("");
    try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : "Launch did not complete"); }
    finally { lock.current = false; setBusy(false); }
  }
  async function saveImage(file: Blob) {
    if (file.size > 2_000_000) throw new Error("Choose an image smaller than 2 MB");
    const data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(file);
    });
    const saved = await api<{ id: string; url: string }>("/v1/launch/images", { method: "POST", body: { data } });
    setImage(saved); return saved;
  }
  async function prepare() {
    if (!auth.walletAddress) throw new Error("Create your Mentions wallet first");
    let selectedImage = image;
    if (!selectedImage) {
      const res = await fetch(DEFAULT_IMAGE);
      if (!res.ok) throw new Error("Default image could not load. Upload your own image or retry.");
      selectedImage = await saveImage(await res.blob());
    }
    const id = crypto.randomUUID();
    const details = { ...f, creatorWallet: f.creatorWallet || auth.walletAddress, imageUrl: selectedImage.url, ca: "Pending preparation", platformFeeShareBps: config.data!.platformFeeShareBps, mode, quoteAsset: pairId, devBuyBps, funding: "creator" };
    localStorage.setItem(storageKey, id);
    setOp({ id, status: "preparing", details });
    try {
      setOp(await api<Launch>("/v1/launch/prepare", { method: "POST", body: { ...f, id, imageId: selectedImage.id, fundingWallet: auth.walletAddress, creatorWallet: details.creatorWallet, website: f.website || null, telegram: f.telegram || null, mode, quoteAsset: pairId, devBuyBps, devBuySol: 0 } }));
      recent.refetch();
    } catch (e) {
      // A definite rejected request can be edited; a transport failure keeps the intent for recovery.
      if (e instanceof ApiError && e.status >= 400 && e.status < 500) { setOp(null); localStorage.removeItem(storageKey); }
      else try { setOp(await api<Launch>(`/v1/launch/${id}`)); } catch { /* retain the same pending ID */ }
      throw e;
    }
  }
  function selectMode(next: Mode) { setMode(next); if (next !== "holders") setPairId("SOL"); if (next === "fair") setDevBuyBps(0); }
  const shown = op?.details;
  const selectedMode = shown?.mode ?? mode;
  const pair = LAUNCH_PAIRS.find(p => p.id === (shown?.quoteAsset ?? pairId))!;
  const platformShare = shown?.platformFeeShareBps ?? config.data?.platformFeeShareBps;
  const creatorShare = platformShare === undefined ? "—" : `${(10000 - platformShare) / 100}%`;
  const field = (key: keyof typeof f, label: string, maxLength?: number) => <label className="block text-xs font-medium text-muted">{label}<input maxLength={maxLength} value={f[key]} onChange={e => setF({ ...f, [key]: e.target.value })} className={inputClass} /></label>;

  return <Shell>
    <header className="border-b hairline px-5 py-5 sm:px-6"><h1 className="font-display text-base">Launchpad</h1><p className="mt-3 text-sm text-muted">One token. One community. Your way to launch.</p></header>
    <div className="space-y-6 p-5 sm:p-6">
      <section aria-label="Live token preview" className="overflow-hidden rounded-2xl border hairline bg-surface">
        <div className="flex items-center gap-4 p-5">
          <img src={shown?.imageUrl || image?.url || DEFAULT_IMAGE} alt="Your token preview" className="h-20 w-20 shrink-0 rounded-xl border hairline bg-ink object-cover sm:h-24 sm:w-24" />
          <div className="min-w-0"><p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">{op ? "Launch review" : "Live preview"}</p><h2 className="break-words text-lg font-semibold">{shown?.name || f.name || "Your token"} <span className="text-muted">· ${(shown?.ticker || f.ticker || "TICKER").toUpperCase()}</span></h2><p className="mt-2 break-words whitespace-pre-wrap text-sm leading-relaxed text-muted">{shown?.description || f.description || "Your description appears here."}</p></div>
        </div>
        <div className="grid grid-cols-3 divide-x divide-white/10 border-t hairline px-2 py-4 text-center"><div><p className="text-[10px] text-muted">Pair asset</p><p className="mt-1 text-sm font-semibold">{pair.symbol}</p></div><div><p className="text-[10px] text-muted">{selectedMode === "holders" ? "Fee destination" : "Your creator share"}</p><p className="mt-1 text-sm font-semibold text-volt">{selectedMode === "holders" ? "Holders" : creatorShare}</p></div><div><p className="text-[10px] text-muted">Developer buy</p><p className="mt-1 text-sm font-semibold">{(shown?.devBuyBps ?? devBuyBps) / 100}% <span className="text-muted">/ 2%</span></p></div></div>
      </section>

      <details open className="rounded-2xl border hairline px-5 py-4">
        <summary className="cursor-pointer text-sm font-semibold">How it works & fees</summary>
        <div className="mt-4 space-y-3 text-xs leading-relaxed text-muted">
          <p><span className="font-semibold text-fg">Create → review → sign.</span> Your wallet pays launch rent, network fees, and any developer buy. No Mentions launch surcharge. Costs appear before you approve.</p>
          {selectedMode === "holders" ? <p><span className="font-semibold text-fg">Holder rewards.</span> The protocol creator-fee portion goes to eligible holders in {pair.symbol}, instead of you or Mentions. This choice is permanent. Pump controls eligibility, distribution timing and costs; rewards are not guaranteed.</p> : <p><span className="font-semibold text-fg">Creator fees: {creatorShare} to you / {platformShare === undefined ? "—" : `${platformShare / 100}%`} to Mentions.</span> This splits collected creator fees, not all trading volume. Your share is allocated after receipt reconciliation and paid after approval; payouts are not instant.</p>}
          <p><span className="font-semibold text-fg">Trading fees.</span> Pump charges its own schedule: tiers for SOL/USDC, a flat schedule for custom pairs. {pair.id === "SOL" ? <>Trading through Mentions adds {config.data ? `${config.data.tradeFeeBps / 100}%` : "the configured platform fee"}, plus provider and network costs. These are separate from the creator-fee split.</> : <>Token-pair trading opens on Pump; in-app pair trading is not available yet. Network costs also apply.</>}</p>
          <p><span className="font-semibold text-fg">2% initial-buy limit.</span> The launch buy cannot exceed 2% of total supply. This is not a lifetime wallet holding limit; later market trades are separate.</p>
          <a href="https://pump.fun/docs/fees" target="_blank" rel="noreferrer" className="inline-block text-volt">Pump’s current fee schedule ↗</a>
        </div>
      </details>

      {config.isError && <p role="alert" className="text-sm">Launch settings could not load. <button onClick={() => config.refetch()} className="text-volt">Retry</button></p>}
      {!op ? <>
        <section><h2 className="mb-3 text-sm font-semibold"><span className="mr-2 text-volt">01</span> Choose your launch</h2><div className="grid gap-2 sm:grid-cols-3">{MODES.map(m => <button type="button" key={m.id} aria-pressed={mode === m.id} onClick={() => selectMode(m.id)} className={`rounded-xl border p-4 text-left transition ${mode === m.id ? "border-volt/50 bg-volt/5" : "hairline bg-surface hover:border-white/30"}`}><span className={`block text-sm font-semibold ${mode === m.id ? "text-volt" : "text-fg"}`}>{m.title}</span><span className="mt-2 block text-xs leading-relaxed text-muted">{m.caption}</span></button>)}</div></section>

        <section><h2 className="text-sm font-semibold"><span className="mr-2 text-volt">02</span> Pick a pair asset</h2><p className="mb-3 mt-2 text-xs text-muted">The asset your token is priced and traded against.</p><div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{LAUNCH_PAIRS.map(p => <button type="button" aria-pressed={pairId === p.id} key={p.id} onClick={() => { setPairId(p.id); if (p.id !== "SOL") setMode("holders"); }} className={`rounded-xl border px-4 py-3 text-left transition ${pairId === p.id ? "border-volt/50 bg-volt/5" : "hairline bg-surface hover:border-white/30"}`}><span className="flex items-center justify-between text-sm font-semibold">{p.symbol}{pairId === p.id && <span className="text-volt" aria-hidden>✓</span>}</span><span className="mt-1 block text-xs text-muted">{p.name}</span></button>)}</div>
          <p className="mt-3 text-xs leading-relaxed text-muted">{pairId !== "SOL" ? "Token pairs use holder rewards in Mentions. SOL creator launches use our separate creator-payout flow." : "SOL supports all three launch styles."}</p>
          {pair.category.startsWith("Tokenized") && <p className="mt-2 text-xs leading-relaxed text-muted">These are issuer-provided tokens, not direct stock ownership. Pairing does not give your new token stock backing. Check issuer eligibility and terms before using them.</p>}
          <details className="mt-2 text-xs text-muted"><summary className="cursor-pointer">Verify {pair.symbol} contract & issuer</summary><p className="mt-2 break-all font-mono text-[10px]">{pair.mint}</p><a href="https://pump.fun/docs/custom-pairs" target="_blank" rel="noreferrer" className="mt-2 inline-block text-volt">Official pair list & issuer terms ↗</a></details>
        </section>

        <section className="space-y-4 border-t hairline pt-5"><h2 className="text-sm font-semibold"><span className="mr-2 text-volt">03</span> Make it yours</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{field("name", "Token name", 32)}{field("ticker", "Ticker", 12)}</div>
          <label className="block text-xs font-medium text-muted">Description<textarea maxLength={2000} value={f.description} onChange={e => setF({ ...f, description: e.target.value })} rows={3} className={inputClass} /></label>
          <div className="rounded-xl border hairline p-4"><label className="block text-sm font-medium">Token image<input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy || !auth.authenticated} onChange={e => { const file = e.target.files?.[0]; if (file) run(async () => { await saveImage(file); }); }} className="mt-3 block w-full text-xs text-muted" /></label><p className="mt-3 text-xs text-muted">The Mentions image is preset. Upload PNG, JPEG or WebP up to 2 MB to replace it.{!auth.authenticated && " Sign in to upload."}</p>{image && <button type="button" onClick={() => setImage(null)} className="mt-2 text-xs text-volt">Use default image</button>}</div>
          <details className="text-sm"><summary className="cursor-pointer text-muted">Links & creator fee recipient</summary><div className="mt-4 space-y-4">{field("website", "Website (optional)")}{field("telegram", "Telegram URL (optional)")}{selectedMode !== "holders" && <>{field("creatorWallet", "Fee recipient (defaults to your Mentions wallet)")}<p className="text-xs text-muted">Locked to this launch. Changing community ownership will not change the recipient.</p></>}</div></details>
        </section>

        <section className="rounded-2xl border hairline p-5"><div className="flex items-center justify-between"><h2 className="text-sm font-semibold">Developer buy</h2><span className="text-sm font-semibold text-volt">{devBuyBps / 100}% of supply</span></div><input aria-label="Developer buy percentage" type="range" min="0" max={MAX_DEV_BUY_BPS} step="25" value={devBuyBps} disabled={mode === "fair"} onChange={e => setDevBuyBps(Number(e.target.value))} className="my-4 w-full accent-[#a8ef00] disabled:opacity-30" /><div className="flex justify-between text-[10px] text-muted"><span>0% · no initial buy</span><span>2% maximum</span></div><p className="mt-3 text-xs leading-relaxed text-muted">{mode === "fair" ? "Fair start keeps the developer buy at zero. Choose Creator launch or Holder rewards to add a buy." : `Optional. Paid from your wallet in ${pair.symbol}. The review shows the token amount and maximum cost, with 1% input-price slippage.`}</p></section>

        {config.data && !config.data.enabled && <p className="rounded-xl border hairline bg-surface p-4 text-xs leading-relaxed text-muted">Draft your launch now. Transaction execution is not open yet; your wallet will only be charged after launch access is enabled and you approve.</p>}
        {!auth.authenticated ? <button onClick={auth.login} className={`${primary} w-full`}>Sign in with X to continue</button> : !auth.walletAddress ? <button disabled={busy} onClick={() => run(auth.createWallet)} className={`${primary} w-full`}>Create your Mentions wallet</button> : <div className="space-y-3"><button disabled={busy || !config.data?.enabled || !f.name.trim() || !f.ticker.trim()} onClick={() => run(prepare)} className={`${primary} w-full`}>{busy ? "Preparing review…" : "Review launch"}</button><button type="button" onClick={() => run(auth.fundWallet)} className="block w-full text-center text-xs text-muted hover:text-fg">Add funds to your wallet</button></div>}
      </> : <section className="space-y-4 rounded-2xl border hairline p-5"><h2 className="text-sm font-semibold">Launch status <span className="ml-2 capitalize text-volt">{op.status.replaceAll("_", " ")}</span></h2><p className="break-all text-xs leading-relaxed text-muted">Mint: {op.details.ca}<br />{op.details.mode === "holders" ? "Fee destination: eligible holders via Pump" : `Fee recipient: ${op.details.creatorWallet}`}</p>
        {op.details.estimatedCostLamports !== undefined && <p className="text-sm">Estimated {op.details.funding === "creator" ? "wallet SOL debit" : "platform cost"}: {(op.details.estimatedCostLamports / 1e9).toFixed(6)} SOL <span className="block mt-1 text-xs text-muted">Includes rent, network costs and a SOL developer buy, if selected. Token-pair buys also spend the pair asset below.</span></p>}
        {op.details.devBuyTokenUnits && <div className="rounded-xl bg-surface p-4 text-sm"><p>Developer buy: {units(op.details.devBuyTokenUnits)} tokens ({(op.details.devBuyBps ?? 0) / 100}%)</p><p className="mt-2 text-muted">Maximum buy cost: {units(op.details.maxQuoteUnits, op.details.quoteDecimals)} {op.details.quoteSymbol}</p></div>}
        {op.signature && <a href={`https://solscan.io/tx/${op.signature}`} target="_blank" rel="noreferrer" className="block text-sm text-volt">View transaction ↗</a>}{op.error && <p className="text-sm text-down">{op.error}</p>}
        {op.status === "prepared" && <button disabled={busy || !config.data?.enabled} onClick={() => run(async () => {
          const signedTransaction = op.details.funding === "creator" ? await auth.signTransaction(op.transaction!) : undefined;
          setOp(await api<Launch>(`/v1/launch/${op.id}/submit`, { method: "POST", body: signedTransaction ? { signedTransaction } : undefined }));
        })} className={`${primary} w-full`}>{busy ? "Waiting for wallet…" : op.details.funding === "creator" ? "Approve & launch in wallet" : "Confirm launch"}</button>}
        {op.status === "complete" && <Link href={`/t/${op.details.communityId}`} className="block text-sm text-volt">Open your community →</Link>}
        <button disabled={busy} onClick={() => run(async () => setOp(await api<Launch>(`/v1/launch/${op.id}`)))} className="text-xs text-volt">Refresh / recover launch</button>{["complete", "failed", "expired"].includes(op.status) && <button onClick={() => { setOp(null); localStorage.removeItem(storageKey); }} className="ml-4 text-xs text-muted">New launch</button>}<p className="text-xs leading-relaxed text-muted">If confirmation is delayed, recover this launch. Retries use the same mint and transaction.</p>
      </section>}
      {auth.authenticated && !!recent.data?.length && <section className="border-t hairline pt-5"><h2 className="mb-3 text-sm font-semibold">Recent launches</h2>{recent.data.map(r => <button key={r.id} onClick={() => { setOp(r); localStorage.setItem(storageKey, r.id); }} className="mb-2 flex w-full justify-between gap-3 rounded-xl bg-surface p-3 text-left text-xs"><span>{r.details.name}</span><span className="text-muted">{r.status}</span></button>)}</section>}
      {error && <p role="alert" className="text-sm text-down">{error}</p>}
    </div>
  </Shell>;
}

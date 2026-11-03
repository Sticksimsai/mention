"use client";
import { communityHref, communitySlugPreview } from "@mention/shared";

import {BannerEditor} from "@/components/BannerEditor";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { LAUNCH_PAIRS, MAX_DEV_BUY_BPS } from "@mention/shared";
import { LaunchModeIcon, PairLogo } from "@/components/LaunchAssets";
import { Shell } from "@/components/Shell";
import { useAuth } from "@/components/AuthProvider";
import { api, ApiError } from "@/lib/api";

type Mode = "fair" | "creator" | "holders" | "battle";
type Pair = typeof LAUNCH_PAIRS[number]["id"];
interface Launch {
  id: string; status: string; signature?: string; error?: string; transaction?: string;
  details: {
    name: string; ticker: string; description: string; creatorWallet: string; imageUrl: string; ca: string;
    estimatedCostLamports?: number; platformFeeShareBps: number; communityId?: string; communitySlug?: string; website?: string; twitterUrl?: string; funding?: string;
    mode?: Mode; quoteAsset?: Pair; devBuyBps?: number; devBuyTokenUnits?: string;
    totalSupplyUnits?: string; maxQuoteUnits?: string; quoteDecimals?: number; quoteSymbol?: string;
  };
}
interface Config { unavailableReasons?: Partial<Record<Mode, string | null>>; communityWebsiteOrigin: string; enabled: boolean; platformFeeShareBps: number; tradeFeeBps: number; maxDevBuyBps: number }
const DEFAULT_IMAGE = "/brand/mention-still.webp";
const MODES: { id: Mode; title: string; caption: string }[] = [
  { id: "fair", title: "Fair start", caption: "No developer buy. SOL pair. Creator fees shared with you." },
  { id: "creator", title: "Creator launch", caption: "Optional first buy, up to 2% of supply. SOL pair." },
  { id: "holders", title: "Holder rewards", caption: "Direct protocol creator fees to eligible holders. Any listed pair." },
  { id: "battle", title: "mentionmarkets", caption: "Plan a community reserve for token matchups. Preview only; launching is not available." },
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
  const [f, setF] = useState({ name: "", ticker: "", description: "", twitterUrl: "", telegram: "", creatorWallet: "" });
  const [image, setImage] = useState<{ id: string; url: string } | null>(null);
  const [banner,setBanner]=useState<{url:string;id?:string}>({url:""});
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
    setOp(null); setImage(null); setBanner({url:""}); setError("");
    const id = localStorage.getItem(storageKey);
    if (id && auth.authenticated) api<Launch>(`/v1/launch/${id}`).then(r => { if (active) setOp(r); }).catch(e => { if (!active) return; if (e instanceof ApiError && e.status === 404) { localStorage.removeItem(storageKey); setOp(null); } else setError("Could not load your previous launch. Check recent launches before starting another."); });
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
      setOp(await api<Launch>("/v1/launch/prepare", { method: "POST", body: { ...f, id, imageId: selectedImage.id, bannerId:banner.id, fundingWallet: auth.walletAddress, creatorWallet: details.creatorWallet, twitterUrl: f.twitterUrl || null, telegram: f.telegram || null, mode, quoteAsset: pairId, devBuyBps, devBuySol: 0 } }));
      recent.refetch();
    } catch (e) {
      // A definite rejected request can be edited; a transport failure keeps the intent for recovery.
      if (e instanceof ApiError && e.status >= 400 && e.status < 500) { setOp(null); localStorage.removeItem(storageKey); }
      else try { setOp(await api<Launch>(`/v1/launch/${id}`)); } catch (recoveryError) { if (e instanceof ApiError && recoveryError instanceof ApiError && recoveryError.status === 404) { setOp(null); localStorage.removeItem(storageKey); } /* Transport failures keep the intent for recovery. */ }
      throw e;
    }
  }
  function selectMode(next: Mode) { setMode(next); if (next !== "holders") setPairId("SOL"); if (next === "fair") setDevBuyBps(0); }
  const unavailable = config.data?.unavailableReasons?.[mode];
  const shown = op?.details;
  const selectedMode = shown?.mode ?? mode;
  const pair = LAUNCH_PAIRS.find(p => p.id === (shown?.quoteAsset ?? pairId))!;
  const platformShare = shown?.platformFeeShareBps ?? config.data?.platformFeeShareBps;
  const creatorShare = platformShare === undefined ? "—" : `${(10000 - platformShare) / 100}%`;
  const field = (key: keyof typeof f, label: string, maxLength?: number) => <label className="block text-xs font-medium text-muted">{label}<input maxLength={maxLength} value={f[key]} onChange={e => setF({ ...f, [key]: e.target.value })} className={inputClass} /></label>;

  return <Shell wide>
    <header className="launch-header"><div><p className="launch-eyebrow">CREATE YOUR COMMUNITY</p><h1 className="font-display text-lg">launchpad</h1><p>A home for your token. A launch that fits your community.</p></div><span className="launch-network"><span /> Solana</span></header>
    <div className="launch-content space-y-6">
      <section aria-label="Live token preview" className="launch-preview overflow-hidden rounded-2xl border hairline bg-surface">
        <div className="flex items-center gap-4 p-5">
          <img src={shown?.imageUrl || image?.url || DEFAULT_IMAGE} alt="Your token preview" className="h-20 w-20 shrink-0 rounded-xl border hairline bg-ink object-cover sm:h-24 sm:w-24" />
          <div className="min-w-0"><p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">{op ? "Launch review" : "Live preview"}</p><h2 className="break-words text-lg font-semibold">{shown?.name || f.name || "Your token"} <span className="text-muted">· ${(shown?.ticker || f.ticker || "TICKER").toUpperCase()}</span></h2><p className="mt-2 break-words whitespace-pre-wrap text-sm leading-relaxed text-muted">{shown?.description || f.description || "Give your community a name and a story. Your preview updates as you go."}</p></div>
        </div>
        <div className="grid grid-cols-3 divide-x divide-white/10 border-t hairline px-2 py-4 text-center"><div><p className="text-[10px] text-muted">Pair asset</p><p className="mt-1 flex items-center justify-center gap-2 text-sm font-semibold"><PairLogo symbol={pair.symbol} small />{pair.symbol}</p></div><div><p className="text-[10px] text-muted">{selectedMode === "holders" ? "Fee destination" : "Your creator share"}</p><p className="mt-1 text-sm font-semibold text-volt">{selectedMode === "holders" ? "Holders" : creatorShare}</p></div><div><p className="text-[10px] text-muted">Developer buy</p><p className="mt-1 text-sm font-semibold">{(shown?.devBuyBps ?? devBuyBps) / 100}% <span className="text-muted">/ 2%</span></p></div></div>
      </section>

      <details className="launch-fees rounded-2xl border hairline px-5 py-4">
        <summary className="ui-heading cursor-pointer">How it works & fees <span className="ml-2 text-xs font-normal text-muted">Review before launching</span></summary>
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
        <section className="launch-step"><div className="launch-step-heading"><span>01</span><div><h2>Choose your launch</h2><p>Decide who benefits and how your token starts.</p></div></div><div className="launch-mode-grid">{MODES.map(m => <button type="button" key={m.id} aria-pressed={mode === m.id} onClick={() => selectMode(m.id)} className={`launch-mode-card ${mode === m.id ? "is-selected" : ""}`}><span className="launch-mode-top"><span className="launch-mode-icon" aria-hidden="true"><LaunchModeIcon mode={m.id}/></span><span className="launch-mode-tag">{m.id === "fair" ? "Zero initial buy" : m.id === "creator" ? "Up to 2% buy" : m.id === "holders" ? "All pairs" : "Preview"}</span><span className="launch-check" aria-hidden="true">{mode === m.id ? "✓" : ""}</span></span><strong className="ui-heading">{m.title}</strong><span className="launch-mode-description">{m.caption}</span></button>)}</div></section>

        <section className="launch-step"><div className="launch-step-heading"><span>02</span><div><h2>Pick your pair asset</h2><p>What people use to buy and trade your token.</p></div></div>{[{ title: "Crypto & stablecoins", stock: false }, { title: "Tokenized stocks & ETFs", stock: true }].map(group => <div className="launch-pair-group" key={group.title}><h3>{group.title}</h3><div className="launch-pair-grid">{LAUNCH_PAIRS.filter(p => p.category.startsWith("Tokenized") === group.stock).map(p => <button type="button" aria-pressed={pairId === p.id} key={p.id} onClick={() => { setPairId(p.id); if (p.id !== "SOL") setMode("holders"); }} className={`launch-pair-card ${pairId === p.id ? "is-selected" : ""}`}><PairLogo symbol={p.symbol}/><span className="launch-pair-name"><strong>{p.symbol}</strong><span>{p.name}</span></span><span className="launch-check" aria-hidden="true">{pairId === p.id ? "✓" : ""}</span></button>)}</div></div>)}
          <div className="launch-selection-note" role="status"><PairLogo symbol={pair.symbol} small/><span><strong>{pair.symbol} selected</strong> · {pairId === "SOL" ? "Choose any launch style above." : "Holder rewards selected automatically for this pair."}</span></div>
          <p className="mt-3 text-xs leading-relaxed text-muted">{pairId !== "SOL" ? "Choosing Fair start, Creator launch or mentionmarkets switches your pair back to SOL." : "Fair start has no developer buy. Creator launch supports an optional initial buy."}</p>
          {pair.category.startsWith("Tokenized") && <p className="mt-2 text-xs leading-relaxed text-muted">These are issuer-provided tokens, not direct stock ownership. Pairing does not give your new token stock backing. Check issuer eligibility and terms before using them.</p>}
          <details className="mt-2 text-xs text-muted"><summary className="cursor-pointer">Verify {pair.symbol} contract & issuer</summary><p className="mt-2 break-all font-mono text-[10px]">{pair.mint}</p><a href="https://pump.fun/docs/custom-pairs" target="_blank" rel="noreferrer" className="mt-2 inline-block text-volt">Official pair list & issuer terms ↗</a></details>
        </section>

        <section className="launch-step space-y-4"><div className="launch-step-heading"><span>03</span><div><h2>Make it yours</h2><p>A name, an image and a reason to join.</p></div></div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{field("name", "Token name", 32)}{field("ticker", "Ticker", 12)}</div>
          <label className="block text-xs font-medium text-muted">Description<textarea maxLength={2000} value={f.description} onChange={e => setF({ ...f, description: e.target.value })} rows={3} className={inputClass} /></label>
          <BannerEditor value={banner.url} onChange={(url,id)=>setBanner({url,id})} disabled={busy||!auth.authenticated}/>
          <div className="rounded-xl border hairline p-4"><label className="block text-sm font-medium">Token image<input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy || !auth.authenticated} onChange={e => { const file = e.target.files?.[0]; if (file) run(async () => { await saveImage(file); }); }} className="mt-3 block w-full text-xs text-muted" /></label><p className="mt-3 text-xs text-muted">The Mentions image is preset. Upload PNG, JPEG or WebP up to 2 MB to replace it.{!auth.authenticated && " Sign in to upload."}</p>{image && <button type="button" onClick={() => setImage(null)} className="mt-2 text-xs text-volt">Use default image</button>}</div>
          <details className="text-sm"><summary className="cursor-pointer text-muted">Links & creator fee recipient</summary><div className="mt-4 space-y-4">{field("twitterUrl", "X / Twitter profile URL (optional)")}<p className="text-xs text-muted">Leave blank to use your connected X profile.</p><label className="block text-xs font-medium text-muted">Website · locked to your community<input readOnly aria-readonly="true" aria-label="Community website (locked)" value={`${(config.data?.communityWebsiteOrigin || "https://getmentions.xyz").replace(/\/$/, "")}/t/${communitySlugPreview(f.name,f.ticker)}`} className={`${inputClass} cursor-default text-muted`} /><span className="mt-2 block text-xs leading-5">Automatically included in your token metadata. The final unique address is confirmed at review and opens your community after launch.</span></label>{field("telegram", "Telegram URL (optional)")}{selectedMode !== "holders" && <>{field("creatorWallet", "Fee recipient (defaults to your Mentions wallet)")}<p className="text-xs text-muted">Locked to this launch. Changing community ownership will not change the recipient.</p></>}</div></details>
        </section>

        <section className="launch-step"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-sm font-semibold">Developer buy</h2><span className="text-sm font-semibold text-volt">{devBuyBps / 100}% of supply</span></div><input aria-label="Developer buy percentage" type="range" min="0" max={MAX_DEV_BUY_BPS} step="25" value={devBuyBps} disabled={mode === "fair"} onChange={e => setDevBuyBps(Number(e.target.value))} className="my-4 w-full accent-[#a8ef00] disabled:opacity-30" /><div className="flex justify-between text-[10px] text-muted"><span>0% · no initial buy</span><span>2% maximum</span></div><p className="mt-3 text-xs leading-relaxed text-muted">{mode === "fair" ? "Fair start keeps the developer buy at zero. Choose Creator launch or Holder rewards to add a buy." : `Optional. Paid from your wallet in ${pair.symbol}. The review shows the token amount and maximum cost, with 1% input-price slippage.`}</p></section>

        {mode === "battle" && <div className="rounded-xl border border-volt/25 bg-volt/5 p-4 text-sm leading-6"><p className="ui-heading text-volt">mentionmarkets preview</p><p className="text-muted">Planned split: 50% of purchased developer tokens to the community wager reserve, 50% to the developer. For a 20,000,000-token purchase, that is 10,000,000 tokens each. At the maximum 2% buy, the reserve and developer each receive 1% of total supply. This mode remains unavailable while reserve integration is tested on devnet.</p><Link href="/mentionmarkets" className="mt-2 inline-block text-volt">Explore community matchups →</Link></div>}
        {unavailable && mode !== "battle" && <p role="alert" className="rounded-xl border hairline bg-surface p-4 text-sm text-muted">{unavailable}</p>}
        {config.data && !config.data.enabled && <p className="rounded-xl border hairline bg-surface p-4 text-xs leading-relaxed text-muted">Draft your launch now. Transaction execution is not open yet; your wallet will only be charged after launch access is enabled and you approve.</p>}
        {!auth.authenticated ? <button onClick={auth.login} className={`${primary} w-full`}>Sign in with X to continue</button> : !auth.walletAddress ? <button disabled={busy} onClick={() => run(auth.createWallet)} className={`${primary} w-full`}>Create your Mentions wallet</button> : <div className="space-y-3"><button disabled={busy || !!unavailable || mode === "battle" || !config.data?.enabled || !f.name.trim() || !f.ticker.trim()} onClick={() => run(prepare)} className={`${primary} w-full`}>{busy ? "Preparing review…" : "Review launch"}</button><button type="button" onClick={() => run(auth.fundWallet)} className="block w-full text-center text-xs text-muted hover:text-fg">Add funds to your wallet</button></div>}
      </> : <section className="space-y-4 rounded-2xl border hairline p-5"><h2 className="text-sm font-semibold">Launch status <span className="ml-2 capitalize text-volt">{op.status.replaceAll("_", " ")}</span></h2><p className="break-all text-xs leading-relaxed text-muted">Mint: {op.details.ca}<br />{op.details.mode === "holders" ? "Fee destination: eligible holders via Pump" : `Fee recipient: ${op.details.creatorWallet}`}</p>
        {op.details.website && <div className="rounded-xl bg-surface p-4 text-xs leading-6"><p className="text-muted">Website · locked</p><p className="break-all text-volt">{op.details.website}</p>{op.details.twitterUrl && <><p className="mt-2 text-muted">X / Twitter</p><p className="break-all">{op.details.twitterUrl}</p></>}</div>}
        {op.details.estimatedCostLamports !== undefined && <p className="text-sm">Estimated {op.details.funding === "creator" ? "wallet SOL debit" : "platform cost"}: {(op.details.estimatedCostLamports / 1e9).toFixed(6)} SOL <span className="block mt-1 text-xs text-muted">Includes rent, network costs and a SOL developer buy, if selected. Token-pair buys also spend the pair asset below.</span></p>}
        {op.details.devBuyTokenUnits && <div className="rounded-xl bg-surface p-4 text-sm"><p>Developer buy: {units(op.details.devBuyTokenUnits)} tokens ({(op.details.devBuyBps ?? 0) / 100}%)</p><p className="mt-2 text-muted">Maximum buy cost: {units(op.details.maxQuoteUnits, op.details.quoteDecimals)} {op.details.quoteSymbol}</p></div>}
        {op.signature && <a href={`https://solscan.io/tx/${op.signature}`} target="_blank" rel="noreferrer" className="block text-sm text-volt">View transaction ↗</a>}{op.error && <p className="text-sm text-down">{op.error}</p>}
        {op.status === "prepared" && <button disabled={busy || !config.data?.enabled} onClick={() => run(async () => {
          const current = await api<Launch>(`/v1/launch/${op.id}`);
          setOp(current);
          if (current.status !== "prepared") throw new Error(current.error || "This review is no longer ready. Check its status before approving.");
          const signedTransaction = current.details.funding === "creator" ? await auth.signTransaction(current.transaction!) : undefined;
          setOp(await api<Launch>(`/v1/launch/${op.id}/submit`, { method: "POST", body: signedTransaction ? { signedTransaction } : undefined }));
        })} className={`${primary} w-full`}>{busy ? "Waiting for wallet…" : op.details.funding === "creator" ? "Approve & launch in wallet" : "Confirm launch"}</button>}
        {op.status === "complete" && op.details.communityId && <Link href={communityHref({ id: op.details.communityId, slug: op.details.communitySlug })} className="block text-sm text-volt">Open your community →</Link>}
        <button disabled={busy} onClick={() => run(async () => setOp(await api<Launch>(`/v1/launch/${op.id}`)))} className="text-xs text-volt">Refresh / recover launch</button>{["complete", "failed", "expired"].includes(op.status) && <button onClick={() => { setOp(null); localStorage.removeItem(storageKey); }} className="ml-4 text-xs text-muted">New launch</button>}<p className="text-xs leading-relaxed text-muted">If confirmation is delayed, recover this launch. Retries use the same mint and transaction.</p>
      </section>}
      {auth.authenticated && !!recent.data?.length && <section className="border-t hairline pt-5"><h2 className="mb-3 text-sm font-semibold">Recent launches</h2>{recent.data.map(r => <button key={r.id} onClick={() => { setOp(r); localStorage.setItem(storageKey, r.id); }} className="mb-2 flex w-full justify-between gap-3 rounded-xl bg-surface p-3 text-left text-xs"><span>{r.details.name}</span><span className="text-muted">{r.status}</span></button>)}</section>}
      {error && <p role="alert" className="text-sm text-down">{error}</p>}
    </div>
  </Shell>;
}

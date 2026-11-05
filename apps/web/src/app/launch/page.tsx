"use client";
import { communityHref, communitySlugPreview } from "@mention/shared";

import {BannerEditor} from "@/components/BannerEditor";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { LAUNCH_PAIRS } from "@mention/shared";
import { PairLogo } from "@/components/LaunchAssets";
import { Shell } from "@/components/Shell";
import { useAuth } from "@/components/AuthProvider";
import { api, ApiError } from "@/lib/api";

type Mode = "fair" | "creator" | "holders" | "battle";
type Pair = typeof LAUNCH_PAIRS[number]["id"];
interface Launch {
  id: string; status: string; signature?: string; error?: string; transaction?: string;
  details: {
    name: string; ticker: string; description: string; creatorWallet: string; imageUrl: string; ca: string;
    estimatedCostLamports?: number; platformFeeShareBps: number; communityId?: string; communitySlug?: string; fundingWallet?: string; website?: string; twitterUrl?: string; funding?: string;
    mode?: Mode; quoteAsset?: Pair; devBuyBps?: number; devBuyTokenUnits?: string;
    totalSupplyUnits?: string; maxQuoteUnits?: string; quoteDecimals?: number; quoteSymbol?: string;
  };
}
interface Config { unavailableReasons?: Partial<Record<Mode, string | null>>; communityWebsiteOrigin: string; enabled: boolean; platformFeeShareBps: number; tradeFeeBps: number; maxDevBuyBps: number }
const DEFAULT_IMAGE = "/brand/onlycults.webp";
function units(value: string | undefined, decimals = 6) {
  if (!value) return "0";
  const s = value.padStart(decimals + 1, "0");
  return decimals ? `${s.slice(0, -decimals)}.${s.slice(-decimals)}`.replace(/\.?0+$/, "") : s;
}
const inputClass = "mt-2 w-full rounded-xl border hairline bg-surface px-3.5 py-3 text-sm text-fg outline-none focus:border-volt/60";
const primary = "rounded-xl bg-volt px-5 py-3 text-sm font-semibold text-ink transition hover:brightness-110 disabled:opacity-40";

export default function LaunchPage() {
  const auth = useAuth();
  const fundingWallet = auth.launchWalletAddress;
  const [f, setF] = useState({ name: "", ticker: "", description: "", twitterUrl: "", telegram: "", creatorWallet: "" });
  const [image, setImage] = useState<{ id: string; url: string } | null>(null);
  const [banner,setBanner]=useState<{url:string;id?:string}>({url:""});
  const mode = "holders" as const;
  const pairId = "SOL" as const;
  const devBuyBps = 0;
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
    if (!fundingWallet || !auth.walletAddresses.includes(fundingWallet)) throw new Error("Connect a funding wallet first.");
    let selectedImage = image;
    if (!selectedImage) {
      const res = await fetch(DEFAULT_IMAGE);
      if (!res.ok) throw new Error("Default image could not load. Upload your own image or retry.");
      selectedImage = await saveImage(await res.blob());
    }
    const id = crypto.randomUUID();
    const details = { ...f, fundingWallet, creatorWallet: f.creatorWallet || fundingWallet, imageUrl: selectedImage.url, ca: "Pending preparation", platformFeeShareBps: config.data!.platformFeeShareBps, mode, quoteAsset: pairId, devBuyBps, funding: "creator" };
    localStorage.setItem(storageKey, id);
    setOp({ id, status: "preparing", details });
    try {
      setOp(await api<Launch>("/v1/launch/prepare", { method: "POST", body: { ...f, id, imageId: selectedImage.id, bannerId:banner.id, fundingWallet, creatorWallet: details.creatorWallet, twitterUrl: f.twitterUrl || null, telegram: f.telegram || null, mode, quoteAsset: pairId, devBuyBps, devBuySol: 0 } }));
      recent.refetch();
    } catch (e) {
      // A definite rejected request can be edited; a transport failure keeps the intent for recovery.
      if (e instanceof ApiError && e.status >= 400 && e.status < 500) { setOp(null); localStorage.removeItem(storageKey); }
      else try { setOp(await api<Launch>(`/v1/launch/${id}`)); } catch (recoveryError) { if (e instanceof ApiError && recoveryError instanceof ApiError && recoveryError.status === 404) { setOp(null); localStorage.removeItem(storageKey); } /* Transport failures keep the intent for recovery. */ }
      throw e;
    }
  }

  const unavailable = config.data?.unavailableReasons?.[mode];
  const shown = op?.details;
  const selectedMode = shown?.mode ?? mode;
  const pair = LAUNCH_PAIRS.find(p => p.id === (shown?.quoteAsset ?? pairId))!;
  const platformShare = shown?.platformFeeShareBps ?? config.data?.platformFeeShareBps;
  const creatorShare = platformShare === undefined ? "—" : `${(10000 - platformShare) / 100}%`;
  const field = (key: keyof typeof f, label: string, maxLength?: number) => <label className="block text-xs font-medium text-muted">{label}<input maxLength={maxLength} value={f[key]} onChange={e => setF({ ...f, [key]: key === "ticker" ? e.target.value.replace(/^\$/, "").toUpperCase().replace(/[^A-Z0-9]/g, "") : e.target.value })} className={inputClass} /></label>;

  return <Shell wide>
    <header className="launch-header">
      <div><h1 className="font-display text-lg">Create a token</h1><p>Launch on Pump.fun with a SOL pair and holder rewards.</p></div>
      <span className="launch-network">Solana</span>
    </header>
    <div className="launch-content space-y-6">
      <section aria-label="Live token preview" className="launch-preview overflow-hidden rounded-2xl border hairline bg-surface">
        <div className="flex items-center gap-4 p-5">
          <img src={shown?.imageUrl || image?.url || DEFAULT_IMAGE} alt="Your token preview" className="h-20 w-20 shrink-0 rounded-xl border hairline bg-ink object-cover sm:h-24 sm:w-24" />
          <div className="min-w-0"><p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">{op ? "Launch review" : "Live preview"}</p><h2 className="break-words text-lg font-semibold">{shown?.name || f.name || "Your token"} <span className="text-muted">· ${(shown?.ticker || f.ticker || "TICKER").toUpperCase()}</span></h2><p className="mt-2 break-words whitespace-pre-wrap text-sm leading-relaxed text-muted">{shown?.description || f.description || "Your description appears here."}</p></div>
        </div>
        <div className="grid grid-cols-3 divide-x divide-white/10 border-t hairline px-2 py-4 text-center"><div><p className="text-[10px] text-muted">Pair asset</p><p className="mt-1 flex items-center justify-center gap-2 text-sm font-semibold"><PairLogo symbol={pair.symbol} small />{pair.symbol}</p></div><div><p className="text-[10px] text-muted">{selectedMode === "holders" ? "Fee destination" : "Your creator share"}</p><p className="mt-1 text-sm font-semibold text-volt">{selectedMode === "holders" ? "Holders" : creatorShare}</p></div><div><p className="text-[10px] text-muted">Initial buy</p><p className="mt-1 text-sm font-semibold">{(shown?.devBuyBps ?? devBuyBps) / 100}% </p></div></div>
      </section>

      <details className="launch-fees rounded-2xl border hairline px-5 py-4">
        <summary className="ui-heading cursor-pointer">Fees & launch costs</summary>
        <div className="mt-4 space-y-3 text-xs leading-relaxed text-muted">
          <p><span className="font-semibold text-fg">Create → review → sign.</span> Your wallet pays launch rent, network fees, and any developer buy. No onlycults launch surcharge. Costs appear before you approve.</p>
          {selectedMode === "holders" ? <p><span className="font-semibold text-fg">Holder rewards.</span> The protocol creator-fee portion goes to eligible holders in {pair.symbol}, instead of you or onlycults. This choice is permanent. Pump controls eligibility, distribution timing and costs; rewards are not guaranteed.</p> : <p><span className="font-semibold text-fg">Creator fees: {creatorShare} to you / {platformShare === undefined ? "—" : `${platformShare / 100}%`} to onlycults.</span> This splits collected creator fees, not all trading volume. Your share is allocated after receipt reconciliation and paid after approval; payouts are not instant.</p>}
          <p><span className="font-semibold text-fg">Trading fees.</span> Pump charges its own schedule: tiers for SOL/USDC, a flat schedule for custom pairs. {pair.id === "SOL" ? <>Trading through onlycults adds {config.data ? `${config.data.tradeFeeBps / 100}%` : "the configured platform fee"}, plus provider and network costs. These are separate from the creator-fee split.</> : <>Token-pair trading opens on Pump; in-app pair trading is not available yet. Network costs also apply.</>}</p>
          <a href="https://pump.fun/docs/fees" target="_blank" rel="noreferrer" className="inline-block text-volt">Pump’s current fee schedule ↗</a>
        </div>
      </details>

      {config.isError && <p role="alert" className="text-sm">Launch settings could not load. <button onClick={() => config.refetch()} className="text-volt">Retry</button></p>}
      {!op ? <>
        <section className="launch-step space-y-4">
          <h2 className="ui-heading">Token details</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{field("name", "Token name", 32)}{field("ticker", "Ticker", 12)}</div>
          <label className="block text-xs font-medium text-muted">Description<textarea maxLength={2000} value={f.description} onChange={e => setF({ ...f, description: e.target.value })} rows={3} className={inputClass} /></label>

          <div className="rounded-xl border hairline p-4"><label className="block text-sm font-medium">Token image<input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy || !auth.authenticated} onChange={e => { const file = e.target.files?.[0]; if (file) run(async () => { await saveImage(file); }); }} className="mt-3 block w-full text-xs text-muted" /></label><p className="mt-3 text-xs text-muted">The onlycults image is preset. Upload PNG, JPEG or WebP up to 2 MB to replace it.{!auth.authenticated && " Sign in to upload."}</p>{image && <button type="button" onClick={() => setImage(null)} className="mt-2 text-xs text-volt">Use default image</button>}</div>
          <details className="text-sm"><summary className="cursor-pointer text-muted">Banner & links</summary><div className="mt-4 space-y-4"><BannerEditor value={banner.url} onChange={(url,id)=>setBanner({url,id})} disabled={busy||!auth.authenticated}/>{field("twitterUrl", "X / Twitter profile URL (optional)")}<p className="text-xs text-muted">Leave blank to use your connected X profile.</p><label className="block text-xs font-medium text-muted">Website · locked to your community<input readOnly aria-readonly="true" aria-label="Community website (locked)" value={`${(config.data?.communityWebsiteOrigin || "https://getmentions.xyz").replace(/\/$/, "")}/t/${communitySlugPreview(f.name,f.ticker)}`} className={`${inputClass} cursor-default text-muted`} /><span className="mt-2 block text-xs leading-5">Automatically included in your token metadata. The final unique address is confirmed at review and opens your community after launch.</span></label>{field("telegram", "Telegram URL (optional)")}{selectedMode !== "holders" && <>{field("creatorWallet", "Fee recipient (defaults to the funding wallet)")}<p className="text-xs text-muted">Locked to this launch. Changing community ownership will not change the recipient.</p></>}</div></details>
        </section>

        {unavailable && <p role="alert" className="rounded-xl border hairline bg-surface p-4 text-sm text-muted">{unavailable}</p>}
        {config.data && !config.data.enabled && <p className="rounded-xl border hairline bg-surface p-4 text-xs leading-relaxed text-muted">Draft your launch now. Transaction execution is not open yet; your wallet will only be charged after launch access is enabled and you approve.</p>}
        {auth.authenticated && <section className="launch-step space-y-3">
          <label className="block text-sm font-semibold">Funding wallet
            <select className={inputClass} value={fundingWallet ?? ""} onChange={e => auth.selectLaunchWallet(e.target.value)} disabled={busy || !auth.walletAddresses.length}>
              {!auth.walletAddresses.includes(fundingWallet ?? "") && <option value={fundingWallet ?? ""}>Connect a wallet</option>}
              {auth.walletAddresses.map(address => <option key={address} value={address}>{address === auth.walletAddress ? "onlycults wallet" : "Connected wallet"} · {address.slice(0,6)}…{address.slice(-6)}</option>)}
            </select>
          </label>
          <button type="button" disabled={busy} onClick={auth.connectLaunchWallet} className="rounded-lg border hairline px-3 py-2 text-sm">Connect a Solana wallet</button>
        </section>}
        {!auth.authenticated ? <button onClick={auth.login} className={`${primary} w-full`}>Sign in with X to continue</button> : !fundingWallet ? <button disabled={busy} onClick={() => run(auth.createWallet)} className={`${primary} w-full`}>Create your onlycults wallet</button> : <div className="space-y-3"><button disabled={busy || !auth.walletAddresses.includes(fundingWallet) || !!unavailable || !config.data?.enabled || f.name.trim().length < 2 || !/^[a-z0-9]{1,12}$/i.test(f.ticker.trim())} onClick={() => run(prepare)} className={`${primary} w-full`}>{busy ? "Preparing review…" : "Review launch"}</button>{fundingWallet === auth.walletAddress && <button type="button" onClick={() => run(auth.fundWallet)} className="block w-full text-center text-xs text-muted hover:text-fg">Add funds to your wallet</button>}</div>}
      </> : <section className="space-y-4 rounded-2xl border hairline p-5"><h2 className="text-sm font-semibold">Launch status <span className="ml-2 capitalize text-volt">{op.status.replaceAll("_", " ")}</span></h2><p className="break-all text-xs leading-relaxed text-muted">Mint: {op.details.ca}<br />{op.details.mode === "holders" ? "Fee destination: eligible holders via Pump" : `Fee recipient: ${op.details.creatorWallet}`}</p>
        {op.details.website && <div className="rounded-xl bg-surface p-4 text-xs leading-6"><p className="text-muted">Website · locked</p><p className="break-all text-volt">{op.details.website}</p>{op.details.twitterUrl && <><p className="mt-2 text-muted">X / Twitter</p><p className="break-all">{op.details.twitterUrl}</p></>}</div>}
        {op.details.estimatedCostLamports !== undefined && <p className="text-sm">Estimated {op.details.funding === "creator" ? "wallet SOL debit" : "platform cost"}: {(op.details.estimatedCostLamports / 1e9).toFixed(6)} SOL <span className="block mt-1 text-xs text-muted">Includes rent, network costs and a SOL developer buy, if selected. Token-pair buys also spend the pair asset below.</span></p>}
        {op.details.devBuyTokenUnits && <div className="rounded-xl bg-surface p-4 text-sm"><p>Developer buy: {units(op.details.devBuyTokenUnits)} tokens ({(op.details.devBuyBps ?? 0) / 100}%)</p><p className="mt-2 text-muted">Maximum buy cost: {units(op.details.maxQuoteUnits, op.details.quoteDecimals)} {op.details.quoteSymbol}</p></div>}
        {op.status === "complete" && op.details.ca && <a href={`https://pump.fun/coin/${op.details.ca}`} target="_blank" rel="noreferrer" className="block text-sm underline underline-offset-4">View token on Pump.fun ↗</a>}
        {op.signature && <a href={`https://solscan.io/tx/${op.signature}`} target="_blank" rel="noreferrer" className="block text-sm text-volt">View transaction ↗</a>}{op.error && <p className="text-sm text-down">{op.error}</p>}
        {op.status === "prepared" && op.details.fundingWallet && <div className="text-xs text-muted"><p className="break-all">Funding wallet · {op.details.fundingWallet}</p>
          {!auth.walletAddresses.includes(op.details.fundingWallet) && <button type="button" onClick={auth.connectLaunchWallet} className="mt-2 underline">Reconnect this wallet</button>}</div>}
        {op.status === "prepared" && <button disabled={busy || !config.data?.enabled} onClick={() => run(async () => {
          const current = await api<Launch>(`/v1/launch/${op.id}`);
          setOp(current);
          if (current.status !== "prepared") throw new Error(current.error || "This review is no longer ready. Check its status before approving.");
          const signedTransaction = current.details.funding === "creator" ? await auth.signTransaction(current.transaction!, current.details.fundingWallet ?? auth.walletAddress ?? undefined) : undefined;
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

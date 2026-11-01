"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "./AuthProvider";
import { api, shortCa } from "@/lib/api";
import { Modal } from "./Modal";

interface WalletData {
  balanceSol: number; updatedAt: string; historyAvailable: boolean;
  transactions: Array<{ signature: string; blockTime: number | null; failed: boolean }>;
}
export function WalletCard({ showActivity = false }: { showActivity?: boolean }) {
  const { ready, authenticated, userId, walletAddress, createWallet, fundWallet, exportWallet, getAccessToken } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [depositOpen, setDepositOpen] = useState(false);
  const balance = useQuery({
    queryKey: ["wallet", userId, walletAddress],
    queryFn: async () => {
      const token = await getAccessToken();
      if (!token) throw new Error("Please sign in again to view your wallet.");
      return api<WalletData>(`/v1/users/me/wallet?address=${encodeURIComponent(walletAddress!)}`, { token });
    },
    enabled: ready && authenticated && Boolean(walletAddress), refetchInterval: 30_000, staleTime: 15_000,
  });
  if (!authenticated) return null;
  async function action(fn: () => Promise<void>) {
    setError(""); setBusy(true);
    try { await fn(); if (walletAddress) await balance.refetch(); }
    catch (e) { setError(e instanceof Error ? e.message : "That action did not complete. Please try again."); }
    finally { setBusy(false); }
  }
  async function copy() {
    if (!walletAddress) return;
    try { await navigator.clipboard.writeText(walletAddress); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    catch { setError("Could not copy automatically. Select and copy the address below."); setDepositOpen(true); }
  }
  return <section className="rounded-2xl border hairline bg-surface p-4" aria-label="Your Mention wallet">
    <div className="flex items-center justify-between gap-2"><h2 className="text-sm font-semibold">Mention wallet</h2><span className="rounded border border-volt/20 px-1.5 py-0.5 text-[9px] tracking-wide text-volt">SOLANA</span></div>
    <p className="mt-4 text-xs text-muted">Available SOL balance</p>
    <p className="mt-1 text-3xl font-semibold tracking-tight">{walletAddress ? balance.data && !balance.isError ? balance.data.balanceSol.toLocaleString(undefined, { maximumFractionDigits: 6 }) : "—" : "—"}<span className="ml-2 text-xs font-normal text-muted">SOL</span></p>
    <p className="mt-1 text-[11px] text-muted">Your personal wallet · Mainnet</p>
    {!walletAddress ? <><p className="mt-4 text-xs leading-relaxed text-muted">Set up your in-app Solana wallet to receive funds.</p><button disabled={busy || !ready} onClick={() => action(createWallet)} className="mt-3 w-full rounded-xl bg-volt px-4 py-2.5 text-sm font-semibold text-ink disabled:opacity-50">{busy ? "Setting up…" : "Create wallet"}</button></> : <>
      <div className="mt-4 flex items-center justify-between gap-2 rounded-lg bg-ink px-3 py-2"><button title={walletAddress} onClick={() => setDepositOpen(true)} className="font-mono text-xs text-muted">{shortCa(walletAddress)}</button><button onClick={copy} aria-label="Copy wallet address" className="text-xs text-volt">{copied ? "Copied" : "Copy"}</button></div>
      <div className="mt-3 flex gap-2"><button disabled={busy} onClick={() => action(fundWallet)} className="flex-1 rounded-xl bg-volt px-3 py-2.5 text-xs font-semibold text-ink disabled:opacity-50">{busy ? "Opening…" : "+ Add funds"}</button><button onClick={() => setDepositOpen(true)} className="rounded-xl border hairline px-3 py-2.5 text-xs font-medium hover:bg-raised">Receive</button></div>
      <div className="mt-3 flex justify-between text-[11px] text-muted"><button disabled={balance.isFetching} onClick={() => balance.refetch()}>{balance.isFetching ? "Refreshing…" : "Refresh balance"}</button><button disabled={busy} onClick={() => action(exportWallet)}>Export wallet ↗</button></div>
    </>}
    {balance.isError && <p role="status" className="mt-3 text-xs text-down">Balance unavailable. Use Refresh to try again.</p>}
    {error && <p role="alert" className="mt-3 break-words text-xs text-down">{error}</p>}
    {showActivity && walletAddress && <div className="mt-6 border-t hairline pt-4"><h3 className="text-sm font-semibold">Recent transactions</h3>
      {balance.isPending ? <p className="mt-3 text-xs text-muted">Loading activity…</p> : balance.isError || !balance.data?.historyAvailable ? <p className="mt-3 text-xs text-muted">Transaction history is unavailable right now.</p> : !balance.data.transactions.length ? <p className="mt-3 text-xs text-muted">No transactions yet. Add funds when you are ready.</p> : <ul className="mt-2 divide-y divide-line">{balance.data.transactions.map(tx => <li key={tx.signature}><a href={`https://solscan.io/tx/${tx.signature}`} target="_blank" rel="noreferrer" className="flex items-center justify-between gap-2 py-3 text-xs hover:text-volt"><span className="font-mono">{shortCa(tx.signature)} ↗</span><span className={tx.failed ? "text-down" : "text-muted"}>{tx.failed ? "Failed" : tx.blockTime ? new Date(tx.blockTime * 1000).toLocaleDateString() : "Confirmed"}</span></a></li>)}</ul>}
    </div>}
    <Modal open={depositOpen} onClose={() => setDepositOpen(false)} title="Receive SOL">
      <div className="p-7 pt-14"><h2 className="text-xl font-semibold">Receive funds</h2><p className="mt-2 text-sm text-muted">Send SOL or supported Solana tokens to your Mention wallet on Solana mainnet.</p><p className="my-5 select-all break-all rounded-xl border hairline bg-ink p-4 font-mono text-sm">{walletAddress}</p><button onClick={copy} className="w-full rounded-xl bg-volt px-4 py-3 font-semibold text-ink">{copied ? "Address copied" : "Copy wallet address"}</button><p className="mt-4 text-xs text-muted">Only use the Solana network. Your balance refreshes automatically after funds arrive.</p></div>
    </Modal>
  </section>;
}

"use client";

import { Component, createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import { PrivyProvider, usePrivy, useLoginWithOAuth } from "@privy-io/react-auth";
import { useCreateWallet, useFundWallet, useExportWallet, useConnectedStandardWallets, useStandardSignTransaction } from "@privy-io/react-auth/solana";
import { registerTokenGetter } from "@/lib/api";
import { Modal } from "./Modal";

export interface AuthState {
  ready: boolean; authenticated: boolean; available: boolean;
  userId: string | null;
  walletAddress: string | null;
  login: () => void;
  logout: () => Promise<void>;
  getAccessToken: () => Promise<string | null>;
  createWallet: () => Promise<void>;
  fundWallet: () => Promise<void>;
  exportWallet: () => Promise<void>;
  signTransaction: (transaction: string) => Promise<string>;
}
const unavailable = async () => { throw new Error("Wallet services are unavailable. Please try again shortly."); };
const stub: AuthState = {
  ready: true, authenticated: false, available: false, userId: null, walletAddress: null,
  login: () => {}, logout: async () => {}, getAccessToken: async () => null,
  createWallet: unavailable, fundWallet: unavailable, exportWallet: unavailable, signTransaction: unavailable,
};
const AuthCtx = createContext<AuthState>(stub);
export const useAuth = () => useContext(AuthCtx);

function UnavailableAuth({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return <AuthCtx.Provider value={{ ...stub, login: () => setOpen(true) }}>
    {children}
    <Modal open={open} onClose={() => setOpen(false)} title="Sign-in unavailable">
      <div className="p-8 pt-14"><h2 className="text-xl font-semibold">Sign-in is temporarily unavailable</h2><p className="mt-3 text-sm text-muted">You can still browse Mentions. Please try again shortly.</p></div>
    </Modal>
  </AuthCtx.Provider>;
}

function PrivyBridge({ children }: { children: ReactNode }) {
  const { ready, authenticated, user, logout, getAccessToken } = usePrivy();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const { initOAuth, loading } = useLoginWithOAuth({
    onComplete: () => { setOpen(false); setError(""); },
    onError: () => { setError("X sign-in did not complete. Please try again."); setOpen(true); },
  });
  const { createWallet } = useCreateWallet();
  const { fundWallet } = useFundWallet();
  const { exportWallet } = useExportWallet();
  const { wallets } = useConnectedStandardWallets();
  const { signTransaction } = useStandardSignTransaction();
  const wallet = user?.linkedAccounts.find((a) => a.type === "wallet" && a.chainType === "solana" && a.walletClientType === "privy");
  const walletAddress = wallet?.type === "wallet" ? wallet.address : null;
  const tokenGetter = useCallback(async () => authenticated ? getAccessToken() : null, [authenticated, getAccessToken]);
  useEffect(() => { registerTokenGetter(tokenGetter); return () => registerTokenGetter(async () => null); }, [tokenGetter]);
  useEffect(() => { if (authenticated) setOpen(false); }, [authenticated]);
  async function connect() {
    setError("");
    try { await initOAuth({ provider: "twitter" }); }
    catch { setError("Could not open X sign-in. Please try again."); }
  }
  return <AuthCtx.Provider value={{
    ready, authenticated, available: true, userId: user?.id ?? null, walletAddress,
    login: () => { setError(""); setOpen(true); }, logout, getAccessToken,
    createWallet: async () => { await createWallet(); },
    fundWallet: async () => {
      if (!walletAddress) throw new Error("Create your wallet first.");
      await fundWallet(walletAddress, { cluster: { name: "mainnet-beta" }, uiConfig: { receiveFundsTitle: "Add funds to Mentions", receiveFundsSubtitle: "Receive funds in your Solana wallet." } });
    },
    signTransaction: async (transaction) => {
      const wallet = wallets.find(w => w.address === walletAddress);
      if (!wallet) throw new Error("Your embedded wallet is still connecting. Please retry.");
      const { signedTransaction } = await signTransaction({ transaction: Uint8Array.from(atob(transaction), c => c.charCodeAt(0)), wallet, chain: "solana:mainnet" });
      return btoa(String.fromCharCode(...signedTransaction));
    },
    exportWallet: async () => { if (walletAddress) await exportWallet({ address: walletAddress }); },
  }}>
    {children}
    <Modal open={open} onClose={() => setOpen(false)} title="Sign in to Mentions">
      <div className="px-8 pb-7 pt-10 text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/mention-still.webp" width={80} height={80} alt="" className="mx-auto h-20 w-20" />
        <h2 className="mt-3 text-2xl font-semibold tracking-tight">Your people. Your place.</h2>
        <p className="mb-7 mt-2 text-sm text-muted">Sign in to join the conversation on Mentions.</p>
        <button onClick={connect} disabled={!ready || loading} className="flex min-h-12 w-full items-center justify-center gap-3 rounded-xl bg-fg px-4 py-3 font-semibold text-ink disabled:opacity-50"><span className="text-xl">𝕏</span>{loading ? "Connecting to X…" : "Continue with X"}</button>
        <div className="mt-6 space-y-3 text-left text-sm text-muted">
          <p><span className="mr-2 text-volt">✓</span>Your X photo and username come with you</p>
          <p><span className="mr-2 text-volt">✓</span>Your communities, all in one place</p>
          <p><span className="mr-2 text-volt">✓</span>A personal Solana wallet inside Mentions</p>
        </div>
        <p className="mt-6 text-xs leading-relaxed text-muted">Signing in does not give Mentions permission to post to X. You can enable that separately in Settings.</p>
        {error && <p role="alert" className="mt-4 text-sm text-down">{error}</p>}
      </div>
      <div className="border-t hairline px-6 py-4 text-center text-xs text-muted">Secure sign-in with <span className="font-semibold text-fg">Privy</span></div>
    </Modal>
  </AuthCtx.Provider>;
}

class AuthErrorBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { console.warn("Authentication temporarily unavailable"); }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}
export function AuthProvider({ children }: { children: ReactNode }) {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? "";
  const fallback = <UnavailableAuth>{children}</UnavailableAuth>;
  if (!appId) return fallback;
  return <AuthErrorBoundary fallback={fallback}>
    <PrivyProvider appId={appId} config={{
      loginMethods: ["twitter"],
      appearance: { theme: "#171A15", accentColor: "#9BF000", logo: "/brand/mention-still.webp", landingHeader: "Your people. Your place.", loginMessage: "Your X identity, communities, and wallet. Together on Mentions." },
      embeddedWallets: { solana: { createOnLogin: "all-users" }, ethereum: { createOnLogin: "off" } },
    }}><PrivyBridge>{children}</PrivyBridge></PrivyProvider>
  </AuthErrorBoundary>;
}

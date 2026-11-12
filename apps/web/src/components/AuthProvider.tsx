"use client";

import { Component, createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import { PrivyProvider, usePrivy, useConnectWallet, useLoginWithOAuth } from "@privy-io/react-auth";
import { toSolanaWalletConnectors, useCreateWallet, useFundWallet, useExportWallet, useConnectedStandardWallets, useStandardSignTransaction, useStandardSignMessage } from "@privy-io/react-auth/solana";
import { walletRpcs } from "@/lib/wallet-rpc";
import { api, registerTokenGetter } from "@/lib/api";
import { clearWalletSession, readWalletSession, saveWalletSession, type WalletSession } from "@/lib/wallet-session";
import { Modal } from "./Modal";

const solanaConnectors = toSolanaWalletConnectors();

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
  launchWalletAddress: string | null;
  walletAddresses: string[];
  selectLaunchWallet: (address: string) => void;
  connectLaunchWallet: () => void;
  signTransaction: (transaction: string, signerAddress?: string) => Promise<string>;
  signDevnetTransaction: (transaction: string) => Promise<string>;
  /** Address of the active wallet session, when the visitor signed in with a wallet instead of X. */
  walletSessionAddress: string | null;
  /** True when the visitor can launch: signed in with X, or holding a wallet session. */
  canLaunch: boolean;
  /** Stable key for per-account browser state: the X account id or the session wallet. */
  accountKey: string | null;
  /** Proves control of a connected wallet with a free signature and starts a wallet session. */
  walletSignIn: (address: string) => Promise<void>;
  endWalletSession: () => void;
}
const unavailable = async () => { throw new Error("Wallet services are unavailable. Please try again shortly."); };
const stub: AuthState = {
  ready: true, authenticated: false, available: false, userId: null, walletAddress: null,
  launchWalletAddress: null, walletAddresses: [], selectLaunchWallet: () => {}, connectLaunchWallet: () => {},
  login: () => {}, logout: async () => {}, getAccessToken: async () => null,
  createWallet: unavailable, fundWallet: unavailable, exportWallet: unavailable, signTransaction: unavailable, signDevnetTransaction: unavailable,
  walletSessionAddress: null, canLaunch: false, accountKey: null, walletSignIn: unavailable, endWalletSession: () => {},
};
const AuthCtx = createContext<AuthState>(stub);
export const useAuth = () => useContext(AuthCtx);

function UnavailableAuth({ children, recover = false }: { children: ReactNode; recover?: boolean }) {
  const [open, setOpen] = useState(false);
  return <AuthCtx.Provider value={{ ...stub, login: () => setOpen(true) }}>
    {children}
    <Modal open={open} onClose={() => setOpen(false)} title="Sign-in unavailable">
      <div className="p-8 pt-14"><h2 className="text-xl font-semibold">Sign-in is temporarily unavailable</h2><p className="mt-3 text-sm text-muted">{recover ? "The wallet connection was interrupted. Reload to reconnect and recover your launch from Recent launches. This does not submit a transaction." : "You can still browse memes. Please try again shortly."}</p>{recover && <button className="mt-4 rounded-xl bg-volt px-4 py-3 text-sm font-semibold text-ink" onClick={() => window.location.reload()}>Reload and reconnect</button>}</div>
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
  const { signMessage } = useStandardSignMessage();
  const [session, setSession] = useState<WalletSession | null>(null);
  useEffect(() => { setSession(readWalletSession()); }, []);
  const wallet = user?.linkedAccounts.find((a) => a.type === "wallet" && a.chainType === "solana" && a.walletClientType === "privy");
  const walletAddress = wallet?.type === "wallet" ? wallet.address : null;
  // Keyed by account so a selection never leaks across sign-ins; "wallet" covers wallet-only visitors.
  const [launchSelection, setLaunchSelection] = useState<{userId:string;address:string} | null>(null);
  const selectionOwner = user?.id ?? "wallet";
  const selectLaunchWallet = (address:string) => setLaunchSelection({ userId:selectionOwner, address });
  const { connectWallet } = useConnectWallet({ onSuccess: ({wallet}) => selectLaunchWallet(wallet.address) });
  const walletAddresses = [...new Set([...(walletAddress ? [walletAddress] : []), ...wallets.map(w => w.address)])];
  const walletSessionAddress = !authenticated && session ? session.address : null;
  const launchWalletAddress = user
    ? (launchSelection?.userId === user.id ? launchSelection.address : walletAddress)
    // Wallet-only visitors launch from the wallet that signed in, or one they just connected.
    : walletSessionAddress ?? (launchSelection?.userId === "wallet" ? launchSelection.address : wallets[0]?.address ?? null);
  // X sign-in wins; otherwise fall back to the wallet session so launch calls stay authorised.
  const tokenGetter = useCallback(async () => {
    if (authenticated) return getAccessToken();
    const current = readWalletSession();
    return current ? current.token : null;
  }, [authenticated, getAccessToken]);
  const walletSignIn = useCallback(async (address: string) => {
    const wallet = wallets.find(w => w.address === address);
    if (!wallet) throw new Error("Connect your wallet first, then verify it.");
    const challenge = await api<{ address: string; message: string }>("/v1/wallet-auth/challenge", { method: "POST", body: { address }, auth: false });
    const { signature } = await signMessage({ message: new TextEncoder().encode(challenge.message), wallet });
    const verified = await api<WalletSession>("/v1/wallet-auth/verify", { method: "POST", body: { address: challenge.address, signature: btoa(String.fromCharCode(...signature)) }, auth: false });
    saveWalletSession(verified);
    setSession(verified);
  }, [wallets, signMessage]);
  const endWalletSession = useCallback(() => { clearWalletSession(); setSession(null); }, []);
  // After an X sign-in, communities launched by this browser's wallet session move to the X account.
  useEffect(() => {
    if (!authenticated) return;
    const current = readWalletSession();
    if (!current) return;
    let active = true;
    getAccessToken().then(token => token ? api<{ claimed: number }>("/v1/wallet-auth/claim", { method: "POST", body: { walletToken: current.token }, token }) : null)
      .then(result => { if (active && result) endWalletSession(); })
      .catch(() => { /* Retried on the next sign-in; the wallet session stays until it expires. */ });
    return () => { active = false; };
  }, [authenticated, getAccessToken, endWalletSession]);
  useEffect(() => { registerTokenGetter(tokenGetter); return () => registerTokenGetter(async () => null); }, [tokenGetter]);
  useEffect(() => { if (authenticated) setOpen(false); }, [authenticated]);
  async function connect() {
    setError("");
    try { await initOAuth({ provider: "twitter" }); }
    catch { setError("Could not open X sign-in. Please try again."); }
  }
  return <AuthCtx.Provider value={{
    ready, authenticated, available: true, userId: user?.id ?? null, walletAddress,
    launchWalletAddress, walletAddresses, selectLaunchWallet,
    connectLaunchWallet: () => connectWallet({walletChainType:"solana-only",description:"Connect your Solana wallet to fund and sign the launch."}),
    walletSessionAddress, canLaunch: authenticated || Boolean(walletSessionAddress),
    accountKey: user?.id ?? (walletSessionAddress ? `wallet:${walletSessionAddress}` : null),
    walletSignIn, endWalletSession,
    login: () => { setError(""); setOpen(true); }, logout: async () => { endWalletSession(); await logout(); }, getAccessToken,
    createWallet: async () => { await createWallet(); },
    fundWallet: async () => {
      if (!walletAddress) throw new Error("Create your wallet first.");
      await fundWallet(walletAddress, { cluster: { name: "mainnet-beta" }, uiConfig: { receiveFundsTitle: "Add funds to memes", receiveFundsSubtitle: "Receive funds in your Solana wallet." } });
    },
    signTransaction: async (transaction, signerAddress = walletAddress ?? undefined) => {
      const wallet = wallets.find(w => w.address === signerAddress);
      if (!wallet) throw new Error("Connect the wallet used to prepare this transaction, then retry.");
      const { signedTransaction } = await signTransaction({ transaction: Uint8Array.from(atob(transaction), c => c.charCodeAt(0)), wallet, chain: "solana:mainnet" });
      return btoa(String.fromCharCode(...signedTransaction));
    },
    signDevnetTransaction: async (transaction) => {
      const wallet = wallets.find(w => w.address === walletAddress);
      if (!wallet) throw new Error("Your embedded wallet is still connecting. Please retry.");
      const { signedTransaction } = await signTransaction({ transaction: Uint8Array.from(atob(transaction), c => c.charCodeAt(0)), wallet, chain: "solana:devnet" });
      return btoa(String.fromCharCode(...signedTransaction));
    },
    exportWallet: async () => { if (walletAddress) await exportWallet({ address: walletAddress }); },
  }}>
    {children}
    <Modal open={open} onClose={() => setOpen(false)} title="Sign in to memes">
      <div className="px-8 pb-7 pt-10 text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/memes.webp" width={80} height={80} alt="" className="mx-auto h-20 w-20" />
        <h2 className="mt-3 text-2xl font-semibold tracking-tight">Your people. Your place.</h2>
        <p className="mb-7 mt-2 text-sm text-muted">Sign in to join the conversation on memes.</p>
        <button onClick={connect} disabled={!ready || loading} className="flex min-h-12 w-full items-center justify-center gap-3 rounded-xl bg-fg px-4 py-3 font-semibold text-ink disabled:opacity-50"><span className="text-xl">𝕏</span>{loading ? "Connecting to X…" : "Continue with X"}</button>
        <div className="mt-6 space-y-3 text-left text-sm text-muted">
          <p><span className="mr-2 text-volt">✓</span>Your X photo and username come with you</p>
          <p><span className="mr-2 text-volt">✓</span>Your communities, all in one place</p>
          <p><span className="mr-2 text-volt">✓</span>A personal Solana wallet inside memes</p>
        </div>
        <p className="mt-6 text-xs leading-relaxed text-muted">Signing in does not give memes permission to post to X. You can enable that separately in Settings.</p>
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
  const fallback = <UnavailableAuth recover>{children}</UnavailableAuth>;
  if (!appId) return <UnavailableAuth>{children}</UnavailableAuth>;
  return <AuthErrorBoundary fallback={fallback}>
    <PrivyProvider appId={appId} config={{
      // Standard-wallet signing renders a transaction review that requires explicit Kit clients.
      // Never put the server's Helius API key in this browser configuration.
      externalWallets: { solana: { connectors: solanaConnectors } },
      solana: { rpcs: walletRpcs },
      loginMethods: ["twitter"],
      appearance: { theme: "#17150F", accentColor: "#F2B416", logo: "/brand/memes.webp", landingHeader: "Your people. Your place.", loginMessage: "Your X identity, communities, and wallet. Together on memes." },
      embeddedWallets: { solana: { createOnLogin: "all-users" }, ethereum: { createOnLogin: "off" } },
    }}><PrivyBridge>{children}</PrivyBridge></PrivyProvider>
  </AuthErrorBoundary>;
}

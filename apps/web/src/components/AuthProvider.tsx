"use client";

// Auth wrapper with graceful degradation: if Privy can't initialize (bad or
// missing app id, Privy outage), the site stays browsable read-only instead
// of white-screening. Components consume useAuth(), never usePrivy directly.
import { Component, createContext, useContext, type ReactNode } from "react";
import { PrivyProvider, usePrivy } from "@privy-io/react-auth";

export interface AuthState {
  ready: boolean;
  authenticated: boolean;
  available: boolean; // false = auth misconfigured/unreachable
  login: () => void;
  logout: () => Promise<void>;
  getAccessToken: () => Promise<string | null>;
}

const stub: AuthState = {
  ready: true,
  authenticated: false,
  available: false,
  login: () => alert("Sign-in is unavailable right now."),
  logout: async () => {},
  getAccessToken: async () => null,
};

const AuthCtx = createContext<AuthState>(stub);
export const useAuth = () => useContext(AuthCtx);

function PrivyBridge({ children }: { children: ReactNode }) {
  const { ready, authenticated, login, logout, getAccessToken } = usePrivy();
  return (
    <AuthCtx.Provider value={{ ready, authenticated, available: true, login, logout, getAccessToken }}>
      {children}
    </AuthCtx.Provider>
  );
}

class AuthErrorBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(err: unknown) { console.warn("auth unavailable:", err); }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? "";
  const fallback = <AuthCtx.Provider value={stub}>{children}</AuthCtx.Provider>;
  if (!appId) return fallback;

  return (
    <AuthErrorBoundary fallback={fallback}>
      <PrivyProvider
        appId={appId}
        config={{
          loginMethods: ["twitter"],
          appearance: { theme: "dark", accentColor: "#FFA03C" },
        }}
      >
        <PrivyBridge>{children}</PrivyBridge>
      </PrivyProvider>
    </AuthErrorBoundary>
  );
}

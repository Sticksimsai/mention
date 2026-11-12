// Browser storage for the wallet session used to launch without an X sign-in.
// The token only unlocks launch endpoints and expires after twelve hours.
export interface WalletSession { address: string; token: string; expiresAt: number }

const KEY = "memes:wallet-session";
// Mirrors storage so the session still works for this page when storage is blocked.
let memory: WalletSession | null = null;
const live = (session: WalletSession | null) =>
  // Treat a session in its final minute as expired so a request never starts with a dying token.
  session?.token && session.address && session.expiresAt - Date.now() >= 60_000 ? session : null;

export function readWalletSession(): WalletSession | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const session = live(JSON.parse(raw) as WalletSession);
      if (!session) localStorage.removeItem(KEY);
      return session;
    }
  } catch { /* fall through to the in-memory copy */ }
  memory = live(memory);
  return memory;
}

export function saveWalletSession(session: WalletSession) {
  memory = session;
  try { localStorage.setItem(KEY, JSON.stringify(session)); } catch { /* storage unavailable: session lasts for this page only */ }
}

export function clearWalletSession() {
  memory = null;
  try { localStorage.removeItem(KEY); } catch { /* nothing to clear */ }
}

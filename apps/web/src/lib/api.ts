// Typed fetch wrapper for the Tribes API. Attaches the Privy access token
// when available; throws ApiError with the server's message on failure.
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

type GetToken = () => Promise<string | null>;
let getToken: GetToken = async () => null;
export function registerTokenGetter(fn: GetToken) { getToken = fn; }

export async function api<T>(
  path: string,
  opts: { method?: string; body?: unknown; auth?: boolean; token?: string | null } = {},
): Promise<T> {
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  if (opts.auth !== false) {
    const token = opts.token !== undefined ? opts.token : await getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  const res = await fetch(`${API_URL}${path}`, {
    method: opts.method ?? "GET",
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const data = (await res.json()) as any;
      msg = data.error ?? data.message ?? msg;
    } catch {}
    throw new ApiError(res.status, msg);
  }
  return res.json() as Promise<T>;
}

export function fmtUsd(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}

export function shortCa(ca: string): string {
  return ca.length > 12 ? `${ca.slice(0, 5)}…${ca.slice(-4)}` : ca;
}

"use client";

import { useState } from "react";
import { RocketIcon, ShieldIcon, UserIcon } from "./icons";

/** Issuer/token-list artwork; sources are recorded alongside the local assets. */
export function PairLogo({ symbol, small = false }: { symbol: string; small?: boolean }) {
  const [failed, setFailed] = useState<string | null>(null);
  return <span className={`launch-pair-logo ${small ? "is-small" : ""}`} aria-hidden="true">
    {failed !== symbol ? <img key={symbol} src={`/brand/pairs/${symbol}.${symbol === "SPCX" ? "svg" : "png"}`} alt="" width={40} height={40} onError={() => setFailed(symbol)} /> : <span>{symbol.slice(0, 2)}</span>}
  </span>;
}

export function LaunchModeIcon({ mode }: { mode: string }) {
  if (mode === "creator") return <RocketIcon />;
  if (mode === "battle") return <ShieldIcon />;
  if (mode === "holders") return <UserIcon />;
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v18M3 12h18M5.5 5.5l13 13M18.5 5.5l-13 13"/></svg>;
}

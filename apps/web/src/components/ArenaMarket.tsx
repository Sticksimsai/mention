"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatTokenUnits, type BattleView } from "@mention/shared";

export interface ArenaCoin { ticker: string; name: string; pfpUrl?: string | null }
export interface ArenaMarket {
  id: string; coins: [ArenaCoin, ArenaCoin]; duration: number; status: string;
  stakes?: [string,string]; 
}
export const roundLabel=(n:number)=>n===3600?"1 hour":`${n/60} min`;
export function marketFromBattle(b:BattleView):ArenaMarket {
  return {id:b.id,coins:[b.challenger,b.opponent],duration:b.durationSecs,status:({open:"Open challenge",accepted:"Awaiting escrow",cancelled:"Cancelled",expired:"Expired"})[b.status],stakes:[formatTokenUnits(b.challengerStakeUnits),formatTokenUnits(b.opponentStakeUnits)]};
}
export function CoinAvatar({coin,side=0}:{coin:ArenaCoin;side?:number}) {
 return <span className={`arena-avatar arena-avatar-${side}`}>{coin.pfpUrl?<img src={coin.pfpUrl} alt=""/>:<span>{coin.ticker.slice(0,2)}</span>}</span>;
}
export function Bookmark({saved,onClick}:{saved:boolean;onClick:()=>void}){
 return <button type="button" aria-label={saved?"Remove from watchlist":"Save to watchlist"} aria-pressed={saved} onClick={onClick} className={`arena-bookmark ${saved?"is-saved":""}`}><svg viewBox="0 0 24 24" fill={saved?"currentColor":"none"} stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M6 20V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v15l-6-4z"/></svg></button>;
}
export function useArenaWatchlist(){
 const [saved,setSaved]=useState<string[]>([]);
 const read=()=>{try{const v=JSON.parse(localStorage.getItem("mentions-arena-watchlist")??"[]");return Array.isArray(v)?v.filter((x:unknown):x is string=>typeof x==="string"):[];}catch{return [];}};
 useEffect(()=>{const sync=()=>setSaved(read());sync();window.addEventListener("storage",sync);window.addEventListener("mentions-arena-watchlist",sync);return()=>{window.removeEventListener("storage",sync);window.removeEventListener("mentions-arena-watchlist",sync);};},[]);
 const toggle=(id:string)=>{const old=read();const next=old.includes(id)?old.filter(x=>x!==id):[...old,id];setSaved(next);try{localStorage.setItem("mentions-arena-watchlist",JSON.stringify(next));window.dispatchEvent(new Event("mentions-arena-watchlist"));}catch{}};
 return {saved,toggle};
}
export function MarketCard({market:m,saved,onSave}:{market:ArenaMarket;saved:boolean;onSave:()=>void}) {
 const title=`Which coin leads after ${roundLabel(m.duration)}?`;
 const head=<><span className="arena-pair"><CoinAvatar coin={m.coins[0]}/><CoinAvatar coin={m.coins[1]} side={1}/></span><span>{title}</span></>;
 return <article className="arena-market-card">
  <Link href={`/mentionmarkets/${m.id}`} className="arena-card-title ui-heading">{head}</Link>
  <div className="arena-card-rows">{m.coins.map((c,i)=><div className="arena-coin-row" key={c.ticker}><span className="arena-ticker">${c.ticker}</span><strong>—</strong><Link href={`/mentionmarkets/${m.id}`} className={`arena-side arena-side-${i}`}>View</Link></div>)}</div>
  <OddsChart market={m} compact/>
  <footer className="arena-card-footer"><span>{m.status}</span><Bookmark saved={saved} onClick={onSave}/></footer>
 </article>;
}

export function MarketDetail({market:m,saved,onSave}:{market:ArenaMarket;saved:boolean;onSave:()=>void}){
 const [copied,setCopied]=useState(false);
 useEffect(()=>setCopied(false),[m.id]);
 return <section className="arena-detail" aria-label={`${m.coins[0].ticker} versus ${m.coins[1].ticker} details`}>
  <header className="arena-detail-heading"><span className="arena-pair"><CoinAvatar coin={m.coins[0]}/><CoinAvatar coin={m.coins[1]} side={1}/></span><div><p className="arena-eyebrow">{m.status}</p><h2>Which coin leads after {roundLabel(m.duration)}?</h2></div><div className="arena-detail-tools">{<button className="arena-copy" onClick={async()=>{try{await navigator.clipboard.writeText(`${location.origin}/mentionmarkets/${m.id}`);setCopied(true);}catch{setCopied(false);}}}>{copied?"Copied":"Copy link"}</button>}<Bookmark saved={saved} onClick={onSave}/></div></header>
  <div className="arena-detail-body"><div className="arena-detail-summary">{m.coins.map((c,i)=><div className="arena-summary-row" key={c.ticker}><CoinAvatar coin={c} side={i}/><span><strong>${c.ticker}</strong><small>{c.name}</small></span><b>—</b></div>)}
    <div className="arena-round-info"><p className="arena-eyebrow">Round brief</p><h3>Two communities. One finish line.</h3><p>The higher percentage price change leads. Both coins are measured over the same {roundLabel(m.duration)} window.</p><dl><div><dt>Format</dt><dd>Community vs community</dd></div><div><dt>Funding</dt><dd>Not deposited</dd></div><div><dt>Chart</dt><dd>Win probability (%)</dd></div></dl>{m.stakes&&<p className="arena-stakes">Proposed stakes: {m.stakes[0]} ${m.coins[0].ticker} / {m.stakes[1]} ${m.coins[1].ticker}. Token quantities are not equal-value commitments.</p>}</div>
  </div><div className="arena-chart"><OddsChart market={m}/>
    <p className="arena-chart-caption">Market odds will appear when a pricing mechanism is connected.</p>
  </div></div><footer className="arena-detail-footer"><span>Proposed stakes · no funds locked</span><span>{roundLabel(m.duration)} round <span className="arena-footer-brand">mentions / mentionmarkets</span></span></footer>
 </section>;
}

export function OddsChart({market:m,compact=false}:{market:ArenaMarket;compact?:boolean}) {
 return <div className={compact?"arena-mini-chart":"arena-odds-chart"}>
  {!compact&&<div className="arena-chart-legend">{m.coins.map((coin,i)=><span key={coin.ticker}><i className={`arena-dot-${i}`}/>${coin.ticker} <strong>—</strong></span>)}<span className="arena-odds-label">Win probability</span></div>}
  <div className="arena-chart-stage" style={{ minHeight: compact ? 70 : 220 }}><div className="arena-chart-empty"><strong>Odds unavailable</strong>{!compact&&<span>Live pricing is not connected yet.</span>}</div></div>
  {compact&&<div className="arena-mini-label"><span>Win probability</span><span>{roundLabel(m.duration)}</span></div>}
 </div>;
}

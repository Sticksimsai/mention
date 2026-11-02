"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatTokenUnits, type BattleView } from "@mention/shared";

export interface ArenaCoin { ticker: string; name: string; pfpUrl?: string | null }
export interface ArenaMarket {
  id: string; coins: [ArenaCoin, ArenaCoin]; duration: number; status: string;
  stakes?: [string,string]; demo?: boolean; odds?: [number,number];
}
export const roundLabel=(n:number)=>n===3600?"1 hour":`${n/60} min`;
export function marketFromBattle(b:BattleView):ArenaMarket {
  return {id:b.id,coins:[b.challenger,b.opponent],duration:b.durationSecs,status:({open:"Open challenge",accepted:"Awaiting escrow",cancelled:"Cancelled",expired:"Expired"})[b.status],stakes:[formatTokenUnits(b.challengerStakeUnits),formatTokenUnits(b.opponentStakeUnits)]};
}
export const demoMarkets:ArenaMarket[]=[
  {id:"demo-orbit",coins:[{ticker:"ORBIT",name:"Orbit"},{ticker:"NOVA",name:"Nova"}],duration:600,odds:[68,32]},
  {id:"demo-pepe",coins:[{ticker:"PEPE",name:"Pepe community"},{ticker:"BONK",name:"Bonk community"}],duration:1800,odds:[42,58]},
  {id:"demo-sol",coins:[{ticker:"SOLCAT",name:"Solcat"},{ticker:"DOGE",name:"Doge community"}],duration:3600,odds:[76,24]},
  {id:"demo-moon",coins:[{ticker:"MOON",name:"Moon"},{ticker:"ROCKET",name:"Rocket"}],duration:600,odds:[37,63]},
  {id:"demo-wif",coins:[{ticker:"WIF",name:"Wif community"},{ticker:"POPCAT",name:"Popcat community"}],duration:1800,odds:[49,51]},
  {id:"demo-pixel",coins:[{ticker:"PIXEL",name:"Pixel"},{ticker:"GLITCH",name:"Glitch"}],duration:3600,odds:[61,39]},
].map(m=>({...m,coins:m.coins as [ArenaCoin,ArenaCoin],odds:m.odds as [number,number],status:"Illustrative demo",demo:true}));

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
const percent=(n:number)=>`${Math.round(n)}%`;
export function MarketCard({market:m,saved,onSave,onOpen}:{market:ArenaMarket;saved:boolean;onSave:()=>void;onOpen?:()=>void}) {
 const title=`Which coin leads after ${roundLabel(m.duration)}?`;
 const head=<><span className="arena-pair"><CoinAvatar coin={m.coins[0]}/><CoinAvatar coin={m.coins[1]} side={1}/></span><span>{title}</span></>;
 return <article className="arena-market-card">
  {m.demo?<button onClick={onOpen} className="arena-card-title">{head}</button>:<Link href={`/arena/${m.id}`} className="arena-card-title">{head}</Link>}
  <div className="arena-card-rows">{m.coins.map((c,i)=><div className="arena-coin-row" key={c.ticker}><span className="arena-ticker">${c.ticker}</span><strong>{m.demo?percent(m.odds![i]):"—"}</strong>{m.demo?<button className={`arena-side arena-side-${i}`} onClick={onOpen}>View</button>:<Link href={`/arena/${m.id}`} className={`arena-side arena-side-${i}`}>View</Link>}</div>)}</div>
  <OddsChart market={m} compact/>
  <footer className="arena-card-footer"><span>{m.demo?"Demo odds":m.status}</span><Bookmark saved={saved} onClick={onSave}/></footer>
 </article>;
}

export function MarketDetail({market:m,saved,onSave}:{market:ArenaMarket;saved:boolean;onSave:()=>void}){
 const [copied,setCopied]=useState(false);
 useEffect(()=>setCopied(false),[m.id]);
 return <section className="arena-detail" aria-label={`${m.coins[0].ticker} versus ${m.coins[1].ticker} details`}>
  <header className="arena-detail-heading"><span className="arena-pair"><CoinAvatar coin={m.coins[0]}/><CoinAvatar coin={m.coins[1]} side={1}/></span><div><p className="arena-eyebrow">{m.demo?"Illustrative market · demo odds":m.status}</p><h2>Which coin leads after {roundLabel(m.duration)}?</h2></div><div className="arena-detail-tools">{!m.demo&&<button className="arena-copy" onClick={async()=>{try{await navigator.clipboard.writeText(`${location.origin}/arena/${m.id}`);setCopied(true);}catch{setCopied(false);}}}>{copied?"Copied":"Copy link"}</button>}<Bookmark saved={saved} onClick={onSave}/></div></header>
  <div className="arena-detail-body"><div className="arena-detail-summary">{m.coins.map((c,i)=><div className="arena-summary-row" key={c.ticker}><CoinAvatar coin={c} side={i}/><span><strong>${c.ticker}</strong><small>{c.name}</small></span><b>{m.demo?percent(m.odds![i]):"—"}</b></div>)}
    <div className="arena-round-info"><p className="arena-eyebrow">Round brief</p><h3>Two communities. One finish line.</h3><p>The higher percentage price change leads. Both coins are measured over the same {roundLabel(m.duration)} window.</p><dl><div><dt>Format</dt><dd>Community vs community</dd></div><div><dt>{m.demo?"Data":"Funding"}</dt><dd>{m.demo?"Illustrative only":"Not deposited"}</dd></div><div><dt>Chart</dt><dd>Win probability (%)</dd></div></dl>{m.stakes&&<p className="arena-stakes">Proposed stakes: {m.stakes[0]} ${m.coins[0].ticker} / {m.stakes[1]} ${m.coins[1].ticker}. Token quantities are not equal-value commitments.</p>}</div>
  </div><div className="arena-chart"><OddsChart market={m}/>
    <p className="arena-chart-caption">{m.demo?"Illustrative odds only · not derived from trades or token price returns.":"Market odds will appear when a pricing mechanism is connected."}</p>
  </div></div><footer className="arena-detail-footer"><span>{m.demo?"Demo preview · no volume or funds":"Proposed stakes · no funds locked"}</span><span>{roundLabel(m.duration)} round <span className="arena-footer-brand">mentions / arena</span></span></footer>
 </section>;
}

// Display-only sample probabilities. These are not calculated from price performance.
export function demoOddsHistory(finalOdds:number):number[][] {
 const first=Array.from({length:65},(_,i)=>{const t=i/64;return Math.max(1,Math.min(99,50+(finalOdds-50)*t+Math.sin(t*17)*Math.sin(Math.PI*t)*9+Math.sin(t*47)*Math.sin(Math.PI*t)*3));});
 return [first,first.map(p=>100-p)];
}
export function OddsChart({market:m,compact=false}:{market:ArenaMarket;compact?:boolean}) {
 const [cursor,setCursor]=useState<number|null>(null);
 useEffect(()=>setCursor(null),[m.id]);
 const series=m.demo&&m.odds?demoOddsHistory(m.odds[0]):null;
 const index=cursor??64;
 const y=(value:number)=>compact?78-value*.65:220-value*2;
 const height=compact?94:260;
 return <div className={compact?"arena-mini-chart":"arena-odds-chart"}>
  {!compact&&<div className="arena-chart-legend">{m.coins.map((coin,i)=><span key={coin.ticker}><i className={`arena-dot-${i}`}/>${coin.ticker} <strong>{series?percent(series[i][index]):"—"}</strong></span>)}<span className="arena-odds-label">{cursor===null?"Win probability":`${(m.duration/60*index/64).toFixed(1)} min · demo odds`}</span></div>}
  <div className="arena-chart-stage" onMouseMove={!compact&&series?e=>{const r=e.currentTarget.getBoundingClientRect();setCursor(Math.round(Math.max(0,Math.min(1,(e.clientX-r.left)/r.width*560/500))*64));}:undefined} onMouseLeave={()=>setCursor(null)}>
  <svg viewBox={`0 0 560 ${height}`} role="img" aria-label={series?`${m.coins[0].ticker} ${m.odds![0]} percent versus ${m.coins[1].ticker} ${m.odds![1]} percent. Illustrative odds history.`:"Odds unavailable: no pricing mechanism connected"}>
   {(compact?[50]:[0,25,50,75,100]).map(v=><g key={v}><line x1="0" x2="500" y1={y(v)} y2={y(v)} className="arena-chart-gridline" strokeDasharray="2 5"/>{!compact&&<text x="515" y={y(v)+4} className="arena-chart-axis" fontSize="11">{v}%</text>}</g>)}
   {series?.map((line,i)=><g key={i}><polyline points={line.map((v,j)=>`${j/64*500},${y(v)}`).join(" ")} fill="none" className={`arena-odds-line-${i}`} strokeWidth={compact?2:2.5} strokeLinejoin="round"/><circle cx={index/64*500} cy={y(line[index])} r={compact?3:5} className={`arena-odds-point-${i}`}/></g>)}
   {!compact&&cursor!==null&&<line x1={cursor/64*500} x2={cursor/64*500} y1="20" y2="220" className="arena-chart-gridline" strokeDasharray="3 4"/>}
   {!compact&&[0,1,2,3,4].map(i=><text key={i} x={i*125} y="250" textAnchor={i===0?"start":i===4?"end":"middle"} className="arena-chart-axis" fontSize="11">{Math.round(m.duration/60*i/4)}m</text>)}
  </svg>
  {!series&&<div className="arena-chart-empty"><strong>Odds unavailable</strong>{!compact&&<span>A pricing mechanism must be connected before market probabilities can be displayed.</span>}</div>}
  </div>
  {!compact&&series&&<label className="arena-odds-scrubber">Explore odds history<input type="range" aria-label="Explore demo odds history" min="0" max="64" step="1" value={index} onChange={e=>setCursor(Number(e.target.value))}/></label>}
  {compact&&<div className="arena-mini-label"><span>{series?"Win probability · illustrative":"Win probability"}</span><span>{roundLabel(m.duration)}</span></div>}
 </div>;
}

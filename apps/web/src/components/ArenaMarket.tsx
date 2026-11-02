"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatTokenUnits, type BattleView } from "@mention/shared";

export interface ArenaCoin { ticker: string; name: string; pfpUrl?: string | null }
export interface ArenaMarket {
  id: string; coins: [ArenaCoin, ArenaCoin]; duration: number; status: string;
  stakes?: [string,string]; demo?: boolean; changes?: [number,number];
}
export const roundLabel=(n:number)=>n===3600?"1 hour":`${n/60} min`;
export function marketFromBattle(b:BattleView):ArenaMarket {
  return {id:b.id,coins:[b.challenger,b.opponent],duration:b.durationSecs,status:({open:"Open challenge",accepted:"Awaiting escrow",cancelled:"Cancelled",expired:"Expired"})[b.status],stakes:[formatTokenUnits(b.challengerStakeUnits),formatTokenUnits(b.opponentStakeUnits)]};
}
export const demoMarkets:ArenaMarket[]=[
  {id:"demo-orbit",coins:[{ticker:"ORBIT",name:"Orbit"},{ticker:"NOVA",name:"Nova"}],duration:600,changes:[4.32,2.18]},
  {id:"demo-pepe",coins:[{ticker:"PEPE",name:"Pepe community"},{ticker:"BONK",name:"Bonk community"}],duration:1800,changes:[1.76,3.24]},
  {id:"demo-sol",coins:[{ticker:"SOLCAT",name:"Solcat"},{ticker:"DOGE",name:"Doge community"}],duration:3600,changes:[6.12,-1.42]},
  {id:"demo-moon",coins:[{ticker:"MOON",name:"Moon"},{ticker:"ROCKET",name:"Rocket"}],duration:600,changes:[-0.82,2.61]},
  {id:"demo-wif",coins:[{ticker:"WIF",name:"Wif community"},{ticker:"POPCAT",name:"Popcat community"}],duration:1800,changes:[3.46,4.08]},
  {id:"demo-pixel",coins:[{ticker:"PIXEL",name:"Pixel"},{ticker:"GLITCH",name:"Glitch"}],duration:3600,changes:[5.84,3.12]},
].map(m=>({...m,coins:m.coins as [ArenaCoin,ArenaCoin],changes:m.changes as [number,number],status:"Illustrative demo",demo:true}));

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
const percent=(n:number)=>(n>=0?"+":"")+n.toFixed(2)+"%";
export function MarketCard({market:m,saved,onSave,onOpen}:{market:ArenaMarket;saved:boolean;onSave:()=>void;onOpen?:()=>void}) {
 const title=`Which coin leads after ${roundLabel(m.duration)}?`;
 const head=<><span className="arena-pair"><CoinAvatar coin={m.coins[0]}/><CoinAvatar coin={m.coins[1]} side={1}/></span><span>{title}</span></>;
 return <article className="arena-market-card">
  {m.demo?<button onClick={onOpen} className="arena-card-title">{head}</button>:<Link href={`/arena/${m.id}`} className="arena-card-title">{head}</Link>}
  <div className="arena-card-rows">{m.coins.map((c,i)=><div className="arena-coin-row" key={c.ticker}><span className="arena-ticker">${c.ticker}</span><strong>{m.demo?percent(m.changes![i]):"—"}</strong>{m.demo?<button className={`arena-side arena-side-${i}`} onClick={onOpen}>View</button>:<Link href={`/arena/${m.id}`} className={`arena-side arena-side-${i}`}>View</Link>}</div>)}</div>
  <footer className="arena-card-footer"><span>{m.demo?"Demo · price change":m.status}</span><Bookmark saved={saved} onClick={onSave}/></footer>
 </article>;
}

export function MarketDetail({market:m,saved,onSave}:{market:ArenaMarket;saved:boolean;onSave:()=>void}){
 const [copied,setCopied]=useState(false);
 useEffect(()=>setCopied(false),[m.id]);
 const y=(v:number)=>190-v*20;
 const values=(side:number)=>Array.from({length:65},(_,i)=>{const t=i/64;return m.changes![side]*t+Math.sin(t*21+side)*Math.sin(Math.PI*t)*.65+Math.sin(t*55)*Math.sin(Math.PI*t)*.23;});
 const chart=m.demo?[values(0),values(1)]:null;
 return <section className="arena-detail" aria-label={`${m.coins[0].ticker} versus ${m.coins[1].ticker} details`}>
  <header className="arena-detail-heading"><span className="arena-pair"><CoinAvatar coin={m.coins[0]}/><CoinAvatar coin={m.coins[1]} side={1}/></span><div><p className="arena-eyebrow">{m.demo?"Illustrative market · synthetic data":m.status}</p><h2>Which coin leads after {roundLabel(m.duration)}?</h2></div><div className="arena-detail-tools">{!m.demo&&<button className="arena-copy" onClick={async()=>{try{await navigator.clipboard.writeText(`${location.origin}/arena/${m.id}`);setCopied(true);}catch{setCopied(false);}}}>{copied?"Copied":"Copy link"}</button>}<Bookmark saved={saved} onClick={onSave}/></div></header>
  <div className="arena-detail-body"><div className="arena-detail-summary">{m.coins.map((c,i)=><div className="arena-summary-row" key={c.ticker}><CoinAvatar coin={c} side={i}/><span><strong>${c.ticker}</strong><small>{c.name}</small></span><b>{m.demo?percent(m.changes![i]):"—"}</b></div>)}
    <div className="arena-round-info"><p className="arena-eyebrow">Round brief</p><h3>Two communities. One finish line.</h3><p>The higher percentage price change leads. Both coins are measured over the same {roundLabel(m.duration)} window.</p><dl><div><dt>Format</dt><dd>Community vs community</dd></div><div><dt>{m.demo?"Data":"Funding"}</dt><dd>{m.demo?"Illustrative only":"Not deposited"}</dd></div><div><dt>Metric</dt><dd>Price change · not odds</dd></div></dl>{m.stakes&&<p className="arena-stakes">Proposed stakes: {m.stakes[0]} ${m.coins[0].ticker} / {m.stakes[1]} ${m.coins[1].ticker}. Token quantities are not equal-value commitments.</p>}</div>
  </div><div className="arena-chart"><div className="arena-chart-legend">{m.coins.map((c,i)=><span key={c.ticker}><i className={`arena-dot-${i}`}/>${c.ticker} <strong>{m.demo?percent(m.changes![i]):"—"}</strong></span>)}</div>
    <div className="arena-chart-stage"><svg viewBox="0 0 560 270" role="img" aria-label={m.demo?"Illustrative percentage price-change comparison, not odds":"Price comparison unavailable until a funded round starts"}>
     {[-2,0,2,4,6].map(v=><g key={v}><line x1="0" x2="500" y1={y(v)} y2={y(v)} stroke="#3a3d46" strokeDasharray="2 5"/><text x="515" y={y(v)+4} fill="#9399a5" fontSize="11">{v>0?"+":""}{v}%</text></g>)}
     {chart?.map((series,i)=><g key={i}><polyline points={series.map((v,j)=>`${j/64*500},${y(v)}`).join(" ")} fill="none" stroke={i===0?"#9bf000":"#6aafff"} strokeWidth="2.5" strokeLinejoin="round"/><circle cx="500" cy={y(series[64])} r="14" fill={i===0?"#9bf000":"#6aafff"} opacity=".12"/><circle cx="500" cy={y(series[64])} r="4" fill={i===0?"#9bf000":"#6aafff"}/></g>)}
     {[0,1,2,3,4].map(i=><text key={i} x={i*125} y="260" textAnchor={i===0?"start":i===4?"end":"middle"} fill="#9399a5" fontSize="11">{Math.round(m.duration/60*i/4)}m</text>)}
    </svg>{!m.demo&&<div className="arena-chart-empty"><strong>Round has not started</strong><span>Performance appears once escrow and price settlement are connected.</span></div>}</div>
    <p className="arena-chart-caption">{m.demo?"Synthetic example · not a live market, probability or return forecast.":"No prices or odds are implied for an unfunded challenge."}</p>
  </div></div><footer className="arena-detail-footer"><span>{m.demo?"Demo preview · no volume or funds":"Proposed stakes · no funds locked"}</span><span>{roundLabel(m.duration)} round <span className="arena-footer-brand">mentions / arena</span></span></footer>
 </section>;
}

"use client";
import {useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import {useQuery} from '@tanstack/react-query';
import {api} from '@/lib/api';
interface Coin {id:string;ticker:string;name:string;pfpUrl:string}
export function TickerText({text}:{text:string}){return <>{text.split(/(\$[A-Za-z0-9]{1,12}\b)/g).map((part,i)=>/^\$[A-Za-z0-9]{1,12}$/.test(part)?<Link key={i} href={`/explore?q=${encodeURIComponent(part.slice(1))}`} className="font-medium text-volt hover:underline">{part}</Link>:part)}</>;}
export function TickerTextarea({value,onChange,placeholder='What’s happening?',maxLength=280,rows=5,autoFocus=false}:{value:string;onChange:(v:string)=>void;placeholder?:string;maxLength?:number;rows?:number;autoFocus?:boolean}){
 const ref=useRef<HTMLTextAreaElement>(null);const [cursor,setCursor]=useState(0),[dismiss,setDismiss]=useState(false),[query,setQuery]=useState('');
 const match=value.slice(0,cursor).match(/(?:^|\s)\$([A-Za-z0-9]{0,12})$/);const term=match?.[1]??'';
 useEffect(()=>{const t=setTimeout(()=>setQuery(term),180);return()=>clearTimeout(t);},[term]);
 const coins=useQuery({queryKey:['ticker-suggest',query],queryFn:()=>query?api<{tribes:Coin[]}>(`/v1/search?q=${encodeURIComponent(query)}`,{auth:false}).then(r=>r.tribes):api<Coin[]>('/v1/communities',{auth:false}).then(r=>r.slice(0,6)),enabled:!!match&&!dismiss,staleTime:60000});
 return <div><textarea ref={ref} autoFocus={autoFocus} aria-label="Post text" value={value} onChange={e=>{onChange(e.target.value);setCursor(e.target.selectionStart);setDismiss(false);}} onSelect={e=>setCursor(e.currentTarget.selectionStart)} onKeyDown={e=>{if(e.key==='Escape')setDismiss(true);}} maxLength={maxLength} rows={rows} placeholder={placeholder} className="w-full resize-none bg-transparent text-base leading-7 outline-none placeholder:text-muted"/>{match&&!dismiss&&<div className="mb-3 max-h-48 overflow-y-auto rounded-xl border hairline bg-surface p-2"><p className="px-2 py-1 text-[10px] text-muted">Add a ticker</p>{coins.data?.map(c=><button type="button" key={c.id} onClick={()=>{const start=cursor-term.length-1;const next=value.slice(0,start)+'$'+c.ticker+' '+value.slice(cursor);onChange(next.slice(0,maxLength));setDismiss(true);ref.current?.focus();}} className="flex w-full items-center gap-2 rounded-lg p-2 text-left hover:bg-raised">{c.pfpUrl&&<img src={c.pfpUrl} alt="" className="h-7 w-7 rounded-full"/>}<span className="text-xs"><strong className="text-volt">${c.ticker}</strong><span className="ml-2 text-muted">{c.name}</span></span></button>)}{coins.isLoading&&<p className="p-2 text-xs text-muted">Finding tickers…</p>}{coins.data?.length===0&&<p className="p-2 text-xs text-muted">No community found. You can still include this ticker.</p>}</div>}</div>;
}

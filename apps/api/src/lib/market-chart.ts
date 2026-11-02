import type {MarketChartView} from '@mention/shared';
import {cached} from './redis.js';
import {fetchTokenStats} from './tokenStats.js';
const frames:Record<string,{timeframe:string;aggregate:number}>={'1m':{timeframe:'minute',aggregate:1},'5m':{timeframe:'minute',aggregate:5},'15m':{timeframe:'minute',aggregate:15},'1h':{timeframe:'hour',aggregate:1}};
async function gecko(path:string){
 const key=process.env.COINGECKO_API_KEY,plan=process.env.COINGECKO_API_PLAN==='demo'?'demo':'pro';
 const base=key?(plan==='pro'?'https://pro-api.coingecko.com/api/v3/onchain':'https://api.coingecko.com/api/v3/onchain'):'https://api.geckoterminal.com/api/v2';
 const headers:Record<string,string>={accept:'application/json'};if(key)headers[plan==='pro'?'x-cg-pro-api-key':'x-cg-demo-api-key']=key;
 const res=await fetch(base+path,{headers,signal:AbortSignal.timeout(10000)});
 if(!res.ok)throw new Error('Market data is temporarily unavailable');
 return res.json();
}
export function parseCandles(rows:unknown):MarketChartView['candles']{
 if(!Array.isArray(rows))return [];
 return rows.filter(r=>Array.isArray(r)&&r.length>=6&&r.slice(0,6).every((x:unknown)=>typeof x==='number'&&Number.isFinite(x))&&r[2]>=r[3]).map(r=>({time:r[0],open:r[1],high:r[2],low:r[3],close:r[4],volume:r[5]})).sort((a,b)=>a.time-b.time);
}
export async function marketChart(ca:string,interval:string):Promise<MarketChartView>{
 const frame=frames[interval]??frames['1m'];
 const stats=await cached(`token:${ca}`,15,()=>fetchTokenStats(ca));
 if(!stats.pairAddress)return {candles:[],trades:[],holders:null,holdersUpdatedAt:null,pairAddress:null,interval,updatedAt:new Date().toISOString(),errors:['No indexed pool yet']};
 const pool=encodeURIComponent(stats.pairAddress),token=encodeURIComponent(ca);
 const [candles,trades,info]=await Promise.allSettled([
  cached(`candles:${ca}:${interval}`,30,()=>gecko(`/networks/solana/pools/${pool}/ohlcv/${frame.timeframe}?aggregate=${frame.aggregate}&limit=180&currency=usd&token=${token}`)),
  cached(`trades:${ca}`,30,()=>gecko(`/networks/solana/pools/${pool}/trades`)),
  cached(`token-info:${ca}`,300,()=>gecko(`/networks/solana/tokens/${token}/info`)),
 ]);
 const candlesData=candles.status==='fulfilled'?candles.value as any:null,tradesData=trades.status==='fulfilled'?trades.value as any:null,infoData=info.status==='fulfilled'?info.value as any:null;
 const attrs=infoData?.data?.attributes;const holders=attrs?.holders?.count;
 return {candles:parseCandles(candlesData?.data?.attributes?.ohlcv_list),trades:(tradesData?.data??[]).slice(0,50).flatMap((row:any)=>{
  const a=row.attributes;if(!a||!['buy','sell'].includes(a.kind)||typeof a.tx_hash!=='string'||!Number.isFinite(Date.parse(a.block_timestamp)))return [];
  const side=a.to_token_address===ca?'buy':a.from_token_address===ca?'sell':null;if(!side)return [];
  const amount=Number(side==='buy'?a.to_token_amount:a.from_token_amount),usd=Number(a.volume_in_usd),price=Number(side==='buy'?a.price_to_in_usd:a.price_from_in_usd);
  return [{id:row.id,signature:a.tx_hash,maker:a.tx_from_address??'',side,amount:Number.isFinite(amount)?amount:null,usd:Number.isFinite(usd)?usd:null,price:Number.isFinite(price)?price:null,time:a.block_timestamp}];
 }),holders:typeof holders==='number'&&Number.isFinite(holders)?holders:null,holdersUpdatedAt:attrs?.holders?.last_updated??null,pairAddress:stats.pairAddress,interval,updatedAt:new Date().toISOString(),errors:[...(candles.status==='rejected'?['Chart data unavailable']:[]),...(trades.status==='rejected'?['Transaction history unavailable']:[])]};
}

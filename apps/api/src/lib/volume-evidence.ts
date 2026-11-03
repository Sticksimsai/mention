/** Read-only oracle rehearsal. Provider data is NOT finality proof and never authorizes a payout. */
import { createHash } from "node:crypto";
import { scoreVolume, type VolumeRules, type VolumeSnapshot } from "./volume-settlement.js";
const address=/^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
export function usdMicros(value:unknown):string {
 if(typeof value!=="number"&&typeof value!=="string")throw new Error("Missing USD volume");
 const text=String(value);const m=/^(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i.exec(text);
 if(!m||text.length>64)throw new Error("Invalid USD volume");
 const exponent=Number(m[3]??0);if(Math.abs(exponent)>30)throw new Error("USD volume out of range");
 const digits=BigInt(m[1]+(m[2]??"")),shift=6+exponent-(m[2]?.length??0);
 const micros=shift>=0?digits*10n**BigInt(shift):digits/10n**BigInt(-shift);
 if(micros>10n**29n-1n)throw new Error("USD volume out of range");return micros.toString();
}
export function normalizeVolume(pool:string,mint:string,start:number,end:number,info:any,ohlcv:any):VolumeSnapshot {
 if(!address.test(pool)||!address.test(mint)||info?.data?.attributes?.address!==pool)throw new Error("Pool identity mismatch");
 const tokens=[info?.data?.relationships?.base_token?.data?.id,info?.data?.relationships?.quote_token?.data?.id];
 if(!tokens.includes(`solana_${mint}`))throw new Error("Pool does not contain the fixed token mint");
 const rows=ohlcv?.data?.attributes?.ohlcv_list;if(!Array.isArray(rows))throw new Error("Missing volume candles");
 const buckets=rows.filter((v:any)=>Array.isArray(v)&&v[0]>=start&&v[0]<end).map((v:any)=>{
 if(v.length!==6||!Number.isSafeInteger(v[0])||v[0]%60!==0)throw new Error("Invalid minute candle");
 return {time:v[0],usdMicros:usdMicros(v[5])};
 }).sort((a,b)=>a.time-b.time);
 // Always false: a market-data API cannot establish Solana consensus finality.
 return {pool,mint,finalized:false,buckets};
}
export async function collectVolumeEvidence(rules:VolumeRules,now:number,fetchJson:(path:string)=>Promise<any>){
 // Reuse immutable window validation. Missing snapshots deliberately produce a refund candidate.
 const empty=(pool:string,mint:string):VolumeSnapshot=>({pool,mint,finalized:false,buckets:[]});
 scoreVolume(rules,empty(rules.poolA,rules.mintA),empty(rules.poolB,rules.mintB),now);
 if(now<rules.end+120)throw new Error("Wait two minutes after the round closes before sampling");
 async function side(pool:string,mint:string){
  if(!address.test(pool)||!address.test(mint))throw new Error("Invalid fixed pool or mint");
  const base=`/networks/solana/pools/${pool}`;
  const info=await fetchJson(base);
  const data=await fetchJson(`${base}/ohlcv/minute?aggregate=1&before_timestamp=${rules.end}&limit=100&currency=usd&token=base&include_empty_intervals=true`);
  return normalizeVolume(pool,mint,rules.start,rules.end,info,data);
 }
 const failures:string[]=[];
 async function guarded(pool:string,mint:string){try{return await side(pool,mint)}catch(e){failures.push(e instanceof Error?e.message:"Provider unavailable");return empty(pool,mint)}}
 const a=await guarded(rules.poolA,rules.mintA),b=await guarded(rules.poolB,rules.mintB);
 // Candidate score only: explicitly opt into provider snapshot assumptions for comparison.
 const candidate=scoreVolume(rules,{...a,finalized:true},{...b,finalized:true},now);
 const payload={version:"gecko-shadow-v1",provider:"GeckoTerminal",rules,a,b};
 return {...payload,collectedAt:now,failures,candidate,signable:false as const,
  evidenceHash:createHash("sha256").update(JSON.stringify(payload)).digest("hex"),
  limitation:"Provider snapshots can change and include wash trading. No oracle signature or settlement transaction is produced."};
}

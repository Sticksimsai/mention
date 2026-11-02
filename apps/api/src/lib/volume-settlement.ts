/** Pure scoring only. This does not authenticate an oracle or move escrow funds. */
export type VolumeRules={start:number;end:number;poolA:string;poolB:string;mintA:string;mintB:string};
export type VolumeSnapshot={pool:string;mint:string;finalized:boolean;buckets:{time:number;usdMicros:string}[]};
export type VolumeResult={outcome:'a'|'b'|'refund';reason:string;volumeA:string|null;volumeB:string|null};
export function scoreVolume(rules:VolumeRules,a:VolumeSnapshot,b:VolumeSnapshot,now:number):VolumeResult{
 const refund=(reason:string):VolumeResult=>({outcome:'refund',reason,volumeA:null,volumeB:null});
 if(!Number.isSafeInteger(now)||!Number.isSafeInteger(rules.start)||!Number.isSafeInteger(rules.end)||rules.start%60!==0||![600,1800,3600].includes(rules.end-rules.start)||!rules.poolA||!rules.poolB||rules.poolA===rules.poolB||!rules.mintA||!rules.mintB||rules.mintA===rules.mintB)throw new Error('Invalid immutable volume rules');
 if(now<rules.end)throw new Error('Round has not ended');
 function sum(s:VolumeSnapshot,pool:string,mint:string):bigint|null{
  if(s.pool!==pool||s.mint!==mint||!s.finalized||s.buckets.length!==(rules.end-rules.start)/60)return null;
  const seen=new Set<number>();let total=0n;
  for(const v of s.buckets){
   if(!Number.isSafeInteger(v.time)||v.time%60!==0||v.time<rules.start||v.time>=rules.end||seen.has(v.time)||!/^(0|[1-9]\d{0,29})$/.test(v.usdMicros))return null;
   seen.add(v.time);total+=BigInt(v.usdMicros);
  }return total;
 }
 const va=sum(a,rules.poolA,rules.mintA),vb=sum(b,rules.poolB,rules.mintB);
 if(va===null||vb===null)return refund('Incomplete, invalid or non-finalized volume evidence');
 return {outcome:va===vb?'refund':va>vb?'a':'b',reason:va===vb?'Equal USD volume':'Higher USD volume over the fixed window',volumeA:va.toString(),volumeB:vb.toString()};
}

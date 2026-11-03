import {createHash} from 'node:crypto';
import {PublicKey,TransactionInstruction,SystemProgram,type AccountInfo} from '@solana/web3.js';
export const DEVNET_GENESIS='EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG';
export const TOKEN='TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',TOKEN2022='TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';
const ASSOCIATED=new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');
export const key=(s:string)=>new PublicKey(s);
export const digest=(x:unknown)=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const disc=(s:string)=>createHash('sha256').update(s).digest().subarray(0,8);
const u64=(n:string|number|bigint)=>{const b=Buffer.alloc(8);b.writeBigUInt64LE(BigInt(n));return b};
const u128=(n:string)=>{const v=BigInt(n);return Buffer.concat([u64(v&((1n<<64n)-1n)),u64(v>>64n)])};
const meta=(s:string|PublicKey,writable=false,signer=false)=>({pubkey:typeof s==='string'?key(s):s,isWritable:writable,isSigner:signer});
export const reserveAddress=(program:string,mint:string)=>PublicKey.findProgramAddressSync([Buffer.from('reserve'),key(mint).toBuffer()],key(program))[0].toBase58();
export const ata=(mint:string,owner:string,token:string)=>PublicKey.findProgramAddressSync([key(owner).toBuffer(),key(token).toBuffer(),key(mint).toBuffer()],ASSOCIATED)[0].toBase58();
export type ReserveState={address:string;owner:string;mint:string;token:string;vault:string;purchased:string;deposited:string};
export function decodeReserve(program:string,mint:string,a:AccountInfo<Buffer>):ReserveState{
 const d=a.data;if(a.owner.toBase58()!==program||d.length!==153||!d.subarray(0,8).equals(disc('account:Reserve')))throw Error('Invalid reserve account');
 const s={address:reserveAddress(program,mint),owner:new PublicKey(d.subarray(8,40)).toBase58(),mint:new PublicKey(d.subarray(40,72)).toBase58(),token:new PublicKey(d.subarray(72,104)).toBase58(),vault:new PublicKey(d.subarray(104,136)).toBase58(),purchased:d.readBigUInt64LE(136).toString(),deposited:d.readBigUInt64LE(144).toString()};
 if(s.mint!==mint||![TOKEN,TOKEN2022].includes(s.token)||s.vault!==ata(mint,s.address,s.token)||BigInt(s.deposited)!==BigInt(s.purchased)/2n)throw Error('Reserve is not the expected 50% vault');return s;
}
export type MarketTerms={network:'devnet';dataPolicy:'devnet-gecko-proxy-v1';round:string;nonce:string;program:string;oracle:string;walletA:string;walletB:string;mintA:string;mintB:string;tokenA:string;tokenB:string;poolA:string;poolB:string;volumeMintA:string;volumeMintB:string;amountA:string;amountB:string;start:number;end:number;deadline:number;rulesHash:string;challengerId:string;opponentId:string;ownerIdA:string;ownerIdB:string};
export type ChainRound={ownerA:string;ownerB:string;beneficiaryA:string;beneficiaryB:string;mintA:string;mintB:string;tokenA:string;tokenB:string;vaultA:string;vaultB:string;oracle:string;poolA:string;poolB:string;nonce:string;rulesHash:string;amountA:string;amountB:string;start:number;end:number;deadline:number;status:number;fundedB:boolean;claimedA:boolean;claimedB:boolean};
export function decodeRound(program:string,address:string,a:AccountInfo<Buffer>,t:MarketTerms):ChainRound{
 const d=a.data;if(a.owner.toBase58()!==program||d.length!==597||!d.subarray(0,8).equals(disc('account:Round')))throw Error('Invalid round account');
 let off=8;const r:any={};for(const name of ['ownerA','ownerB','beneficiaryA','beneficiaryB','mintA','mintB','tokenA','tokenB','vaultA','vaultB','oracle','poolA','poolB']){r[name]=new PublicKey(d.subarray(off,off+32)).toBase58();off+=32;}
 r.nonce=d.subarray(424,456).toString('hex');r.rulesHash=d.subarray(456,488).toString('hex');r.amountA=d.readBigUInt64LE(520).toString();r.amountB=d.readBigUInt64LE(528).toString();r.start=Number(d.readBigInt64LE(536));r.end=Number(d.readBigInt64LE(544));r.deadline=Number(d.readBigInt64LE(552));r.status=d[592];r.fundedB=!!d[594];r.claimedA=!!d[595];r.claimedB=!!d[596];
 if(r.status>3||[d[594],d[595],d[596]].some(x=>x>1))throw Error('Invalid round flags');
 const expected={ownerA:t.walletA,ownerB:t.walletB,beneficiaryA:t.walletA,beneficiaryB:t.walletB,mintA:t.mintA,mintB:t.mintB,tokenA:t.tokenA,tokenB:t.tokenB,oracle:t.oracle,poolA:t.poolA,poolB:t.poolB,nonce:t.nonce,rulesHash:t.rulesHash,amountA:t.amountA,amountB:t.amountB,start:t.start,end:t.end,deadline:t.deadline,vaultA:ata(t.mintA,t.round,t.tokenA),vaultB:ata(t.mintB,t.round,t.tokenB)};
 if(t.round!==address||Object.entries(expected).some(([k,v])=>r[k]!==v))throw Error('On-chain round differs from reviewed terms');return r;
}
export function roundAddress(program:string,owner:string,nonce:string){return PublicKey.findProgramAddressSync([Buffer.from('round'),key(owner).toBuffer(),Buffer.from(nonce,'hex')],key(program))[0].toBase58()}
export function fundRound(t:MarketTerms,side:'a'|'b'){
 const isA=side==='a',owner=isA?t.walletA:t.walletB,mint=isA?t.mintA:t.mintB,token=isA?t.tokenA:t.tokenB,reserve=reserveAddress(t.program,mint),source=ata(mint,reserve,token),vaultA=ata(t.mintA,t.round,t.tokenA),vaultB=ata(t.mintB,t.round,t.tokenB);
 const data=isA?Buffer.concat([disc('global:initialize_from_reserve'),Buffer.from(t.nonce,'hex'),...[t.walletB,t.walletA,t.walletB,t.oracle,t.poolA,t.poolB].map(v=>key(v).toBuffer()),Buffer.from(t.rulesHash,'hex'),u64(t.amountA),u64(t.amountB),u64(t.start),u64(t.end-t.start)]):disc('global:accept_from_reserve');
 const keys=isA?[meta(owner,true,true),meta(t.round,true),meta(t.mintA),meta(t.mintB),meta(reserve),meta(source,true),meta(vaultA,true),meta(vaultB,true),meta(t.tokenA),meta(t.tokenB),meta(ASSOCIATED),meta(SystemProgram.programId)]:[meta(owner,false,true),meta(t.round,true),meta(mint),meta(reserve),meta(source,true),meta(vaultB,true),meta(token)];
 return new TransactionInstruction({programId:key(t.program),keys,data});
}
export function expireRound(t:MarketTerms){return new TransactionInstruction({programId:key(t.program),keys:[meta(t.round,true)],data:disc('global:expire')})}
export function settleRound(t:MarketTerms,a:string,b:string,hash:string){return new TransactionInstruction({programId:key(t.program),keys:[meta(t.oracle,false,true),meta(t.round,true)],data:Buffer.concat([disc('global:settle'),u128(a),u128(b),Buffer.from([1]),Buffer.from(hash,'hex')])})}
export function claimRound(t:MarketTerms,r:ChainRound,side:0|1,payer:string){
 const mint=side===0?t.mintA:t.mintB,token=side===0?t.tokenA:t.tokenB,owner=r.status===1?t.walletA:r.status===2?t.walletB:side===0?t.walletA:t.walletB,destination=ata(mint,owner,token),vault=ata(mint,t.round,token);
 return [new TransactionInstruction({programId:ASSOCIATED,keys:[meta(payer,true,true),meta(destination,true),meta(owner),meta(mint),meta(SystemProgram.programId),meta(token)],data:Buffer.from([1])}),new TransactionInstruction({programId:key(t.program),keys:[meta(t.round,true),meta(mint),meta(vault,true),meta(destination,true),meta(token)],data:Buffer.concat([disc('global:claim'),Buffer.from([side])])})];
}

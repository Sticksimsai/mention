import { createHash } from "node:crypto";
import { PublicKey, SystemProgram, TransactionInstruction } from "@solana/web3.js";
export const DEVNET_GENESIS = "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG";
const ASSOCIATED = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
export const TOKEN_2022 = new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");
export function reserveDeposit(program:PublicKey,owner:PublicKey,mint:PublicKey,purchased:bigint) {
 if(purchased<2n) throw new Error("Reserve mode needs a developer buy of at least 2 raw token units");
 const reserve=PublicKey.findProgramAddressSync([Buffer.from("reserve"),mint.toBuffer()],program)[0];
 const ata=(authority:PublicKey)=>PublicKey.findProgramAddressSync([authority.toBuffer(),TOKEN_2022.toBuffer(),mint.toBuffer()],ASSOCIATED)[0];
 const vault=ata(reserve),source=ata(owner),amount=purchased/2n;
 const data=Buffer.alloc(16);createHash("sha256").update("global:initialize_reserve").digest().copy(data,0,0,8);data.writeBigUInt64LE(purchased,8);
 const keys=[{pubkey:owner,isSigner:true,isWritable:true},...[mint,reserve,source,vault,TOKEN_2022,ASSOCIATED,SystemProgram.programId].map((pubkey,i)=>({pubkey,isSigner:false,isWritable:i>=1&&i<=3}))];
 return {reserve,vault,source,amount,instruction:new TransactionInstruction({programId:program,keys,data})};
}
export function verifyReserveVault(account:{owner:string;data:[string,string]}|null|undefined,mint:PublicKey,reserve:PublicKey,amount:bigint){
 if(!account||account.owner!==TOKEN_2022.toBase58())throw new Error("Reserve token account missing or owned by the wrong program");
 const data=Buffer.from(account.data[0],"base64");
 if(data.length<165||!data.subarray(0,32).equals(mint.toBuffer())||!data.subarray(32,64).equals(reserve.toBuffer())||data.readBigUInt64LE(64)!==amount)throw new Error("Reserve balance or authority differs from the reviewed 50% split");
}

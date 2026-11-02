const {PublicKey,TransactionInstruction,SystemProgram}=require('@solana/web3.js');
const {ASSOCIATED_TOKEN_PROGRAM_ID,getAssociatedTokenAddressSync}=require('@solana/spl-token');
const {createHash}=require('node:crypto');
const disc=name=>createHash('sha256').update('global:'+name).digest().subarray(0,8);
const u64=n=>{const b=Buffer.alloc(8);b.writeBigUInt64LE(BigInt(n));return b};
const i64=n=>{const b=Buffer.alloc(8);b.writeBigInt64LE(BigInt(n));return b};
const u128=n=>Buffer.concat([u64(BigInt(n)&((1n<<64n)-1n)),u64(BigInt(n)>>64n)]);
const key=(pubkey,isWritable=false,isSigner=false)=>({pubkey,isWritable,isSigner});
function roundAddress(program,owner,nonce){return PublicKey.findProgramAddressSync([Buffer.from('round'),owner.toBuffer(),nonce],program)[0]}
function initialize(program,t){
 const round=roundAddress(program,t.ownerA,t.nonce),vaultA=getAssociatedTokenAddressSync(t.mintA,round,true,t.tokenA),vaultB=getAssociatedTokenAddressSync(t.mintB,round,true,t.tokenB);
 const data=Buffer.concat([disc('initialize'),t.nonce,...[t.ownerB,t.beneficiaryA,t.beneficiaryB,t.oracle,t.poolA,t.poolB].map(k=>k.toBuffer()),t.rulesHash,u64(t.amountA),u64(t.amountB),i64(t.start),i64(t.duration)]);
 const keys=[key(t.ownerA,true,true),key(round,true),key(t.mintA),key(t.mintB),key(t.sourceA,true),key(vaultA,true),key(vaultB,true),key(t.tokenA),key(t.tokenB),key(ASSOCIATED_TOKEN_PROGRAM_ID),key(SystemProgram.programId)];
 return {round,vaultA,vaultB,ix:new TransactionInstruction({programId:program,keys,data})};
}
function accept(program,r,t,owner=t.ownerB){return new TransactionInstruction({programId:program,keys:[key(owner,false,true),key(r.round,true),key(t.mintB),key(t.sourceB,true),key(r.vaultB,true),key(t.tokenB)],data:disc('accept')})}
function settle(program,r,oracle,a,b,complete=true,evidence=Buffer.alloc(32,1)){return new TransactionInstruction({programId:program,keys:[key(oracle,false,true),key(r.round,true)],data:Buffer.concat([disc('settle'),u128(a),u128(b),Buffer.from([complete?1:0]),evidence])})}
function expire(program,r){return new TransactionInstruction({programId:program,keys:[key(r.round,true)],data:disc('expire')})}
function claim(program,r,t,side,destination){return new TransactionInstruction({programId:program,keys:[key(r.round,true),key(side===0?t.mintA:t.mintB),key(side===0?r.vaultA:r.vaultB,true),key(destination,true),key(side===0?t.tokenA:t.tokenB)],data:Buffer.concat([disc('claim'),Buffer.from([side])])});}
module.exports={initialize,accept,settle,expire,claim,roundAddress};

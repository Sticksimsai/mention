const crypto=require('node:crypto');
function decode(data,PublicKey){
 if(data.length!==597||!data.subarray(0,8).equals(crypto.createHash('sha256').update('account:Round').digest().subarray(0,8)))throw Error('Unexpected escrow account layout');
 let o=8;const result={};
 for(const k of ['ownerA','ownerB','beneficiaryA','beneficiaryB','mintA','mintB','tokenA','tokenB','vaultA','vaultB','oracle','poolA','poolB']){result[k]=new PublicKey(data.subarray(o,o+32));o+=32;}
 for(const k of ['nonce','rulesHash','evidenceHash']){result[k]=data.subarray(o,o+32);o+=32;}
 for(const k of ['amountA','amountB']){result[k]=data.readBigUInt64LE(o);o+=8;}
 for(const k of ['start','end','deadline']){result[k]=Number(data.readBigInt64LE(o));o+=8;}
 o+=32;
 for(const k of ['status','bump','fundedB','claimedA','claimedB'])result[k]=data[o++];
 if(result.status>3||[result.fundedB,result.claimedA,result.claimedB].some(v=>v>1))throw Error('Invalid escrow state');
 return result;
}
module.exports={decode};

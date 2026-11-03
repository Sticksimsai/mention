// Public market-data reads only; no wallet, signing key, RPC send, or escrow settlement.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{createRequire}=require('node:module');
const r=createRequire(path.resolve('apps/api/package.json')),ts=r('typescript');
function load(file,mocks={}){const module={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module,exports:module.exports,require:n=>mocks[n]??r(n)});return module.exports;}
(async()=>{
 const read=async route=>{await new Promise(r=>setTimeout(r,2200));const response=await fetch('https://api.geckoterminal.com/api/v2'+route,{signal:AbortSignal.timeout(20000)});if(!response.ok)throw Error('Market provider HTTP '+response.status);return response.json();};
 let poolA=process.env.POOL_A,mintA=process.env.MINT_A,poolB=process.env.POOL_B,mintB=process.env.MINT_B;
 if(process.argv.includes('--discover')){
 const rows=(await read('/networks/solana/pools')).data,chosen=[];
 for(const row of rows??[]){const pool=row.attributes?.address,id=row.relationships?.base_token?.data?.id,mint=id?.startsWith('solana_')?id.slice(7):null;if(pool&&mint&&!chosen.some(v=>v.mint===mint||v.pool===pool))chosen.push({pool,mint});if(chosen.length===2)break;}
 if(chosen.length!==2)throw Error('Could not discover two distinct public test pools');
 [{pool:poolA,mint:mintA},{pool:poolB,mint:mintB}]=chosen;
 }
 if(!poolA||!poolB||!mintA||!mintB)throw Error('Set POOL_A, MINT_A, POOL_B, MINT_B, or use --discover for read-only sample pools');
 const now=Math.floor(Date.now()/1000),end=Math.floor((now-180)/60)*60;
 const scoring=load('apps/api/src/lib/volume-settlement.ts'),{collectVolumeEvidence}=load('apps/api/src/lib/volume-evidence.ts',{'./volume-settlement.js':scoring});
 const result=await collectVolumeEvidence({poolA,mintA,poolB,mintB,start:end-600,end},now,read);
 fs.mkdirSync('qa',{recursive:true});const file=`qa/volume-shadow-${now}.json`;fs.writeFileSync(file,JSON.stringify(result,null,2),{flag:'wx'});
 console.log(JSON.stringify({file,rules:result.rules,candidate:result.candidate,failures:result.failures,evidenceHash:result.evidenceHash,signable:result.signable,limitation:result.limitation},null,2));
})().catch(e=>{console.error(e.message);process.exitCode=1});

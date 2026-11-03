const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const r=require('node:module').createRequire(path.resolve('apps/api/package.json')),web=require('node:module').createRequire(path.resolve('apps/web/package.json')),ts=web('typescript');
function load(file,mocks,extra={}){const module={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,{module,exports:module.exports,require:n=>mocks[n]??r(n),Response,AbortSignal,process:{env:{}},console,...extra});return module.exports;}
const raw='{"jsonrpc":"2.0","id":"1","result":{"context":{"slot":1},"value":9007199254740993}}';let upstream=0,calls=[];
const {HTTPException}=r('hono/http-exception');
const route=load('apps/api/src/routes/wallet-rpc.ts',{'../env.js':{env:{SOLANA_RPC_URL:'https://secret-rpc.invalid/?key=private'}},'../auth/middleware.js':{requireAuth:async(c,next)=>{if(!c.req.header('authorization'))throw new HTTPException(401);await next()},rateLimit:()=>async(c,next)=>next()}},{fetch:async(url,opts)=>{upstream++;calls.push(JSON.parse(opts.body));return new Response(raw)}}).walletRpcRoute;
const body=method=>JSON.stringify({jsonrpc:'2.0',id:'1',method,params:[]});
const request=(method,auth=true,network='mainnet')=>route.request('/'+network,{method:'POST',headers:{'Content-Type':'application/json',...(auth?{Authorization:'Bearer test'}:{})},body:body(method)});
(async()=>{
 assert.equal((await request('getBalance',false)).status,401);assert.equal(upstream,0);
 for(const method of ['sendTransaction','sendRawTransaction','requestAirdrop','getProgramAccounts'])assert.equal((await request(method)).status,400);
 assert.equal(upstream,0);assert.equal((await request('getBalance',true,'evil')).status,400);
 const read=await request('getBalance');assert.equal(await read.text(),raw);assert.equal(read.headers.get('cache-control'),'no-store');
 assert.equal((await request('simulateTransaction')).status,200);assert.equal(calls[1].method,'simulateTransaction');
 let captured,token='test-token';const original=global.fetch;
 global.fetch=async(url,opts)=>{captured={url,opts};return new Response(raw,{headers:{'Content-Type':'application/json'}})};
 try{
  const {walletRpcs}=load('apps/web/src/lib/wallet-rpc.ts',{'@solana/kit':web('@solana/kit'),'./api':{API_URL:'https://mentions.invalid',getApiAccessToken:async()=>token}});
  const result=await walletRpcs['solana:mainnet'].rpc.getBalance('11111111111111111111111111111111').send();
  assert.equal(result.value,9007199254740993n);assert.equal(String(captured.url),'https://mentions.invalid/v1/wallet-rpc/mainnet');assert.equal(new Headers(captured.opts.headers).get('authorization'),'Bearer test-token');
  token=null;await assert.rejects(walletRpcs['solana:mainnet'].rpc.getBalance('11111111111111111111111111111111').send(),/Reconnect/);
 }finally{global.fetch=original;}
 console.log('PASS: authenticated read/simulation RPC, blocked sends, raw integer precision, bearer-token transport and expired-session rejection');
})().catch(e=>{console.error(e);process.exitCode=1});

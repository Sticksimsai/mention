const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const r=require('node:module').createRequire(path.resolve('apps/api/package.json')),ts=require('../apps/web/node_modules/typescript');
function load(file,mocks){const module={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module,exports:module.exports,require:n=>mocks[n]??r(n),Date,Buffer,URL,URLSearchParams,AbortSignal,fetch:async()=>responses.shift()});return module.exports;}
let responses=[],inserts=0,role='admin',banned=false;
const {Hono}=r('hono'),{HTTPException}=r('hono/http-exception');
const chain=result=>new Proxy({},{get:(_,key)=>key==='then'?(resolve,reject)=>Promise.resolve(result).then(resolve,reject):()=>chain(result)});
const auth={requireAuth:async(c,next)=>{if(!c.req.header('authorization'))throw new HTTPException(401);c.set('user',{id:'user',role,banned});await next();},requireStaff:(c,roles)=>{if(!roles.includes(role))throw new HTTPException(403)},requireNotBanned:()=>{if(banned)throw new HTTPException(403)}};
const db={select:()=>chain([{xUserId:'123'}]),insert:()=>{inserts++;return chain([])},execute:async()=>[]};
const env={X_CLIENT_ID:'client',X_CLIENT_SECRET:'SECRET_DO_NOT_RETURN',X_REDIRECT_URI:'https://api.example.com/v1/x/callback',WEB_ORIGIN:'https://example.com',TOKEN_ENCRYPTION_KEY:'SECRET_DO_NOT_RETURN',PLATFORM_FEE_WALLET:'wallet',SOLANA_RPC_URL:'https://api.mainnet-beta.solana.com',PUMP_LOOKUP_TABLE:'',PAYOUT_MAX_SOL:0,PAYOUT_DAILY_BUDGET_SOL:0,LAUNCH_ENABLED:false,PAYOUTS_ENABLED:false};
const redis={getdel:async()=>JSON.stringify({userId:'user',verifier:'verifier'}),get:async()=>null,lrange:async()=>[]};
const common={'@mention/db':{xConnections:{},users:{},modAuditLog:{},eq:()=>null,desc:()=>null,sql:()=>null},'../auth/middleware.js':auth,'../lib/db.js':{db},'../lib/redis.js':{redis},'../env.js':{env},'../lib/crypto.js':{encrypt:()=>'<encrypted>'}};
const x=new Hono();x.use("*",async(c,next)=>next());x.onError((e,c)=>c.json({error:e.message},e.status??500));x.route('/',load('apps/api/src/routes/x.ts',common).xRoute);
const token=(scope='tweet.write')=>({ok:true,json:async()=>({access_token:'a',refresh_token:'r',scope})});
const who=id=>({ok:true,json:async()=>({data:{id}})});
(async()=>{
 responses=[token(),who('999')];assert.equal((await x.request('http://test/callback?state=s&code=c')).status,403);assert.equal(inserts,0);
 responses=[token('tweet.read')];assert.equal((await x.request('http://test/callback?state=s&code=c')).status,400);assert.equal(inserts,0);
 responses=[token(),{ok:false}];assert.equal((await x.request('http://test/callback?state=s&code=c')).status,502);assert.equal(inserts,0);
 responses=[token(),who('123')];assert.equal((await x.request('http://test/callback?state=s&code=c')).status,302);assert.equal(inserts,1);
 const inner=load('apps/api/src/routes/readiness.ts',{...common,'../lib/money.js':{address:()=>{throw Error('missing')},platformKeypair:()=>{throw Error('missing')},connection:{getSlot:async()=>123}}}).readinessRoute;
 const route=new Hono();route.use("*",async(c,next)=>next());route.onError((e,c)=>c.json({error:e.message},e.status??500));route.route('/',inner);
 assert.equal((await route.request('http://test/')).status,401);
 role='moderator';assert.equal((await route.request('http://test/',{headers:{authorization:'x'}})).status,403);
 role='admin';banned=true;assert.equal((await route.request('http://test/',{headers:{authorization:'x'}})).status,403);
 banned=false;db.select=()=>chain([]);const response=await route.request('http://test/',{headers:{authorization:'x'}});assert.equal(response.status,200);const body=await response.text();assert(!body.includes('SECRET_DO_NOT_RETURN'));const data=JSON.parse(body);assert.equal(data.gates.launch,false);assert.equal(data.gates.markets,false);assert.equal(data.checks.find(c=>c.id==='worker').status,'blocked');
 console.log('OAuth identity/permission rejection and readiness authorization/secret tests passed');
})().catch(e=>{console.error(e);process.exit(1)});

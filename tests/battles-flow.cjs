// Offline route tests. No RPC, signatures, actual proposals or money movement.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const r=require('node:module').createRequire(path.resolve('apps/api/package.json'));
const ts=require('../apps/web/node_modules/typescript');
function load(file,mocks={}){const module={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module,exports:module.exports,require:n=>mocks[n]??r(n),Date,console});return module.exports;}
const shared=load('packages/shared/src/index.ts');
const buy=shared.devBuyUnits(1_000_000_000_000000n,200);
assert.equal(buy,20_000_000_000000n);
assert.equal(shared.battleReserveSplit(buy).reserve,10_000_000_000000n);
for(const n of [0n,1n,99n,100n,101n,buy]){const s=shared.battleReserveSplit(n);assert.equal(s.developer+s.reserve,n);assert(s.reserve===n/2n);}
assert.throws(()=>shared.battleReserveSplit(-1n));
for(const a of ['0','-1','1e5','NaN','1.0000001','1000000000000','.5','01'])assert.throws(()=>shared.tokenAmountUnits(a));
assert.equal(shared.tokenAmountUnits('0.000001'),1n);assert.equal(shared.tokenAmountUnits('100.5'),100500000n);
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222',ID='33333333-3333-4333-8333-333333333333';
const proposal={id:ID,challengerId:A,opponentId:B,challengerAmount:'100',opponentAmount:'200',durationSecs:600,acknowledgeDraft:true};
for(const durationSecs of [600,1800,3600])assert(shared.battleChallengeSchema.safeParse({...proposal,durationSecs}).success);
for(const patch of [{durationSecs:60},{opponentId:A},{acknowledgeDraft:false},{challengerAmount:'0'}])assert(!shared.battleChallengeSchema.safeParse({...proposal,...patch}).success);
const {HTTPException}=r('hono/http-exception');
const tableNames=['battleChallenges','communities','communityMembers'];
const tables=Object.fromEntries(tableNames.map(n=>[n,new Proxy({},{get:(_,k)=>`${n}.${String(k)}`})]));
let results=[],updates=[],inserts=[];
function chain(result){const c=new Proxy({},{get:(_,key)=>key==='then'?(resolve,reject)=>Promise.resolve(result).then(resolve,reject):()=>c});return c;}
const db={select:()=>chain(results.shift()??[]),execute:async()=>{},transaction:async fn=>fn(db),update:()=>({set:values=>{updates.push(values);return{where:()=>({returning:async()=>[{...row,...values}]})}}}),insert:()=>({values:values=>{inserts.push(values);return{returning:async()=>[{...row,...values}]}}})};
let user='owner-b';
const innerRoute=load('apps/api/src/routes/battles.ts',{'@mention/shared':shared,'@mention/db':{...tables,eq:(...a)=>a,and:(...a)=>a,or:(...a)=>a,inArray:(...a)=>a,desc:a=>a,sql:()=>null,ilike:(...a)=>a},'../lib/db.js':{db},'../lib/money.js':{hash:obj=>JSON.stringify(obj)},'../auth/middleware.js':{requireAuth:async(c,next)=>{if(!c.req.header('authorization'))throw new HTTPException(401);c.set('user',{id:user});await next()},requireNotBanned:()=>{},rateLimit:()=>async(c,next)=>next()}}).battlesRoute;
const route=new (r('hono').Hono)();route.use('*',async(c,next)=>next());route.route('/',innerRoute);
route.onError((err,c)=>c.json({error:err.message},err.status??500));
const coins=[{id:A,name:'Alpha',ticker:'ALPHA',ownerId:'owner-a',status:'approved',ca:'a'},{id:B,name:'Beta',ticker:'BETA',ownerId:'owner-b',status:'approved',ca:'b'}];
const row={id:ID,challengerId:A,opponentId:B,createdBy:'owner-a',challengerStakeUnits:'100000000',opponentStakeUnits:'200000000',durationSecs:600,status:'open',rulesVersion:shared.BATTLE_RULES_VERSION,createdAt:new Date(),expiresAt:new Date(Date.now()+86400000),acceptedAt:null};
const send=(action,body={acknowledgeDraft:true,rulesVersion:shared.BATTLE_RULES_VERSION},auth=true)=>route.request(`http://test/${ID}/${action}`,{method:'POST',headers:{'content-type':'application/json',...(auth?{authorization:'test'}:{})},body:JSON.stringify(body)});
(async()=>{
 assert.equal((await send('accept',undefined,false)).status,401);
 assert.equal((await send('accept',{acknowledgeDraft:false})).status,400);
 results=[[row],coins];user='stranger';assert.equal((await send('accept')).status,403);assert.equal(updates.length,0);
 results=[[row],coins];user='owner-a';assert.equal((await send('accept')).status,403);
 results=[[row],coins,coins];user='owner-b';let response=await send('accept');assert.equal(response.status,200);let data=await response.json();assert.equal(data.status,'accepted');assert.equal(data.escrowFunded,false);assert.equal(updates.at(-1).status,'accepted');
 const count=updates.length;results=[[{...row,status:'accepted'}],coins,coins];await send('accept');assert.equal(updates.length,count,'Accept retry must not update twice');
 results=[[{...row,expiresAt:new Date(0)}],coins];assert.equal((await send('accept')).status,409);
 results=[[{...row,rulesVersion:'old'}],coins];assert.equal((await send('accept')).status,409);
 results=[[{...row,status:'accepted'}],coins,coins];user='owner-a';assert.equal((await send('cancel')).status,200);assert.equal(updates.at(-1).status,'cancelled');
 results=[[row],coins];user='stranger';assert.equal((await send('cancel')).status,403);
 results=[[row],[coins[0],{...coins[1],ownerId:'owner-a'}]];user='owner-a';assert.equal((await send('accept')).status,409);
 // Proposal authorization and valid creation.
 const create=()=>route.request('http://test/',{method:'POST',headers:{authorization:'test','content-type':'application/json'},body:JSON.stringify(proposal)});
 results=[[],coins];user='stranger';assert.equal((await create()).status,403);assert.equal(inserts.length,0);
 results=[[],coins,[],coins];user='owner-a';assert.equal((await create()).status,201);assert.equal(inserts.length,1);assert.equal(inserts[0].challengerStakeUnits,'100000000');
 results=[[{...row,requestHash:inserts[0].requestHash}],coins];assert.equal((await create()).status,201);assert.equal(inserts.length,1,'Identical retry reuses proposal');
 results=[[],coins,[row]];assert.equal((await create()).status,409,'Duplicate pair is rejected');
 response=await route.request('http://test/config');assert.equal((await response.json()).executionEnabled,false);
 results=[coins.slice(0,1)];data=await (await route.request(`http://test/community/${A}/reserve`)).json();assert.equal(data.availableUnits,null);assert.equal(data.lockedUnits,null);
 assert.equal((await route.request('http://test/not-a-uuid')).status,400);
 console.log('PASS: exact 50% reserve, 2% dev cap, integer rounding, duration/amount validation, owner permissions, expiry, rule versions, accept/cancel state, idempotent proposals and acceptance, duplicate pair rejection, explicit unfunded reserve.');
})().catch(e=>{console.error(e);process.exitCode=1});

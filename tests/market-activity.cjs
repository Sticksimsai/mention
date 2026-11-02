// Offline public-activity projection tests; no posts, proposals, or funds are created.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const r=require('node:module').createRequire(path.resolve('apps/api/package.json'));
const ts=require('../apps/web/node_modules/typescript');
function load(file,mocks={}){const module={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module,exports:module.exports,require:n=>mocks[n]??r(n),Date,console,Map});return module.exports;}
const table=new Proxy({},{get:(_,k)=>String(k)});
const coins={a:{id:'a',ticker:'A',name:'Alpha',status:'approved'},b:{id:'b',ticker:'B',name:'Beta',status:'approved'},c:{id:'c',ticker:'C',name:'Hidden',status:'pending'}};
const now=Date.now(), date=n=>new Date(now+n);
const base={challengerId:'a',opponentId:'b',createdAt:date(-60000),expiresAt:date(60000),acceptedAt:null,closedAt:null,status:'open'};
let rows=[],queries=0,visibilityChecks=0;
const db={select:({at})=>{queries++;let predicate=()=>true,sort=at,n=30;const q={from:()=>q,where:p=>(predicate=p,q),orderBy:k=>(sort=k,q),limit:l=>(n=l,q),then:(resolve,reject)=>Promise.resolve(rows.filter(predicate).sort((a,b)=>b[sort]-a[sort]).slice(0,n).map(row=>({row,at:row[at]}))).then(resolve,reject)};return q;}};
const orm={battleChallenges:table,communities:table,and:(...ps)=>row=>ps.filter(Boolean).every(p=>p(row)),or:(...ps)=>row=>ps.filter(Boolean).some(p=>p(row)),eq:(k,v)=>row=>row[k]===v,lt:(k,v)=>row=>row[k]!=null&&row[k]<v,desc:k=>k,inArray:(k,vs)=>row=>vs.includes(row[k]),sql:(strings)=>{assert(strings.join('').includes("'approved'"));return row=>{visibilityChecks++;return coins[row.challengerId]?.status==='approved'&&coins[row.opponentId]?.status==='approved';}}};
const {marketActivity}=load('apps/api/src/lib/market-activity.ts',{'@mention/db':orm,'./db.js':{db},'../routes/battles.js':{battleViews:async rs=>rs.map(row=>({...row,challenger:coins[row.challengerId],opponent:coins[row.opponentId],escrowFunded:false}))}});
(async()=>{
 rows=[{...base,id:'new'},{...base,id:'agreed',acceptedAt:date(-20000),status:'accepted'},{...base,id:'closed',acceptedAt:date(-30000),closedAt:date(-10000),status:'cancelled'},{...base,id:'expired',expiresAt:date(-15000)},{...base,id:'hidden',opponentId:'c'}];
 let out=await marketActivity({before:date(1000)});
 assert.equal(out[0].event,'cancelled');assert.equal(out.length,8);assert.equal(new Set(out.map(x=>x.id)).size,8);
 assert(!out.some(x=>x.battle.id==='hidden'));assert(out.every(x=>x.source==='market'&&!x.battle.escrowFunded));
 assert.equal(out.filter(x=>x.event==='expired').length,1,'Only unfunded, expired open proposals expire');
 assert(out.every((x,i)=>!i||out[i-1].createdAt>=x.createdAt));
 out=await marketActivity({before:date(-20000)});assert(out.every(x=>new Date(x.createdAt)<date(-20000)),'Cursor boundary excludes newer updates');
 assert.equal((await marketActivity({before:date(1000),communityId:'c'})).length,0);
 assert.equal((await marketActivity({before:date(1000),communityIds:['b']})).length,8,'Either participating community qualifies');
 const count=queries;assert.equal((await marketActivity({before:date(1000),authorUsername:'someone'})).length,0);assert.equal((await marketActivity({before:date(1000),communityIds:[]})).length,0);assert.equal(queries,count,'No system events on personal profiles or empty joined feeds');
 rows=Array.from({length:40},(_,i)=>({...base,id:String(i),createdAt:date(-i*1000-1000)}));assert.equal((await marketActivity({before:date(1000)})).length,30);assert(visibilityChecks>0);
 console.log('PASS: real lifecycle updates, approval visibility, community/joined scope, profile exclusion, chronological ordering, unique event IDs, cursor boundary, bounded page size; no writes.');
})().catch(e=>{console.error(e);process.exitCode=1});

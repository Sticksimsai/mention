const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const r=require('node:module').createRequire(path.resolve('apps/api/package.json')),ts=require('../apps/web/node_modules/typescript');
function load(file,mocks={}){const module={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module,exports:module.exports,require:n=>mocks[n]??r(n),Date,console});return module.exports;}
const shared=load('packages/shared/src/index.ts'),u={id:'local',username:'mentions',xUserId:'123'},p={screen_name:'Mentions',id_str:'123',verified:true};
assert.equal(shared.parseXVerification(p,u),true);
assert.equal(shared.parseXVerification({...p,verified:false},u),false);
assert.equal(shared.parseXVerification({...p,is_blue_verified:false},u),false);
for(const data of [{...p,id_str:'other'},{...p,screen_name:'impostor'},{...p,verified:'true'},{}])assert.throws(()=>shared.parseXVerification(data,u));
const cache=new Map();let supplied=p,fetches=0;
const redis={get:async k=>cache.get(k)??null,set:async(k,v,...args)=>{if(args.includes('NX')&&cache.has(k))return null;cache.set(k,v);return 'OK'}};
const job=load('apps/worker/src/jobs/xProfile.ts',{'@mention/shared':shared,'@mention/db':{users:{},eq:()=>null},'../lib/context.js':{redis,db:{select:()=>({from:()=>({where:async()=>[u]})})}},'../lib/socialdata.js':{fetchUserProfile:async(_,id)=>{fetches++;assert.equal(id,'123');if(supplied instanceof Error)throw supplied;return supplied;}}}).xProfileJob;
const api=load('apps/api/src/lib/x-verification.ts',{'@mention/shared':shared,'./redis.js':{redis,queues:{xProfile:{add:async()=>job(u.id)}}}}).xVerification;
(async()=>{
 await api(u);assert.equal(JSON.parse(cache.get(shared.xVerificationKey(u))).status,'verified','Fast worker result cannot be overwritten by pending state');
 assert.equal((await api(u)).status,'verified');assert.equal(fetches,1,'Cached views do not call provider repeatedly');
 supplied={...p,verified:false};await job(u.id);assert.equal((await api(u)).status,'unverified','Revoked badge disappears');
 supplied=new Error('Provider unavailable');await job(u.id);assert.equal((await api(u)).status,'unavailable','Provider failures never invent verification');
 supplied={...p,id_str:'999'};await job(u.id);assert.equal((await api(u)).status,'unavailable','Account mismatch never grants badge');
 console.log('PASS: verified/unverified parsing, identity binding, strict booleans, cache reuse, queue race, badge revocation and provider failure handling.');
})().catch(e=>{console.error(e);process.exitCode=1});

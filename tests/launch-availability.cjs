// Read/write authorization and hidden-parent protection, with isolated database doubles.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const r=require('node:module').createRequire(path.resolve('apps/api/package.json'));
const ts=require('../apps/web/node_modules/typescript');
function load(file,mocks={}){const module={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,{module,exports:module.exports,require:n=>mocks[n]??(n.startsWith('.')?load(path.resolve(path.dirname(file),n.replace(/\.js$/,'.ts')),mocks):n==='twitter-text'?require('node:module').createRequire(path.resolve('packages/shared/package.json'))(n):r(n)),Date,console,Buffer,URL});return module.exports;}
const shared=load('packages/shared/src/index.ts');const {Hono}=r('hono'),{HTTPException}=r('hono/http-exception');

const env={LAUNCH_ENABLED:true,PLATFORM_CREATOR_FEE_SHARE_BPS:5000};
let configured=false, reads=0, rows=[];const limits=[];
const route=load('apps/api/src/routes/launch.ts',{
 '@mention/shared':shared,'@mention/db':{moneyOperations:{id:'id',kind:'kind'},eq:(...x)=>x,and:(...x)=>x},'../env.js':{env},
 '../lib/db.js':{db:{select(){reads++;return {from:()=>({where:async()=>rows})};}}},
 '../lib/launch-builder.js':{buildLaunch(){throw new Error('Must not build a transaction');}},
 '../lib/money.js':{address:x=>x,platformKeypair(){if(!configured)throw new Error('secret must never leak');return {publicKey:'treasury'};}},
 '../auth/middleware.js':{requireAuth:async(c,next)=>{c.set('user',{id:'test'});await next()},requireNotBanned(){},rateLimit(...args){limits.push(args);return async(c,next)=>next();}}
}).launchRoute;
(async()=>{
 let config=await (await route.request('/config')).json();
 assert(config.unavailableReasons.fair);
 assert.equal(config.unavailableReasons.holders,null);
 assert(!JSON.stringify(config).includes('secret must never leak'));
 configured=true;config=await (await route.request('/config')).json();
 assert(config.unavailableReasons.fair);assert(config.unavailableReasons.battle);
 env.LAUNCH_ENABLED=false;config=await (await route.request('/config')).json();
 assert(config.unavailableReasons.holders);assert(config.unavailableReasons.creator);
 env.LAUNCH_ENABLED=true;env.PLATFORM_CREATOR_FEE_SHARE_BPS=10001;
 config=await (await route.request('/config')).json();assert.equal(config.unavailableReasons.holders,null);assert.deepEqual(Array.from(config.pairs,p=>p.id),["SOL"]);assert.equal(config.devBuyEnabled,false);
 assert.equal(reads,0);assert(limits.some(([bucket,count,secs])=>bucket==='launch-prepare-v2'&&count===6&&secs===60));
 const id='11111111-1111-4111-8111-111111111111';
 assert.equal((await route.request('/metadata/'+id)).status,404);
 rows=[{details:JSON.stringify({name:'Test coin',ticker:'test',description:'Community',imageUrl:'https://assets.test/image',website:'https://getmentions.xyz/t/test',twitterUrl:'https://x.com/test',fundingWallet:'private-field',creatorWallet:'private-field',transaction:'must-not-leak'})}];
 const meta=await route.request('/metadata/'+id);assert.equal(meta.status,200);
 const body=await meta.json();assert.equal(body.symbol,'TEST');assert.equal(body.external_url,'https://getmentions.xyz/t/test');assert.equal(body.image,'https://assets.test/image');assert(!JSON.stringify(body).includes('private-field'));assert(!JSON.stringify(body).includes('must-not-leak'));
 assert.equal((await route.request('/metadata/not-a-uuid')).status,404);
 console.log('PASS: public metadata, missing IDs and private-field isolation');
 console.log('PASS: launch mode availability, missing treasury, invalid fee split, closed gate and secret-safe diagnostics');
})().catch(e=>{console.error(e);process.exit(1)});

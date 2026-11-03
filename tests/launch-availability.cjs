// Read/write authorization and hidden-parent protection, with isolated database doubles.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const r=require('node:module').createRequire(path.resolve('apps/api/package.json'));
const ts=require('../apps/web/node_modules/typescript');
function load(file,mocks={}){const module={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,{module,exports:module.exports,require:n=>mocks[n]??(n.startsWith('.')?load(path.resolve(path.dirname(file),n.replace(/\.js$/,'.ts')),mocks):n==='twitter-text'?require('node:module').createRequire(path.resolve('packages/shared/package.json'))(n):r(n)),Date,console,Buffer,URL});return module.exports;}
const shared=load('packages/shared/src/index.ts');const {Hono}=r('hono'),{HTTPException}=r('hono/http-exception');

const env={LAUNCH_ENABLED:true,PLATFORM_CREATOR_FEE_SHARE_BPS:5000};
let configured=false, reads=0;const limits=[];
const route=load('apps/api/src/routes/launch.ts',{
 '@mention/shared':shared,'@mention/db':{},'../env.js':{env},
 '../lib/db.js':{db:{select(){reads++;throw new Error('Unexpected database access');}}},
 '../lib/launch-builder.js':{buildLaunch(){throw new Error('Must not build a transaction');}},
 '../lib/money.js':{address:x=>x,platformKeypair(){if(!configured)throw new Error('secret must never leak');return {publicKey:'treasury'};}},
 '../auth/middleware.js':{requireAuth:async(c,next)=>{c.set('user',{id:'test'});await next()},requireNotBanned(){},rateLimit(...args){limits.push(args);return async(c,next)=>next();}}
}).launchRoute;
(async()=>{
 let config=await (await route.request('/config')).json();
 assert.match(config.unavailableReasons.fair,/PLATFORM_WALLET_SECRET/);
 assert.equal(config.unavailableReasons.holders,null);
 assert(!JSON.stringify(config).includes('secret must never leak'));
 configured=true;config=await (await route.request('/config')).json();
 assert.equal(config.unavailableReasons.fair,null);assert(config.unavailableReasons.battle);
 env.LAUNCH_ENABLED=false;config=await (await route.request('/config')).json();
 assert(config.unavailableReasons.holders);assert(config.unavailableReasons.creator);
 env.LAUNCH_ENABLED=true;env.PLATFORM_CREATOR_FEE_SHARE_BPS=10001;
 config=await (await route.request('/config')).json();assert.match(config.unavailableReasons.creator,/split/);
 assert.equal(reads,0);assert(limits.some(([bucket,count,secs])=>bucket==='launch-prepare-v2'&&count===6&&secs===60));
 console.log('PASS: launch mode availability, missing treasury, invalid fee split, closed gate and secret-safe diagnostics');
})().catch(e=>{console.error(e);process.exit(1)});

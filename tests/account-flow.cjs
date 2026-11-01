// Run: node tests/account-flow.cjs
// Exercise the API client and route behavior with isolated HTTP/DB/RPC doubles.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('../apps/web/node_modules/typescript');
function load(file, deps, globals = {}) {
  const out = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const exports = {};
  vm.runInNewContext(out, { exports, require: name => { if (!(name in deps)) throw Error(`Unexpected dependency: ${name}`); return deps[name]; }, process: { env: {} }, URLSearchParams, Date, Promise, AbortSignal, ...globals });
  return exports;
}
(async () => {
  const calls = [];
  const client = load('apps/web/src/lib/api.ts', {}, { fetch: async (url, init) => { calls.push({url, init}); return { ok: true, json: async () => ({ok:true}) }; } });
  client.registerTokenGetter(async () => 'session-token');
  await client.api('/me');
  assert.equal(calls.at(-1).init.headers.Authorization, 'Bearer session-token');
  await client.api('/me', { token: 'fresh-login-token' });
  assert.equal(calls.at(-1).init.headers.Authorization, 'Bearer fresh-login-token');
  await client.api('/public', { auth: false });
  assert.equal(calls.at(-1).init.headers.Authorization, undefined);
  await client.api('/me', { token: null });
  assert.equal(calls.at(-1).init.headers.Authorization, undefined);
  const apiRequire = require('node:module').createRequire(require('node:path').resolve('apps/api/package.json'));
  const {Hono} = apiRequire('hono');
  const {HTTPException} = apiRequire('hono/http-exception');
  let rpcFails = false, historyFails = false, rpcReads = 0, cache = null;
  const tables = Object.fromEntries(['users','follows','communities','communityMembers','xConnections','posts'].map(n=>[n, new Proxy({}, {get:(_,key)=>`${n}.${String(key)}`})]));
  const results = [[{id:'viewer',username:'maya',displayName:'Maya',createdAt:new Date(),pfpUrl:'',bannerUrl:'',bio:''}], [{n:7}], [{n:4}], [{n:2}], [{id:'owned',name:'Owned',ticker:'OWN',pfpUrl:''}], [{id:'joined',name:'Joined',ticker:'JOIN',pfpUrl:'',membersCount:12,ownerId:'viewer'}], [{n:5}]];
  const conditions=[];
  const db = { select: () => { const result=results.shift(); const chain = new Proxy({}, { get: (_,prop) => prop==='then' ? (resolve,reject)=>Promise.resolve(result).then(resolve,reject) : (...args)=>{if(prop==='where')conditions.push(args[0]);return chain;} }); return chain; } };
  const route = load('apps/api/src/routes/users.ts', {
    'hono': {Hono}, 'hono/http-exception': {HTTPException},
    '@hono/zod-validator': {zValidator:()=>async(_,next)=>next()},
    '@mention/shared': {updateProfileSchema:{}},
    '@mention/db': {...tables,eq:(a,b)=>({eq:[a,b]}),and:(...args)=>({and:args}),count:()=>0,desc:x=>x},
    '../lib/db.js':{db}, '../env.js':{env:{SOLANA_RPC_URL:'https://rpc.example.invalid'}},
    '../lib/redis.js':{redis:{get:async()=>cache,set:async(_key,value)=>{cache=value}}},
    '../auth/middleware.js':{
      requireAuth:async(c,next)=>{if(!c.req.header('authorization'))throw new HTTPException(401);c.set('user',{id:'viewer'});await next()},
      requireNotBanned:()=>{}, rateLimit:()=>async(_,next)=>next(),
    },
    '@solana/web3.js':{
      LAMPORTS_PER_SOL:1e9,
      PublicKey:class {constructor(address){if(address!=='valid-address')throw Error('bad address');this.address=address}toBase58(){return this.address}},
      Connection:class {async getBalance(){rpcReads++;if(rpcFails)throw Error('down');return 1500000000}async getSignaturesForAddress(){if(historyFails)throw Error('down');return [{signature:'tx',blockTime:123,err:null}]}},
    },
  }).usersRoute;
  assert.equal((await route.request('http://local/me/wallet?address=valid-address')).status,401);
  const headers={authorization:'Bearer test'};
  assert.equal((await route.request('http://local/me/wallet?address=bad',{headers})).status,400);
  let response=await route.request('http://local/me/wallet?address=valid-address',{headers});
  assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'private, no-store');
  let data=await response.json();assert.equal(data.balanceSol,1.5);assert.equal(data.transactions[0].failed,false);
  await route.request('http://local/me/wallet?address=valid-address',{headers});assert.equal(rpcReads,1);
  cache=null;historyFails=true;data=await (await route.request('http://local/me/wallet?address=valid-address',{headers})).json();assert.equal(data.balanceSol,1.5);assert.equal(data.historyAvailable,false);
  cache=null;rpcFails=true;assert.equal((await route.request('http://local/me/wallet?address=valid-address',{headers})).status,503);
  data=await (await route.request('http://local/maya')).json();assert.equal(data.followers,7);assert.equal(data.tribes,2);assert.equal(data.postCount,5);assert.equal(data.joinedCommunities[0].isOwner,true);assert.equal('ownerId' in data.joinedCommunities[0],false);
  assert(conditions.some(c=>JSON.stringify(c).includes('posts.hidden')),'Hidden posts excluded from statistics');
  const webRequire = require('node:module').createRequire(require('node:path').resolve('apps/web/package.json'));
  const React = webRequire('react');
  const {renderToStaticMarkup} = webRequire('react-dom/server');
  let viewer = {id:'viewer',username:'maya',displayName:'Maya',pfpUrl:'https://example.test/avatar.png'};
  let profileState = {data:{...data,createdAt:'2026-11-01T00:00:00Z'},isPending:false,isError:false};
  const frontendDeps = {
    'react':React,'react/jsx-runtime':webRequire('react/jsx-runtime'),
    'next/link':{default:props=>React.createElement('a',props,props.children)},
    'next/navigation':{useParams:()=>({username:'maya'})},
    '@tanstack/react-query':{useQuery:()=>profileState,useMutation:()=>({}),useQueryClient:()=>({})},
    '@/components/Shell':{Shell:({children})=>React.createElement('main',null,children)},
    '@/components/Feed':{Feed:()=>React.createElement('div',null,'Public feed')},
    '@/components/WalletCard':{WalletCard:()=>React.createElement('div',null,'PRIVATE WALLET')},
    '@/components/Modal':{Modal:({open,children})=>open?React.createElement('div',null,children):null},
    '@/lib/api':{api:()=>{},ApiError:client.ApiError},
    '@/lib/hooks':{useMe:()=>({me:viewer,ready:true,authenticated:Boolean(viewer),login:()=>{},logout:async()=>{}})},
  };
  const Profile=load('apps/web/src/app/u/[username]/page.tsx',frontendDeps).default;
  let html=renderToStaticMarkup(React.createElement(Profile));
  assert(html.includes('Wallet &amp; activity'));assert(html.includes('Edit profile'));
  viewer={id:'someone-else'};
  html=renderToStaticMarkup(React.createElement(Profile));
  assert(!html.includes('Wallet &amp; activity'));assert(!html.includes('Edit profile'));assert(!html.includes('PRIVATE WALLET'));
  viewer=null;
  html=renderToStaticMarkup(React.createElement(Profile));assert(!html.includes('Wallet &amp; activity'));
  viewer={id:'viewer',username:'maya',displayName:'Maya',pfpUrl:'https://example.test/avatar.png'};
  const {AccountButton}=load('apps/web/src/components/AccountButton.tsx',frontendDeps);
  html=renderToStaticMarkup(React.createElement(AccountButton));assert(html.includes('href="/u/maya"'));assert(html.includes('https://example.test/avatar.png'));assert(html.includes('@maya'));
  console.log('PASS: profile owner-only controls, public/anonymous wallet privacy, clickable X identity and avatar.');
  console.log('PASS: token selection, authenticated wallet route, invalid address, balance, cache, partial history failure, RPC failure, profile counts and community role.');
})().catch(e=>{console.error(e);process.exitCode=1});

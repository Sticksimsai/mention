// Offline: real Ed25519 signatures and real session tokens; in-memory Redis and DB. No network, no transactions.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),crypto=require('node:crypto');
const r=require('node:module').createRequire(path.resolve('apps/api/package.json')),ts=require('node:module').createRequire(path.resolve('apps/web/package.json'))('typescript');
const web3=r('@solana/web3.js'),{Hono}=r('hono'),{HTTPException}=r('hono/http-exception'),jose=r('jose');
function load(file,mocks){const module={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,{module,exports:module.exports,require:n=>mocks[n]??r(n),Buffer,URL,Date,Math,console,Uint8Array,Response,Promise,TextEncoder});return module.exports;}

const store=new Map(),redis={get:async k=>store.get(k)??null,set:async(k,v)=>{store.set(k,v)},del:async k=>{store.delete(k)},incr:async()=>1,expire:async()=>{}};
const env={TOKEN_ENCRYPTION_KEY:'test-encryption-key',PRIVY_APP_SECRET:'privy-secret',WEB_ORIGIN:'https://memes.test'};
const wallet=load('apps/api/src/auth/wallet.ts',{'../env.js':{env},'../lib/redis.js':{redis}});

function signer(){const pair=crypto.generateKeyPairSync('ed25519');const raw=pair.publicKey.export({format:'der',type:'spki'}).subarray(12);return{address:new web3.PublicKey(raw).toBase58(),sign:message=>new Uint8Array(crypto.sign(null,Buffer.from(message,'utf8'),pair.privateKey))};}

// Users table stand-in for the middleware: rows keyed by privy_user_id.
const rows=[];let inserts=0;
const tables={users:{privyUserId:'privyUserId',id:'id'},staffRoles:{userId:'staff.userId'},bannedUsers:{userId:'banned.userId'}};
const chain=result=>{const c={from:()=>c,where:()=>c,then:(resolve,reject)=>Promise.resolve(result()).then(resolve,reject)};return c;};
let lookup;
const db={
 select:()=>{const c={from:t=>{c.table=t;return c},where:f=>{c.filter=f;return c},then:(resolve,reject)=>Promise.resolve(c.table===tables.users?rows.filter(u=>u.privyUserId===lookup):[]).then(resolve,reject)};return c;},
 insert:()=>({values:v=>({onConflictDoNothing:()=>({returning:async()=>{if(rows.some(u=>u.username===v.username||u.privyUserId===v.privyUserId))return[];inserts++;const row={id:'user-'+rows.length,pfpUrl:'',...v};rows.push(row);return[row];}})})}),
};
let privyCalls=0;
const middleware=load('apps/api/src/auth/middleware.ts',{'../lib/db.js':{db},'../lib/redis.js':{redis},'@mention/db':{...tables,eq:(column,value)=>{if(column==='privyUserId')lookup=value;return[column,value];}},'./privy.js':{privyConfigured:true,verifyPrivyToken:async()=>{privyCalls++;throw Error('not a Privy token')}},'./wallet.js':wallet});

(async()=>{
 const alice=signer(),mallory=signer();
 assert.throws(()=>wallet.walletAddress('not-an-address'));assert.equal(wallet.walletAddress(alice.address),alice.address);

 // Challenge: bound to the address, names the site, and promises no transaction.
 const message=await wallet.createChallenge(alice.address);
 assert(message.startsWith('memes.test wants you to sign in with your Solana wallet:\n'+alice.address));assert.match(message,/does not send a transaction/);assert.match(message,/Nonce: [0-9a-f]{32}/);
 assert.notEqual(await wallet.createChallenge(mallory.address),message,'Each challenge carries its own nonce');

 // Only the wallet named in the challenge can complete it, and only once.
 await wallet.createChallenge(alice.address);const current=store.get('wallet-challenge:'+alice.address);
 assert.equal(await wallet.consumeChallenge(alice.address,mallory.sign(current)),false,'Another wallet cannot sign in as this address');
 assert.equal(store.has('wallet-challenge:'+alice.address),false,'A failed attempt burns the challenge');
 await wallet.createChallenge(alice.address);const fresh=store.get('wallet-challenge:'+alice.address);
 assert.equal(await wallet.consumeChallenge(alice.address,alice.sign(fresh+' ')),false,'A signature over different text is rejected');
 await wallet.createChallenge(alice.address);const valid=store.get('wallet-challenge:'+alice.address),signature=alice.sign(valid);
 assert.equal(await wallet.consumeChallenge(alice.address,signature),true);
 assert.equal(await wallet.consumeChallenge(alice.address,signature),false,'A challenge cannot be replayed');
 assert.equal(wallet.verifyWalletSignature(alice.address,valid,new Uint8Array(10)),false);

 // Sessions: only tokens minted here with the right key, issuer and algorithm are accepted.
 const session=await wallet.issueWalletSession(alice.address);
 assert.equal(await wallet.verifyWalletSession(session.token),alice.address);assert(session.expiresAt>Date.now()+11*3600000&&session.expiresAt<Date.now()+13*3600000);
 await assert.rejects(wallet.verifyWalletSession(session.token.slice(0,-3)+'abc'));
 const forged=await new jose.SignJWT({}).setProtectedHeader({alg:'HS256'}).setIssuer('memes-wallet').setSubject(alice.address).setExpirationTime('1h').sign(Buffer.from('some-other-key-some-other-key-32b'));
 await assert.rejects(wallet.verifyWalletSession(forged),'A token signed with another key is rejected');
 const expired=await new jose.SignJWT({}).setProtectedHeader({alg:'HS256'}).setIssuer('memes-wallet').setSubject(alice.address).setExpirationTime(Math.floor(Date.now()/1000)-60).sign(crypto.createHash('sha256').update('memes-wallet-session-v1:'+env.TOKEN_ENCRYPTION_KEY).digest());
 await assert.rejects(wallet.verifyWalletSession(expired),'Expired sessions are rejected');

 // Middleware: wallet sessions pass requireAuthOrWallet only; requireAuth stays X-only.
 const app=new Hono();app.onError((e,c)=>c.json({error:e.message},e.status??500));
 app.get('/launch',middleware.requireAuthOrWallet,c=>c.json(c.get('user')));
 app.get('/post',middleware.requireAuth,c=>c.json(c.get('user')));
 const call=(route,token)=>app.request(route,{headers:token?{authorization:'Bearer '+token}:{}});
 assert.equal((await call('/launch')).status,401);
 const first=await call('/launch',session.token);assert.equal(first.status,200);const user=await first.json();
 assert.equal(user.wallet,alice.address);assert.equal(user.role,null);assert.match(user.username,/^sol_[a-z0-9]{12}$/);assert.equal(rows[0].privyUserId,'wallet:'+alice.address);assert.equal(privyCalls,0);
 store.delete('authed:wallet:'+alice.address);assert.equal((await (await call('/launch',session.token)).json()).id,user.id,'The same wallet keeps one account');assert.equal(inserts,1);
 assert.equal((await call('/post',session.token)).status,401,'A wallet session cannot reach X-only routes');assert.equal(privyCalls,1);
 assert.equal((await call('/launch',forged)).status,401);assert.equal((await call('/launch',expired)).status,401);
 assert.equal((await call('/launch','not-a-jwt')).status,401,'Anything else falls through to the X sign-in check');

 // Wallet sessions share an upload budget per network address; X accounts are not affected by it.
 {let counter=0;redis.incr=async()=>++counter;const limited=new Hono();limited.onError((e,c)=>c.json({error:e.message},e.status??500));
  limited.get('/w',async(c,next)=>{c.set('user',{id:'w',wallet:alice.address});await next()},middleware.walletIpRateLimit('uploads',2,60),c=>c.text('ok'));
  limited.get('/x',async(c,next)=>{c.set('user',{id:'x'});await next()},middleware.walletIpRateLimit('uploads',2,60),c=>c.text('ok'));
  assert.equal((await limited.request('/w')).status,200);assert.equal((await limited.request('/w')).status,200);assert.equal((await limited.request('/w')).status,429);
  assert.equal((await limited.request('/x')).status,200,'X accounts skip the wallet limit');assert.equal(counter,3);redis.incr=async()=>1;}
 // Without Privy configured, X-only routes answer 503 (not a crash); wallet sessions keep working.
 {const noPrivy=load('apps/api/src/auth/middleware.ts',{'../lib/db.js':{db},'../lib/redis.js':{redis},'@mention/db':{...tables,eq:(column,value)=>{if(column==='privyUserId')lookup=value;return[column,value];}},'./privy.js':{privyConfigured:false,verifyPrivyToken:async()=>{throw Error('must not be called')}},'./wallet.js':wallet});
  const off=new Hono();off.onError((e,c)=>c.json({error:e.message},e.status??500));
  off.get('/post',noPrivy.requireAuth,c=>c.text('ok'));off.get('/launch',noPrivy.requireAuthOrWallet,c=>c.text('ok'));
  const refused=await off.request('/post',{headers:{authorization:'Bearer some.privy.token'}});assert.equal(refused.status,503);assert.match((await refused.json()).error,/not available yet/);
  assert.equal((await off.request('/launch',{headers:{authorization:'Bearer '+session.token}})).status,200,'Wallet launches work without Privy');}
 // Wallet sessions refuse to sign with a key derived from an empty secret.
 {const blank=load('apps/api/src/auth/wallet.ts',{'../env.js':{env:{TOKEN_ENCRYPTION_KEY:'',PRIVY_APP_SECRET:'',WEB_ORIGIN:'https://memes.test'}},'../lib/redis.js':{redis}});
  await assert.rejects(blank.issueWalletSession(alice.address),/TOKEN_ENCRYPTION_KEY/);await assert.rejects(blank.verifyWalletSession(session.token),/TOKEN_ENCRYPTION_KEY/);}
 // The launch route must only let a wallet session fund from its own address.
 const launchSource=fs.readFileSync('apps/api/src/routes/launch.ts','utf8');
 assert(launchSource.includes('launchRoute.use("*",requireAuthOrWallet)'));assert(launchSource.includes('user.wallet&&body.fundingWallet!==user.wallet'));
 for(const file of ['posts.ts','communities.ts','users.ts','trade.ts'])assert(!fs.readFileSync('apps/api/src/routes/'+file,'utf8').includes('requireAuthOrWallet'),file+' stays X-only');
 console.log('PASS: wallet challenge binding, single use, signature checks, session tokens, launch-only scope and one account per wallet');
})().catch(e=>{console.error(e);process.exitCode=1});

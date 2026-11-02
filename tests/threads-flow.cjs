// Read/write authorization and hidden-parent protection, with isolated database doubles.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const r=require('node:module').createRequire(path.resolve('apps/api/package.json'));
const ts=require('../apps/web/node_modules/typescript');
function load(file,mocks={}){const module={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module,exports:module.exports,require:n=>mocks[n]??r(n),Date,console});return module.exports;}
const shared=load('packages/shared/src/index.ts');const {Hono}=r('hono'),{HTTPException}=r('hono/http-exception');
const names=['posts','postLikes','postReposts','postReplies','xPosts','xPostLikes','xPostReposts','xPostReplies','xPostCommunities','communities','communityMembers','xConnections','users'];
const tables=Object.fromEntries(names.map(n=>[n,new Proxy({},{get:(_,k)=>`${n}.${String(k)}`})]));
let results=[],writes=0,filters=[];
function chain(result){const c=new Proxy({},{get:(_,k)=>k==='then'?(resolve,reject)=>Promise.resolve(result).then(resolve,reject):(...args)=>{if(k==='where')filters.push(args);return c;}});return c;}
const db={select:()=>chain(results.shift()??[]),transaction:async fn=>fn(db),insert:()=>({values:row=>{writes++;return {returning:async()=>[{id:'22222222-2222-4222-8222-222222222222',...row}],then:(resolve,reject)=>Promise.resolve().then(resolve,reject)}}}),update:()=>({set:()=>({where:async()=>{writes++}})})};
const post={id:'n:11111111-1111-4111-8111-111111111111',communityId:'community',replies:3};
const inner=load('apps/api/src/routes/posts.ts',{'@mention/shared':shared,'./feed.js':{visiblePost:async(source,id)=>{const rows=results.shift()??[];if(!rows.length)throw new HTTPException(404);return {...post,source}},decorate:async p=>p},'../lib/stickers.js':{stickerPack:async()=>[]},'@mention/db':{...tables,eq:(...a)=>a,and:(...a)=>a,or:(...a)=>a,isNull:a=>a,desc:a=>a,sql:()=>null},'../lib/db.js':{db},'../lib/redis.js':{redis:{del:async()=>{}},queues:{}},'../auth/middleware.js':{requireAuth:async(c,next)=>{if(!c.req.header('authorization'))throw new HTTPException(401);c.set('user',{id:'viewer'});await next()},requireNotBanned:()=>{},rateLimit:()=>async(c,next)=>next()}}).postsRoute;
const route=new Hono();route.use('*',async(c,next)=>next());route.route('/',inner);route.onError((e,c)=>c.json({error:e.message},e.status??500));
const uri=`http://test/${post.id}`;const row={p:{},u:{},c:{id:'community'}};
(async()=>{
 results=[[row]];assert.equal((await route.request(uri)).status,200,'Public thread is readable without login');
 results=[[row],[]];assert.equal((await route.request(`${uri}/replies`)).status,200,'Public replies are readable');
 const submit=auth=>route.request(`${uri}/replies`,{method:'POST',headers:{'content-type':'application/json',...(auth?{authorization:'test'}:{})},body:JSON.stringify({content:'Hello'})});
 assert.equal((await submit(false)).status,401);assert.equal(writes,0);
 results=[[]];assert.equal((await submit(true)).status,404);assert.equal(writes,0,'Cannot reply to a hidden or missing parent');
 results=[[row]];assert.equal((await submit(true)).status,201);assert.equal(writes,2,'Reply and native counter both persisted');
 results=[[]];assert.equal((await route.request(`${uri}/replies`)).status,404,'Hidden thread replies do not leak');
 assert.equal((await route.request('http://test/n:not-a-uuid')).status,400);
 results=[[row]];const xuri=uri.replace('/n:','/x:');const xreply=await route.request(xuri+'/replies',{method:'POST',headers:{'content-type':'application/json',authorization:'test'},body:JSON.stringify({content:'X reply'})});assert.equal(xreply.status,201);assert.equal(writes,4,'X reply and its native counter persisted atomically');

 const create=body=>route.request('http://test/',{method:'POST',headers:{'content-type':'application/json',authorization:'test'},body:JSON.stringify(body)});
 let n=writes;assert.equal((await create({content:'Not official'})).status,403);assert.equal(writes,n,'Ordinary user cannot post unscoped official updates');
 results=[[row]];assert.equal((await create({content:'My take',quotePostId:post.id})).status,201,'Ordinary user can publish a visible quote');
 n=writes;results=[[]];assert.equal((await create({content:'Hidden quote',quotePostId:post.id})).status,404);assert.equal(writes,n);
 results=[[row]];assert.equal((await create({content:'My take',quotePostId:post.id,crosspostToX:true})).status,400,'No silently incomplete X quote');
 results=[[row]];assert.equal((await create({content:'My take',quotePostId:post.id,stickerId:'foreign'})).status,400,'Reject sticker outside its community');
 assert(!shared.createPostSchema.safeParse({content:'hello',mediaUrl:'javascript:alert(1)'}).success);
 assert(!shared.stickerSchema.safeParse({label:'gm',glyph:'bad',color:'red'}).success);
 const pack=shared.starterStickers({id:'community-a',ticker:'SOL'});assert.equal(pack.length,6);assert(pack.every(s=>s.communityId==='community-a'&&s.ticker==='SOL'));
 console.log('PASS: public thread/replies, authenticated writes, UUID validation, hidden-parent protection, atomic native and X reply counts.');
})().catch(e=>{console.error(e);process.exitCode=1});

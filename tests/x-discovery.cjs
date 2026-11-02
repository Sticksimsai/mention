const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const r=require('node:module').createRequire(path.resolve('apps/api/package.json')),ts=require('../apps/web/node_modules/typescript');
function load(file,mocks={}){const module={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module,exports:module.exports,require:n=>mocks[n]??r(n),Date,console,URLSearchParams,Error});return module.exports;}
const table=new Proxy({},{get:(_,k)=>k});const orm={communities:table,users:table,xPosts:table,xPostCommunities:table,posts:table,eq:()=>true,sql:()=>true};
const mirror=load('apps/worker/src/lib/mirror.ts',{'@mention/db':orm,'./context.js':{db:{}}});
const ca='So11111111111111111111111111111111111111112';const community={id:'coin',ticker:'TEST',ca,status:'approved'};
assert.equal(mirror.matchingCommunities('$TEST is here',[community]).length,1);assert.equal(mirror.matchingCommunities('$test!',[community]).length,1);
assert.equal(mirror.matchingCommunities('$TESTING',[community]).length,0);assert.equal(mirror.matchingCommunities('TEST',[community]).length,0);
assert.equal(mirror.matchingCommunities(ca,[community]).length,1);assert.equal(mirror.matchingCommunities(ca.toLowerCase(),[community]).length,0);assert.equal(mirror.matchingCommunities('a'+ca,[community]).length,0);
assert.equal(mirror.matchingCommunities(`${ca} $OTHER`,[community,{id:'other',ticker:'OTHER',ca:'B'.repeat(32)}]).length,2);
assert.equal(mirror.matchingCommunities('$TEST',[{...community,isExample:true}]).length,0,'Example community does not import ticker firehose');
let cache=new Map(),responses=[],calls=[],persisted=[],fail=false;
const redis={get:async k=>cache.get(k)??null,set:async(k,v)=>cache.set(k,v)};
const db={select:()=>{let result;const q={from:()=>q,where:()=>{result=[community];return q},then:(resolve,reject)=>Promise.resolve(result).then(resolve,reject)};return q}};
const discovery=load('apps/worker/src/jobs/communitySearch.ts',{'@mention/db':orm,'@mention/shared':{OFFICIAL_ACCOUNT_ID:'official'},'../lib/context.js':{db,redis},'../lib/socialdata.js':{sdGet:async(_job,url)=>{calls.push(url);if(fail)throw Error('capped');return responses.shift()??{tweets:[]}}},'../lib/mirror.js':{matchingCommunities:mirror.matchingCommunities,persistTweet:async(t,m)=>{persisted.push({t,m});return true}}});
const tweet=n=>({id_str:String(n),full_text:'$TEST',user:{screen_name:'outsider',id_str:'99'}});
(async()=>{
 assert.equal(discovery.searchWindow(community,{since:1000},2000).query,`("$TEST" OR "${ca}") since_time:880 until_time:2000`);
 responses=Array.from({length:5},(_,i)=>({tweets:[tweet(i+1)],next_cursor:'page'+(i+1)}));await discovery.communitySearchJob('coin');let state=JSON.parse(cache.get('x-search:coin'));
 assert.equal(persisted.length,5,'Nonmember public posts are imported');assert.equal(state.cursor,'page5');const frozenQuery=state.query;
 fail=true;await assert.rejects(discovery.communitySearchJob('coin'));state=JSON.parse(cache.get('x-search:coin'));assert.equal(state.cursor,'page5','Failure preserves backlog');assert.equal(state.lastError,'capped');
 fail=false;responses=[{tweets:[tweet(6)],next_cursor:null}];await discovery.communitySearchJob('coin');state=JSON.parse(cache.get('x-search:coin'));assert(!state.cursor);assert.equal(state.lastError,null);assert.equal(persisted.length,6);assert.equal(new URL('http://x'+calls.at(-1)).searchParams.get('query'),frozenQuery,'Resume same time window');assert.equal(new URL('http://x'+calls.at(-1)).searchParams.get('cursor'),'page5');
 const mirrorSource=fs.readFileSync('apps/worker/src/lib/mirror.ts','utf8');assert(mirrorSource.includes('onConflictDoUpdate'));assert(!mirrorSource.includes('hidden: false'),'Reimport cannot restore moderated posts');assert(mirrorSource.includes('posts.xTweetId'),'Native cross-post duplication checked');
 console.log('PASS: cashtag boundaries, case-sensitive full CA, multi-community matching, public nonmember import, bounded pagination, resumed cursor, failed lookup preservation and recovery.');
})().catch(e=>{console.error(e);process.exitCode=1});

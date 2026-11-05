const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const r=require('node:module').createRequire(path.resolve('apps/api/package.json')),ts=require('../apps/web/node_modules/typescript');
function load(file,mocks={}){const module={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module,exports:module.exports,require:n=>mocks[n]??(n.startsWith('.')?load(path.resolve(path.dirname(file),n.replace(/\.js$/,'.ts')),mocks):r(n)),Date,console,Buffer,process:{env:{}},fetch:async()=>({ok:true,json:async()=>({data:[]})}),AbortSignal});return module.exports;}
const media=load('apps/api/src/routes/media.ts',{'@mention/db':{},'../lib/db.js':{},'../env.js':{env:{}},'../auth/middleware.js':{requireAuth:()=>{},requireNotBanned:()=>{},rateLimit:()=>()=>{}}});
const gif=Buffer.alloc(32);gif.write('GIF89a');gif.writeUInt16LE(500,6);gif.writeUInt16LE(500,8);assert.equal(media.validateMedia('data:image/gif;base64,'+gif.toString('base64')).mime,'image/gif');gif.writeUInt16LE(3000,6);assert.throws(()=>media.validateMedia('data:image/gif;base64,'+gif.toString('base64')));assert.throws(()=>media.validateMedia('data:image/gif;base64,'+Buffer.from('not a gif at all!!').toString('base64')));
const chart=load('apps/api/src/lib/market-chart.ts',{'./redis.js':{cached:async(k,t,fn)=>fn(),redis:{get:async()=>null,set:async()=>{}}},'./tokenStats.js':{fetchTokenStats:async()=>({pairAddress:null})}});
assert.equal(chart.parseCandles([[200,2,4,1,3,100],[100,1,2,0.5,2,50],['bad'],[300,NaN,2,0,1,10]]).length,2);assert.equal(chart.parseCandles([[200,2,4,1,3,100],[100,1,2,.5,2,50]])[0].time,100);
// Token art uses the same upload as attachments. Keep every frame of the original file.
const pack=load('packages/shared/src/sticker-pack.ts').MENTIONS_GIFS;
assert.equal(pack.length,10);assert.equal(new Set(pack.map(g=>g.mediaUrl)).size,pack.length);
const animated=fs.readFileSync('apps/web/public'+pack[0].mediaUrl);
const upload=media.validateMedia('data:image/gif;base64,'+animated.toString('base64'));
assert.equal(upload.mime,'image/gif');assert.deepEqual(upload.bytes,animated);
const shared=load('packages/shared/src/index.ts');assert(shared.createPostSchema.safeParse({content:'',mediaUrl:'https://example.com/file.gif'}).success);assert(!shared.createPostSchema.safeParse({content:'   '}).success);assert(shared.createPostSchema.safeParse({content:'',stickerId:'preset:0'}).success);
(async()=>{await assert.rejects(()=>chart.marketChart('unused','1m'),/Pool lookup temporarily unavailable/);console.log('PASS: media signatures/dimensions, valid empty-text attachments, empty-post rejection, candle validation/order, no synthetic chart/holders fallback.');})().catch(e=>{console.error(e);process.exitCode=1});

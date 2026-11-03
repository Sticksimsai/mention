// Offline protocol/security regression checks. Never sends a request to X.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const req=require('node:module').createRequire(path.resolve('apps/api/package.json')),ts=req('typescript');
function load(file,mocks={}){const module={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module,exports:module.exports,require:n=>mocks[n]??req(n),Buffer,URL,Blob,FormData,AbortSignal,setTimeout,fetch:()=>{throw new Error('Live network forbidden');}});return module.exports;}
const pack=load('packages/shared/src/sticker-pack.ts');const {xMediaSource}=load('packages/shared/src/x-media.ts',{'./sticker-pack.js':pack});
const origin='https://mention-api.onrender.com',id='12345678-1234-1234-1234-123456789abc';
assert.equal(xMediaSource(origin+'/v1/media/'+id,origin).id,id);
assert.equal(xMediaSource(pack.MENTIONS_GIFS[0].mediaUrl,origin).kind,'preset');
for(const bad of ['https://evil.example/v1/media/'+id,'http://127.0.0.1/a','https://getmentions.xyz/redirect','https://getmentions.xyz/stickers/mentions-blob/unknown.gif',origin+'/v1/media/'+id+'?redirect=1','https://user:password@getmentions.xyz'+pack.MENTIONS_GIFS[0].mediaUrl])assert.throws(()=>xMediaSource(bad,origin));
const {uploadXMedia,validateXMedia}=load('apps/worker/src/lib/xMedia.ts');
const gif=Buffer.alloc(4_000_020);gif.write('GIF89a');
assert.throws(()=>validateXMedia(Buffer.from('<html>not an image</html>'),'image/png'));
assert.throws(()=>validateXMedia(Buffer.alloc(8_000_001),'image/gif'));
(async()=>{
 let calls=[],segments=[],polls=0;
 const response=(data,status=200)=>({ok:true,status,json:async()=>({data})});
 const fetchMock=async(url,opt)=>{calls.push(url);assert.equal(opt.headers.Authorization,'Bearer test');
  if(url.endsWith('/initialize')){const body=JSON.parse(opt.body);assert.equal(body.total_bytes,gif.length);assert.equal(body.media_category,'tweet_gif');return response({id:'123'});}
  if(url.endsWith('/append')){segments.push([opt.body.get('segment_index'),opt.body.get('media').size]);return response(null,204);}
  if(url.endsWith('/finalize'))return response({id:'123',processing_info:{state:'pending',check_after_secs:1}});
  polls++;return response({id:'123',processing_info:{state:polls===1?'in_progress':'succeeded',check_after_secs:1}});
 };
 assert.equal(await uploadXMedia(gif,'image/gif','test',fetchMock,async()=>{}),'123');
 assert.deepEqual(segments,[['0',4_000_000],['1',20]]);assert.equal(polls,2);
 assert(!calls.some(u=>u.includes('/tweets')));
 const png=Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),Buffer.alloc(20)]);
 const immediate=async(url)=>url.endsWith('/initialize')?response({id:'123'}):url.endsWith('/append')?response(null,204):response({id:'123'});
 assert.equal(await uploadXMedia(png,'image/png','test',immediate,async()=>{}),'123');
 await assert.rejects(()=>uploadXMedia(png,'image/png','test',async()=>({ok:false,status:403})),/HTTP 403/);
 await assert.rejects(()=>uploadXMedia(png,'image/png','test',async(url)=>url.endsWith('/finalize')?response({id:'123',processing_info:{state:'failed'}}):immediate(url)),/rejected/);
 await assert.rejects(()=>uploadXMedia(png,'image/png','test',async(url)=>url.endsWith('/initialize')?response({id:'123'}):url.endsWith('/append')?response(null,204):response({id:'123',processing_info:{state:'pending'}}),async()=>{}),/in time/);
 console.log('PASS X media: source allowlist, size/type checks, chunks, images, GIF polling, rejection and bounded timeout. No live requests.');
})().catch(e=>{console.error(e);process.exitCode=1});

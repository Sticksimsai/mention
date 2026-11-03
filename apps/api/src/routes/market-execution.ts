import {Hono} from 'hono';
import {HTTPException} from 'hono/http-exception';
import {z} from 'zod';
import {TransactionInstruction} from '@solana/web3.js';
import {marketLinks,marketActions,communities,battleChallenges,eq,and} from '@mention/db';
import {db} from '../lib/db.js';
import {requireAuth,requireNotBanned,rateLimit} from '../auth/middleware.js';
import {marketConfig,assertTester,readReserve,verifyPool,buildAction,actionView,refreshAction,sendAction,actionAuthority,freezeTerms,getTerms,roundView,readRound,chainTime} from '../lib/market-execution.js';
import {key,fundRound,expireRound,claimRound} from '../lib/market-protocol.js';
export const marketExecutionRoute=new Hono();
const id=(s:string)=>z.string().uuid().parse(s);
const address=z.string().refine(s=>{try{key(s);return true}catch{return false}},'Invalid Solana address');
async function owner(communityId:string,userId:string){const [c]=await db.select().from(communities).where(eq(communities.id,communityId));if(!c||c.ownerId!==userId||c.status!=='approved')throw new HTTPException(403,{message:'Only the approved community owner can connect a reserve'});return c;}
marketExecutionRoute.get('/config',c=>c.json(marketConfig()));
marketExecutionRoute.use('*',requireAuth,rateLimit('devnet-markets',60,60),async(c,next)=>{requireNotBanned(c);assertTester(c.get('user').id);await next();});
marketExecutionRoute.get('/community/:id',async c=>{const communityId=id(c.req.param('id'));await owner(communityId,c.get('user').id);const [link]=await db.select().from(marketLinks).where(eq(marketLinks.communityId,communityId));const details=link?JSON.parse(link.details):null;return c.json({details,reserve:details?await readReserve(details.mint):null});});
marketExecutionRoute.post('/community/:id/prepare',async c=>{
 const communityId=id(c.req.param('id')),userId=c.get('user').id,coin=await owner(communityId,userId);
 const body=z.object({mint:address,pool:address,wallet:address,acknowledgeDevnet:z.literal(true)}).parse(await c.req.json());
 const reserve=await readReserve(body.mint);if(reserve.owner!==body.wallet)throw new HTTPException(409,{message:'Sign with the wallet that owns this devnet reserve'});
 await verifyPool(body.pool,coin.ca);const details={communityId,mint:body.mint,pool:body.pool,wallet:body.wallet,volumeMint:coin.ca,network:'devnet',policy:'devnet-gecko-proxy-v1'};
 const a=await buildAction('link:'+communityId,'link',userId,details,body.wallet,async()=>[new TransactionInstruction({programId:key('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr'),keys:[{pubkey:key(body.wallet),isSigner:true,isWritable:false}],data:Buffer.from('Mentions devnet reserve connection: '+JSON.stringify(details))})]);return c.json(actionView(a));
});
marketExecutionRoute.get('/round/:id',async c=>c.json(await roundView(id(c.req.param('id')))));
marketExecutionRoute.post('/round/:id/terms',async c=>{const roundId=id(c.req.param('id')),userId=c.get('user').id;const [b]=await db.select().from(battleChallenges).where(eq(battleChallenges.id,roundId));if(!b)throw new HTTPException(404);const [a]=await db.select().from(communities).where(eq(communities.id,b.challengerId)),[other]=await db.select().from(communities).where(eq(communities.id,b.opponentId));if(a?.ownerId!==userId&&other?.ownerId!==userId)throw new HTTPException(403);return c.json(await freezeTerms(roundId));});
marketExecutionRoute.post('/round/:id/prepare',async c=>{
 const roundId=id(c.req.param('id')),userId=c.get('user').id;
 const body=z.object({wallet:address,rulesHash:z.string().length(64),kind:z.enum(['fund','recover']),acknowledgeDevnet:z.literal(true)}).parse(await c.req.json());
 const saved=await getTerms(roundId);if(!saved)throw new HTTPException(409,{message:'Review immutable terms first'});const t=saved.terms;
 const side=userId===t.ownerIdA?'a':userId===t.ownerIdB?'b':null;if(!side)throw new HTTPException(403);
 await owner(side==='a'?t.challengerId:t.opponentId,userId);
 if(body.rulesHash!==t.rulesHash||body.wallet!==(side==='a'?t.walletA:t.walletB))throw new HTTPException(409,{message:'Wallet or reviewed terms do not match'});
 const a=await buildAction('round:'+roundId,body.kind,userId,{roundId,side,rulesHash:t.rulesHash,kind:body.kind,terms:t},body.wallet,async()=>{
 const r=await readRound(t),now=await chainTime();
 if(body.kind==='fund'){
 if(!marketConfig().settlementEnabled)throw new HTTPException(503,{message:'Devnet settlement is paused; reserve connections remain available'});
 if(now>=t.start||r?.status||side==='a'&&r||side==='b'&&(!r||r.fundedB))throw new HTTPException(409,{message:'This funding step is no longer available'});
 const reserve=await readReserve(side==='a'?t.mintA:t.mintB);if(BigInt(reserve.availableUnits)<BigInt(side==='a'?t.amountA:t.amountB))throw new HTTPException(409,{message:'Insufficient devnet reserve'});return [fundRound(t,side)];}
 if(!r)throw new HTTPException(409,{message:'No funded round exists'});
 if(r.status===0){if(now<=(r.fundedB?t.deadline:t.start))throw new HTTPException(409,{message:'Refund deadline has not passed'});return [expireRound(t)];}
 const instructions=[...(!r.claimedA?claimRound(t,r,0,body.wallet):[]),...(r.fundedB&&!r.claimedB?claimRound(t,r,1,body.wallet):[])];if(!instructions.length)throw new HTTPException(409,{message:'All funded tokens have been claimed'});return instructions;
 });return c.json(actionView(a));
});
marketExecutionRoute.get('/actions/:id',async c=>{const [a]=await db.select().from(marketActions).where(eq(marketActions.id,id(c.req.param('id'))));if(!a)throw new HTTPException(404);await actionAuthority(a,c.get('user').id);return c.json(actionView(await refreshAction(a)));});
marketExecutionRoute.post('/actions/:id/submit',async c=>{const [a]=await db.select().from(marketActions).where(eq(marketActions.id,id(c.req.param('id'))));if(!a)throw new HTTPException(404);await actionAuthority(a,c.get('user').id);const body=z.object({signedTransaction:z.string().min(1).max(2000)}).parse(await c.req.json());return c.json(actionView(await sendAction(a,body.signedTransaction)));});
marketExecutionRoute.post('/actions/:id/cancel',async c=>{const [a]=await db.select().from(marketActions).where(eq(marketActions.id,id(c.req.param('id'))));if(!a)throw new HTTPException(404);await actionAuthority(a,c.get('user').id);await db.update(marketActions).set({status:'cancelled',updatedAt:new Date()}).where(and(eq(marketActions.id,a.id),eq(marketActions.status,'prepared')));return c.json({ok:true});});

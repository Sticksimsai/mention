import {Hono} from 'hono';
import {z} from 'zod';
import {zValidator} from '@hono/zod-validator';
import {modAuditLog,eq,desc,sql} from '@mention/db';
import {requireAuth,requireStaff,requireNotBanned} from '../auth/middleware.js';
import {db} from '../lib/db.js';
import {redis} from '../lib/redis.js';
import {env} from '../env.js';
import {address,connection,platformKeypair} from '../lib/money.js';
export const readinessRoute=new Hono();
readinessRoute.use('*',requireAuth,async(c,next)=>{requireStaff(c,['admin']);requireNotBanned(c);await next();});
const manualChecks=['signed-in-social','x-writeback','wallet-funding','launch-rehearsal','trade-rehearsal','payout-rehearsal','backup-restore','market-contract-review','market-devnet'] as const;
readinessRoute.get('/',async c=>{
 const checks:{id:string;label:string;status:'pass'|'blocked'|'pending';detail:string}[]=[];
 const add=(id:string,label:string,ok:boolean,detail:string)=>checks.push({id,label,status:ok?'pass':'blocked',detail});
 const heartbeat=await redis.get('ops:worker-heartbeat').catch(()=>null);
 add('worker','Worker heartbeat',Boolean(heartbeat&&Date.now()-Date.parse(heartbeat)<90000),heartbeat??'No heartbeat received');
 add('x-config','X posting configuration',Boolean(env.X_CLIENT_ID&&env.X_CLIENT_SECRET&&env.X_REDIRECT_URI),'Client ID, secret and callback must be configured. Credentials are never returned.');
 let callbackOk=false;try{const u=new URL(env.X_REDIRECT_URI);callbackOk=u.protocol==='https:'&&u.pathname==='/v1/x/callback';}catch{}
 add('x-callback','X callback URL',callbackOk,callbackOk?env.X_REDIRECT_URI:'Missing or invalid HTTPS callback');
 add('encryption','Stored token encryption',env.TOKEN_ENCRYPTION_KEY.length>=16,'Encryption key configured with at least 16 characters');
 let feeOk=false;try{address(env.PLATFORM_FEE_WALLET);feeOk=true;}catch{}
 add('fees','Trade fee wallet',feeOk,feeOk?env.PLATFORM_FEE_WALLET:'Missing or invalid fee wallet');
 let treasury:string|null=null,balanceSol:number|null=null;try{treasury=platformKeypair().publicKey.toBase58();}catch{}
 add('treasury','Creator-fee treasury',Boolean(treasury),treasury??'Platform signing wallet is not configured');
 try{const slot=await connection.getSlot('confirmed');if(treasury)balanceSol=(await connection.getBalance(address(treasury)))/1e9;add('rpc','Solana RPC',true,`Confirmed slot ${slot}`);}catch{add('rpc','Solana RPC',false,'RPC request failed');}
 add('rpc-dedicated','Dedicated RPC',!env.SOLANA_RPC_URL.includes('api.mainnet-beta.solana.com'),'Use a provisioned RPC endpoint before opening launches');
 let lookup=false;try{if(env.PUMP_LOOKUP_TABLE)lookup=Boolean((await connection.getAddressLookupTable(address(env.PUMP_LOOKUP_TABLE))).value?.isActive());}catch{}
 add('lookup','Launch address lookup table',lookup,'Required for larger create-and-buy transactions; configure PUMP_LOOKUP_TABLE');
 add('payout-limits','Payout limits',env.PAYOUT_MAX_SOL>0&&env.PAYOUT_DAILY_BUDGET_SOL>0,'Per-payment and daily budgets must both be positive');
 const operations=await db.execute(sql`SELECT kind,status,count(*)::int AS count FROM money_operations GROUP BY kind,status`);
 const evidence=await db.select().from(modAuditLog).where(eq(modAuditLog.action,'readiness_evidence')).orderBy(desc(modAuditLog.createdAt)).limit(100);
 const writeAttempts=await db.execute(sql`SELECT status,count(*)::int AS count FROM x_write_attempts GROUP BY status`);
 const failures=(await redis.lrange('ops:worker-failures',0,19).catch(()=>[])).flatMap(s=>{try{return [JSON.parse(s)];}catch{return [];}});
 return c.json({checkedAt:new Date().toISOString(),checks,manualChecks,evidence:evidence.map(e=>({id:e.targetId,at:e.createdAt,...JSON.parse(e.meta??'{}')})),failures,operations,writeAttempts,treasury,balanceSol,gates:{launch:env.LAUNCH_ENABLED,payouts:env.PAYOUTS_ENABLED,markets:false},marketRule:'USD trading volume over the fixed matchup window; ties and incomplete data refund. Escrow deployment and oracle integration still required.'});
});
readinessRoute.post('/evidence',zValidator('json',z.object({id:z.enum(manualChecks),passed:z.boolean(),note:z.string().trim().min(20).max(2000)})),async c=>{const body=c.req.valid('json');await db.insert(modAuditLog).values({actorId:c.get('user').id,action:'readiness_evidence',targetType:'readiness',targetId:body.id,meta:JSON.stringify({passed:body.passed,note:body.note})});return c.json({ok:true});});

import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { bodyLimit } from 'hono/body-limit';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { launchImages,eq } from '@mention/db';
import { db } from '../lib/db.js';
import { env } from '../env.js';
import { requireAuth,requireNotBanned,rateLimit } from '../auth/middleware.js';
export const mediaRoute=new Hono();
export function validateMedia(data:string){
 const match=/^data:(image\/(?:gif|png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(data);
 if(!match)throw new HTTPException(400,{message:'Choose a GIF, PNG, JPEG or WebP file'});
 const bytes=Buffer.from(match[2],'base64'),mime=match[1];
 if(bytes.length<16||bytes.length>(mime==='image/gif'?8_000_000:2_000_000))throw new HTTPException(400,{message:'GIFs must be under 8 MB; images under 2 MB'});
 const valid=mime==='image/gif'?['GIF87a','GIF89a'].includes(bytes.toString('ascii',0,6)):mime==='image/png'?bytes.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex')):mime==='image/jpeg'?bytes[0]===255&&bytes[1]===216&&bytes[2]===255:bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP';
 if(!valid)throw new HTTPException(400,{message:'This file is not a supported image'});
 if(mime==='image/gif'&&(bytes.readUInt16LE(6)>2000||bytes.readUInt16LE(8)>2000||bytes.readUInt16LE(6)===0||bytes.readUInt16LE(8)===0))throw new HTTPException(400,{message:'GIF dimensions must be between 1 and 2000 pixels'});
 return {bytes,mime};
}
mediaRoute.get('/:id',async c=>{
 const parsed=z.string().uuid().safeParse(c.req.param('id'));if(!parsed.success)throw new HTTPException(404);
 const [asset]=await db.select().from(launchImages).where(eq(launchImages.id,parsed.data));if(!asset)throw new HTTPException(404);
 c.header('Content-Type',asset.mime);c.header('X-Content-Type-Options','nosniff');c.header('Cache-Control','public, max-age=31536000, immutable');
 return c.body(new Uint8Array(Buffer.from(asset.data,'base64')));
});
mediaRoute.post('/',requireAuth,rateLimit('media-upload',30,3600),bodyLimit({maxSize:11_000_000}),zValidator('json',z.object({data:z.string().max(10_800_000)})),async c=>{
 requireNotBanned(c);const {bytes,mime}=validateMedia(c.req.valid('json').data);
 const [asset]=await db.insert(launchImages).values({userId:c.get('user').id,mime,data:bytes.toString('base64')}).returning({id:launchImages.id});
 return c.json({id:asset.id,url:`${env.PUBLIC_ASSET_ORIGIN}/v1/media/${asset.id}`},201);
});

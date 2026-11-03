import {xMediaSource} from '@mention/shared/x-media';
import {launchImages,eq,and} from '@mention/db';
import {db} from './context.js';
import {env} from '../env.js';
import {validateXMedia} from './xMedia.js';
export async function loadXMedia(url:string,userId:string) {
 const source=xMediaSource(url,env.PUBLIC_ASSET_ORIGIN);
 if(source.kind==='upload') {
   const [asset]=await db.select().from(launchImages).where(and(eq(launchImages.id,source.id),eq(launchImages.userId,userId)));
   if(!asset)throw new Error('X attachment not found or not owned by author');
   const bytes=Buffer.from(asset.data,'base64');validateXMedia(bytes,asset.mime);return {bytes,mime:asset.mime};
 }
 // The only network-readable assets are exact bundled GIF paths on our web origin.
 const res=await fetch(source.url,{redirect:'error',signal:AbortSignal.timeout(15000)});
 if(!res.ok||!res.body)throw new Error('Could not read the selected GIF');
 const reader=res.body.getReader(),chunks:Uint8Array[]=[];let size=0;
 try {while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>8_000_000)throw new Error('GIF is too large');chunks.push(value);}}finally{await reader.cancel();}
 const bytes=Buffer.concat(chunks);validateXMedia(bytes,'image/gif');return {bytes,mime:'image/gif'};
}

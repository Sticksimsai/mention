import { MENTIONS_GIFS } from './sticker-pack.js';
// Only registered local uploads or bundled GIFs. Never fetch arbitrary user URLs.
export function xMediaSource(value:string, assetOrigin:string) {
  let url:URL;
  try { url=new URL(value,'https://getmentions.xyz'); } catch { throw new Error('Upload this attachment to Mentions before posting it to X.'); }
  if(url.username||url.password||url.search||url.hash)throw new Error('Invalid media URL');
  const match=/^\/v1\/media\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.exec(url.pathname);
  if(match&&url.origin===new URL(assetOrigin).origin)return {kind:'upload' as const,id:match[1]};
  if(url.origin==='https://getmentions.xyz'&&MENTIONS_GIFS.some(g=>g.mediaUrl===url.pathname))return {kind:'preset' as const,url:url.href};
  throw new Error('Upload this attachment to Mentions before posting it to X.');
}

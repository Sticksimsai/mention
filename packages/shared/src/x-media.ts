import { MENTIONS_GIFS } from './sticker-pack.js';
const legacyPresetPaths = new Set([
  '/stickers/mentions-blob/01-dance.gif',
  '/stickers/mentions-blob/02-jump.gif',
  '/stickers/mentions-blob/03-coin.gif',
  '/stickers/mentions-blob/04-gm.gif',
  '/stickers/mentions-blob/05-pump.gif',
  '/stickers/mentions-blob/06-wave.gif',
  '/stickers/mentions-blob/07-vibe.gif',
  '/stickers/mentions-blob/08-rocket.gif',
  '/stickers/mentions-blob/09-laser.gif',
  '/stickers/mentions-blob/10-at-sign.gif',
]);
// Only registered local uploads or bundled GIFs. Never fetch arbitrary user URLs.
export function xMediaSource(value:string, assetOrigin:string) {
  let url:URL;
  try { url=new URL(value,'https://onlycults.fun'); } catch { throw new Error('Upload this attachment to Mentions before posting it to X.'); }
  if(url.username||url.password||url.search||url.hash)throw new Error('Invalid media URL');
  const match=/^\/v1\/media\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.exec(url.pathname);
  if(match&&url.origin===new URL(assetOrigin).origin)return {kind:'upload' as const,id:match[1]};
  if(['https://onlycults.fun','https://getmentions.xyz'].includes(url.origin) && (MENTIONS_GIFS.some(g=>g.mediaUrl===url.pathname) || legacyPresetPaths.has(url.pathname)))return {kind:'preset' as const,url:url.href};
  throw new Error('Upload this attachment to Mentions before posting it to X.');
}

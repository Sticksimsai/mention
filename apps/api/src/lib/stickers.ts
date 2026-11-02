import { starterStickers, type StickerView } from '@mention/shared';
import { communityStickers, eq, desc } from '@mention/db';
import { db } from './db.js';
export async function stickerPack(c: {id:string;ticker:string}): Promise<StickerView[]> {
 const rows=await db.select().from(communityStickers).where(eq(communityStickers.communityId,c.id)).orderBy(desc(communityStickers.createdAt)).limit(100);
 return [...starterStickers(c),...rows.map(r=>({id:r.id,communityId:c.id,ticker:c.ticker,label:r.label,glyph:r.glyph,color:r.color}))];
}

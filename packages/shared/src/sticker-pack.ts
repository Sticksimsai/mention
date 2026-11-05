/** Official animated pack shared by the GIF picker and community sticker trays. */
export const MENTIONS_GIFS = [
  ['01-c-echo', 'C Echo', 'Reactions'],
  ['02-halftone-orb', 'Halftone Orb', 'Reactions'],
  ['03-c-flag', 'C Flag', 'Community'],
  ['04-join-the-cult', 'Join the Cult', 'Community'],
  ['05-candles', 'Candles', 'Trading'],
  ['06-gm', 'GM', 'Community'],
  ['07-c-glitch', 'C Glitch', 'Reactions'],
  ['08-worship', 'Worship', 'Hype'],
  ['09-wordmark', 'Wordmark', 'Community'],
  ['10-procession', 'Procession', 'Celebration'],
].map(([file, label, category]) => ({
  id: `onlycults-v1:${file}`,
  label, category,
  mediaUrl: `/stickers/onlycults-v1/${file}.gif`,
}));

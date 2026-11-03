/** Uploaded, looping artwork shared by every community. Keep filenames stable for old posts. */
export const MENTIONS_GIFS = [
  ['01-dance', 'Dance', 'Celebration'],
  ['02-jump', 'Jump', 'Hype'],
  ['03-coin', 'Coin', 'Trading'],
  ['04-gm', 'GM', 'Community'],
  ['05-pump', 'Pump', 'Trading'],
  ['06-wave', 'Wave', 'Community'],
  ['07-vibe', 'Vibe', 'Reactions'],
  ['08-rocket', 'Rocket', 'Hype'],
  ['09-laser', 'Laser', 'Reactions'],
  ['10-at-sign', 'Mentions', 'Community'],
].map(([file, label, category]) => ({
  id: `mentions-blob:${file}`,
  label, category,
  mediaUrl: `/stickers/mentions-blob/${file}.gif`,
}));

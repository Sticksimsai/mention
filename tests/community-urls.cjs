// Offline PostgreSQL integration check. Requires @electric-sql/pglite in NODE_PATH.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('node:module').createRequire(path.resolve('apps/api/package.json'))('typescript');
const { PGlite } = require('@electric-sql/pglite');
function load(file) {
  const module = {exports:{}};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{module,exports:module.exports,encodeURIComponent});
  return module.exports;
}
(async () => {
  const {communityHref,communityIdentifier} = load('packages/shared/src/community-url.ts');
  const id='568e5d5e-6c6a-4617-a557-c4dfc054134d';
  assert.equal(communityHref({id,slug:'solana-playground'}),'/t/solana-playground');
  assert.equal(communityHref({id}),`/t/${id}`);
  assert.equal(communityIdentifier(id).kind,'id');
  assert.equal(communityIdentifier('SOLANA-PLAYGROUND').value,'solana-playground');
  for(const bad of ['', '../admin', '%2f', 'has space', 'x'.repeat(91)]) assert.equal(communityIdentifier(bad),null);
  const db = new PGlite();
  await db.exec(`CREATE TABLE communities (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, ticker text NOT NULL, created_at timestamptz DEFAULT now());
    INSERT INTO communities(id,name,ticker) VALUES ('${id}','Solana Playground','SOL');`);
  await db.exec(fs.readFileSync('packages/db/migrations/0008_community_urls.sql','utf8'));
  assert.equal((await db.query('SELECT slug FROM communities WHERE id=$1',[id])).rows[0].slug,'solana-playground');
  async function insert(name,ticker='TEST') { return (await db.query('INSERT INTO communities(name,ticker) VALUES ($1,$2) RETURNING id,slug',[name,ticker])).rows[0]; }
  assert.equal((await insert('Solana!!! Playground')).slug,'solana-playground-2');
  assert.equal((await insert('SOLANA PLAYGROUND')).slug,'solana-playground-3');
  assert.equal((await insert('✨✨','MOON')).slug,'moon');
  assert.equal((await insert('✨✨','✨')).slug,'community');
  assert.equal((await insert('a'.repeat(100))).slug,'a'.repeat(72));
  assert.equal((await insert(id)).slug,`community-${id}`);
  await db.query('UPDATE communities SET name=$1,slug=$2 WHERE id=$3',['New name','hijacked',id]);
  assert.equal((await db.query('SELECT slug FROM communities WHERE id=$1',[id])).rows[0].slug,'solana-playground');
  assert.equal((await insert('Solana Playground')).slug,'solana-playground-4');
  await db.exec("ALTER TABLE communities ADD COLUMN ca text DEFAULT gen_random_uuid()::text; CREATE TABLE money_operations(id uuid PRIMARY KEY,details text NOT NULL);");
  await db.exec(fs.readFileSync('packages/db/migrations/0009_launch_community_links.sql','utf8'));
  const operation='00000000-0000-0000-0000-000000000001';
  await db.query('INSERT INTO money_operations VALUES ($1,$2)',[operation,JSON.stringify({name:'New Launch'})]);
  const reserve=async()=> (await db.query('SELECT mentions_reserve_community_slug($1,$2,$3,$4) AS slug',[operation,'New Launch','NEW','mint-new'])).rows[0].slug;
  assert.equal(await reserve(),'new-launch');assert.equal(await reserve(),'new-launch','Retries keep the reserved address');
  await assert.rejects(insert('New Launch'),/reserved/);
  assert.equal((await insert('NEW-LAUNCH')).slug,'new-launch-2','Other communities cannot claim reserved URLs');
  const finished=(await db.query('INSERT INTO communities(name,ticker,ca) VALUES ($1,$2,$3) RETURNING slug',['New Launch','NEW','mint-new'])).rows[0];
  assert.equal(finished.slug,'new-launch','Finalized community receives the exact metadata address');
  assert.equal((await db.query('SELECT mentions_community_slug_base($1,$2) AS slug',['✨','SOL'])).rows[0].slug,'sol');
  await db.close();
  const {MENTIONS_GIFS}=load('packages/shared/src/sticker-pack.ts');
  assert.equal(MENTIONS_GIFS.length,10);
  assert.equal(new Set(MENTIONS_GIFS.map(g=>g.id)).size,10);
  for(const gif of MENTIONS_GIFS){
    const data=fs.readFileSync('apps/web/public'+gif.mediaUrl);
    assert.match(data.subarray(0,6).toString(),/^GIF8[79]a$/);
    assert.equal(data.readUInt16LE(6),352);assert.equal(data.readUInt16LE(8),352);
    assert(data.includes(Buffer.from('NETSCAPE2.0')),'Uploaded GIF keeps loop extension');
  }
  console.log('PASS community URLs: migration/backfill, duplicate names, safe fallback, persistent slugs, UUID compatibility, metadata address reservation, validation; all 10 looping GIF assets.');
})().catch(e=>{console.error(e);process.exitCode=1;});

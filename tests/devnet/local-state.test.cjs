const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {keypair,stateDir,context}=require('../../scripts/devnet/local-state.cjs');
// Public dummy identity; no network or real signing keys used by these guard tests.
const dummyKeypair={fromSecretKey:()=>({publicKey:{toBase58:()=> 'test-payer'}})};
const root=path.resolve(__dirname,'../..'),dir=fs.mkdtempSync(path.join(path.dirname(root),'devnet-state-test-'));
const previous={...process.env};
process.on('exit',()=>fs.rmSync(dir,{recursive:true,force:true}));
test('missing key cannot silently create a payer',()=>{const file=path.join(dir,'missing.json');assert.throws(()=>keypair(file,dummyKeypair),/missing/);assert.equal(fs.existsSync(file),false)});
test('relative paths and malformed key bytes are rejected',()=>{assert.throws(()=>keypair('payer.json',dummyKeypair),/absolute/);const file=path.join(dir,'invalid.json');fs.writeFileSync(file,JSON.stringify(Array(64).fill(256)));assert.throws(()=>keypair(file,dummyKeypair),/Invalid/)});
test('state inside checkout is rejected',()=>{process.env.DEVNET_STATE_DIR=root;assert.throws(stateDir,/outside/)});
test('symlinks into checkout cannot bypass state location guard',()=>{const link=path.join(dir,'checkout');fs.symlinkSync(root,link,'dir');process.env.DEVNET_STATE_DIR=link;assert.throws(stateDir,/outside/)});
test('persistent state must match both payer and program',()=>{
 process.env.DEVNET_STATE_DIR=dir;process.env.DEVNET_KEYPAIR=path.join(dir,'payer.json');fs.writeFileSync(process.env.DEVNET_KEYPAIR,JSON.stringify(Array(64).fill(1)));
 assert.throws(()=>context(dummyKeypair),/prepare/);
 const file=path.join(dir,'identity.json'),program=fs.readFileSync(path.join(root,'contracts/mention-escrow/program-id.txt'),'utf8').trim();
 fs.writeFileSync(file,JSON.stringify({network:'devnet',payer:'other',program}));assert.throws(()=>context(dummyKeypair),/differs/);
 fs.writeFileSync(file,JSON.stringify({network:'devnet',payer:'test-payer',program:'other'}));assert.throws(()=>context(dummyKeypair),/differs/);
 fs.writeFileSync(file,JSON.stringify({network:'devnet',payer:'test-payer',program}));assert.equal(context(dummyKeypair).dir,dir);
 for(const name of ['DEVNET_STATE_DIR','DEVNET_KEYPAIR']){if(previous[name]===undefined)delete process.env[name];else process.env[name]=previous[name]}
});
test('prepare binds real keypairs and updates only the development program identity',()=>{
 const {createRequire}=require('node:module'),{spawnSync}=require('node:child_process');
 const r=createRequire(path.join(root,'contracts/harness/package.json')),{Keypair}=r('@solana/web3.js');
 const fixture=path.join(dir,'fixture'),state=path.join(dir,'persistent');
 fs.mkdirSync(path.join(fixture,'contracts/mention-escrow/src'),{recursive:true});fs.mkdirSync(state);
 fs.symlinkSync(path.join(root,'contracts/harness'),path.join(fixture,'contracts/harness'),'dir');
 const original=fs.readFileSync(path.join(root,'contracts/mention-escrow/src/lib.rs'),'utf8');
 fs.writeFileSync(path.join(fixture,'contracts/mention-escrow/src/lib.rs'),original);
 const payer=Keypair.generate(),program=Keypair.generate();
 const payerFile=path.join(state,'payer.json'),programFile=path.join(state,'program.json');
 fs.writeFileSync(payerFile,JSON.stringify([...payer.secretKey]),{mode:0o600});fs.writeFileSync(programFile,JSON.stringify([...program.secretKey]),{mode:0o600});
 const env={...process.env,RUN_DEVNET_TESTS:'true',DEVNET_KEYPAIR:payerFile,DEVNET_PROGRAM_KEYPAIR:programFile,DEVNET_STATE_DIR:state};
 const run=()=>spawnSync(process.execPath,[path.join(root,'scripts/devnet/prepare.cjs')],{cwd:fixture,env,encoding:'utf8'});
 const first=run();assert.equal(first.status,0,first.stderr);
 const edited=fs.readFileSync(path.join(fixture,'contracts/mention-escrow/src/lib.rs'),'utf8');
 assert.equal(edited,original.replace(/declare_id!\("[1-9A-HJ-NP-Za-km-z]+"\);/,`declare_id!("${program.publicKey}");`));
 assert.equal(JSON.parse(fs.readFileSync(path.join(state,'identity.json'))).payer,payer.publicKey.toBase58());
 assert.equal(run().status,0,'same identity is idempotent');
 fs.writeFileSync(programFile,JSON.stringify([...Keypair.generate().secretKey]),{mode:0o600});
 assert.notEqual(run().status,0,'changed identity refused');assert.equal(fs.readFileSync(path.join(fixture,'contracts/mention-escrow/src/lib.rs'),'utf8'),edited);
});

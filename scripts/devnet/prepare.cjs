// Run on your own computer, with backed-up devnet-only keys. No RPC or funds moved.
const fs=require('node:fs'),path=require('node:path'),{createRequire}=require('node:module');
const r=createRequire(path.resolve('contracts/harness/package.json')),{Keypair}=r('@solana/web3.js');
const {keypair,stateDir}=require('./local-state.cjs');
if(process.env.RUN_DEVNET_TESTS!=='true')throw Error('Set RUN_DEVNET_TESTS=true');
const payer=keypair(process.env.DEVNET_KEYPAIR,Keypair),program=keypair(process.env.DEVNET_PROGRAM_KEYPAIR,Keypair),dir=stateDir();
if(payer.publicKey.equals(program.publicKey))throw Error('Use distinct payer and program keypairs');
const identity={network:'devnet',payer:payer.publicKey.toBase58(),program:program.publicKey.toBase58()};
const file=path.join(dir,'identity.json');
if(fs.existsSync(file)&&JSON.stringify(JSON.parse(fs.readFileSync(file,'utf8')))!==JSON.stringify(identity))throw Error('Existing state belongs to a different payer/program. Use a separate persistent directory.');
const source='contracts/mention-escrow/src/lib.rs',text=fs.readFileSync(source,'utf8');
if((text.match(/declare_id!\("[1-9A-HJ-NP-Za-km-z]+"\);/g)||[]).length!==1)throw Error('Expected one program declaration');
// Deployment always rebuilds and runs tests, preventing use of an old binary.
fs.writeFileSync(source,text.replace(/declare_id!\("[1-9A-HJ-NP-Za-km-z]+"\);/,`declare_id!("${identity.program}");`));
fs.writeFileSync('contracts/mention-escrow/program-id.txt',identity.program+'\n');
if(!fs.existsSync(file))fs.writeFileSync(file,JSON.stringify(identity),{mode:0o600,flag:'wx'});
console.log(JSON.stringify({...identity,stateDirectory:dir,next:'Back up both keypairs locally, then run the devnet preflight. No transactions sent.'},null,2));

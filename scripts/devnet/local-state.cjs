// Explicit user-controlled devnet state. Never generate or replace a payer implicitly.
const fs = require('node:fs');
const path = require('node:path');
function keypair(file, Keypair) {
  if (!file || !path.isAbsolute(file)) throw Error('Provide an absolute path to your local devnet keypair. Never paste keys into chat.');
  if (!fs.existsSync(file)) throw Error('Devnet keypair is missing; refusing to generate a replacement.');
  const bytes = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!Array.isArray(bytes) || bytes.length !== 64 || bytes.some(n => !Number.isInteger(n) || n < 0 || n > 255)) throw Error('Invalid Solana keypair file');
  return Keypair.fromSecretKey(Uint8Array.from(bytes));
}
function stateDir() {
  const configured = process.env.DEVNET_STATE_DIR;
  if (!configured || !path.isAbsolute(configured) || !fs.existsSync(configured)) throw Error('DEVNET_STATE_DIR must point to an existing persistent directory outside the repository.');
  const dir = fs.realpathSync(configured), root = fs.realpathSync(path.resolve(__dirname, '../..'));
  const relative = path.relative(root, dir);
  if (!relative || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative))) throw Error('Keep devnet state outside the repository on your own computer.');
  return dir;
}
function context(Keypair) {
  const payer = keypair(process.env.DEVNET_KEYPAIR, Keypair), dir = stateDir();
  const identityPath = path.join(dir, 'identity.json');
  if (!fs.existsSync(identityPath)) throw Error('Run scripts/devnet/prepare.cjs first.');
  const identity = JSON.parse(fs.readFileSync(identityPath, 'utf8'));
  const program = fs.readFileSync(path.resolve(__dirname, '../../contracts/mention-escrow/program-id.txt'), 'utf8').trim();
  if (identity.network !== 'devnet' || identity.payer !== payer.publicKey.toBase58() || identity.program !== program) throw Error('State identity differs from payer/program; do not mix test runs.');
  return { payer, dir };
}
module.exports = { keypair, stateDir, context };

# Public devnet rehearsal from your computer

Run this from a fresh clone of `Sticksimsai/mention`. Keep all keys on your own computer; do not paste them into chat or commit them. Use separate **devnet-only** keys, never a wallet holding real funds. The earlier funded address is unusable without its missing original key.

## Prerequisites

Node 20+, pnpm 10.28.0 and the Solana/Agave 2.3.0 CLI (`solana`, `solana-keygen`, `cargo-build-sbf`). Install repository dependencies with `pnpm install --frozen-lockfile`, and harness dependencies with `npm ci --prefix contracts/harness`.

## Persistent keys and state

Choose a local directory you can back up. The example works in bash on macOS/Linux. If you already have devnet-only keypair files, set the two key variables to those absolute paths instead. Do not overwrite existing key files.

```bash
export DEVNET_STATE_DIR="$HOME/mentions-devnet-test"
mkdir -p "$DEVNET_STATE_DIR"
chmod 700 "$DEVNET_STATE_DIR"
export DEVNET_KEYPAIR="$DEVNET_STATE_DIR/payer.json"
export DEVNET_PROGRAM_KEYPAIR="$DEVNET_STATE_DIR/program.json"
export DEVNET_RPC_URL="https://api.devnet.solana.com"
export RUN_DEVNET_TESTS=true

# Only create these when you do not already have the chosen files.
solana-keygen new --outfile "$DEVNET_KEYPAIR"
solana-keygen new --outfile "$DEVNET_PROGRAM_KEYPAIR"
node scripts/devnet/prepare.cjs
```

Back up these keys privately before requesting test SOL. `prepare.cjs` prints public addresses only and sends no transactions. It edits the development program ID in the local Rust source and `program-id.txt`; this is expected. The existing development address cannot be deployed without its matching missing key.

Fund the **new payer address printed by prepare**, only on devnet, using https://faucet.solana.com/. About 5 test SOL is the initial deployment estimate. Availability and per-request faucet limits vary. Do not send mainnet SOL. Confirm the actual address and balance:

```bash
node scripts/devnet/fund.cjs
```

Despite its legacy filename, `fund.cjs` is now read-only: it does not request funds or create a key.

## Deploy and exercise escrow

```bash
bash scripts/devnet/deploy-escrow.sh
node scripts/devnet/escrow.cjs
```

Deployment checks the devnet genesis and matching program key, rebuilds the program and reruns the executable assertion suite before submitting. The public rehearsal uses test mints and **synthetic volume**, includes an unmatched-round refund, waits through the real ten-minute round and verifies winner balances. Allow roughly 15 minutes. It is not a live market-data oracle test.

## Rehearse launches

```bash
DEVNET_LAUNCH_MODE=fair node scripts/devnet/launch.cjs
DEVNET_LAUNCH_MODE=creator node scripts/devnet/launch.cjs
```

These create actual devnet test tokens through the production launch builder: no developer buy, then exactly 2% developer buy. They do not implement the separate 50%-of-purchased-tokens escrow reserve. Holder rewards are excluded because the inspected devnet configuration disables them.

## Evidence and interruptions

`launch-evidence.json` and `escrow-evidence.json` contain public signatures and outcomes in your state directory. Share those two files or public explorer links when finished. **Do not share payer.json, program.json, escrow-actors.json or launch mint key files.**

Signatures are recorded before sending. If interrupted or confirmation is unknown, keep all state and inspect the existing signatures/rounds before trying again. Do not delete evidence to bypass a guard. Automatic recovery from a partially completed escrow run is not implemented yet; retained actor keys allow manual reconciliation and recovery. Never start a second run in the same directory while another is running.

Mainnet launches remain disabled pending public devnet evidence, reserve integration, live oracle validation and production signing/upgrade-authority review.

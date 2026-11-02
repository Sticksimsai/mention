#!/usr/bin/env bash
set -euo pipefail
# Test-only deployment. This file never reads production signing secrets.
: "${RUN_DEVNET_TESTS:?Set RUN_DEVNET_TESTS=true}"
[[ "$RUN_DEVNET_TESTS" == true ]] || exit 1
DEVNET_RPC_URL="${DEVNET_RPC_URL:-https://api.devnet.solana.com}"
: "${DEVNET_KEYPAIR:?Provide the absolute path to your local devnet payer keypair}"
: "${DEVNET_PROGRAM_KEYPAIR:?Provide the absolute path to your local devnet program keypair}"
: "${DEVNET_STATE_DIR:?Provide a persistent local directory outside the checkout}"
ESCROW_BINARY="contracts/mention-escrow/target/deploy/mention_escrow.so"
export DEVNET_KEYPAIR DEVNET_PROGRAM_KEYPAIR DEVNET_STATE_DIR DEVNET_RPC_URL
node scripts/devnet/fund.cjs
[[ "$(solana --url "$DEVNET_RPC_URL" genesis-hash)" == EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG ]] || { echo 'Refusing non-devnet RPC'; exit 1; }
[[ "$(solana-keygen pubkey "$DEVNET_PROGRAM_KEYPAIR")" == "$(cat contracts/mention-escrow/program-id.txt)" ]] || { echo 'Development program key does not match source'; exit 1; }
cargo-build-sbf --manifest-path contracts/mention-escrow/Cargo.toml --sbf-out-dir contracts/mention-escrow/target/deploy -- --locked
ESCROW_BINARY="$ESCROW_BINARY" node contracts/harness/escrow.cjs
# Caller sees the exact program address, wallet and test SOL balance before deployment.
solana --url "$DEVNET_RPC_URL" --keypair "$DEVNET_KEYPAIR" address
solana --url "$DEVNET_RPC_URL" --keypair "$DEVNET_KEYPAIR" balance
solana --url "$DEVNET_RPC_URL" --keypair "$DEVNET_KEYPAIR" program deploy "$ESCROW_BINARY" --program-id "$DEVNET_PROGRAM_KEYPAIR" --max-len "$(wc -c < "$ESCROW_BINARY")"
solana --url "$DEVNET_RPC_URL" program show "$(cat contracts/mention-escrow/program-id.txt)"

# Mentions escrow — development candidate

This is an on-chain two-token escrow candidate. It is not approved for mainnet and is not connected to the production funding buttons.

The creator signs fixed terms: two different mints and pools, both stake amounts, two beneficiaries, the oracle key, a rules hash, and a minute-aligned start time. Supported rounds last 10, 30 or 60 minutes. The first stake funds initialization; the named opponent must fund before the start. Both vaults are controlled by a round PDA.

After the round, the named oracle can attest USD volume totals and a nonzero evidence hash. Higher volume wins both token pots. Equal volume or incomplete evidence refunds each original depositor. This is an oracle attestation, not trustless on-chain measurement; an oracle could lie before the timeout. The program cannot detect wash trading. Both parties must see and accept that trust model before funding.

Anyone can trigger a refund when the opponent misses the start or the oracle misses the 15-minute settlement grace period. Claims are permissionless but destinations are bound to stored beneficiaries (or original depositors for refunds). Each vault pays once. There is no arbitrary admin withdrawal or authority-change instruction. This version retains the round accounts and vault rent; rent reclamation is not implemented.

Legacy SPL Token and Token-2022 mints are supported. Freeze authority is forbidden. Only metadata pointer and token metadata mint extensions are permitted; fees, hooks, permanent delegates and other extensions are rejected. Exact received amounts are checked. No escrow fee is charged by this candidate.

## What is not connected

The reserve candidate adds custody of 50% of purchased developer tokens and owner-authorized reserve-to-round funding. The launch builder can append the deposit atomically in an explicitly devnet-only rehearsal; public reserve launch execution remains disabled until verified. Do not describe the draft reserve shown by the site as deposited funds. Spectator wagering and probability/odds pricing are also separate work.

## Build and test

Use Anchor crates 0.32.2 and Agave 2.3.0 / platform-tools v1.48. Cargo.lock pins transitive dependencies compatible with Rust 1.84. The development program ID is in `program-id.txt`; a matching development keypair is needed for deployment. Never use a mainnet signing key in this workspace.

```sh
cd contracts/mention-escrow
cargo build-sbf --locked
# Put the built .so at target/sbf-solana-solana/release/mention_escrow.so if your build tool uses another output directory.
cd ../harness
npm ci --ignore-scripts
npm test
```

The harness loads the actual Solana executable into LiteSVM with signature checks enabled and executes SPL token CPIs. Fixtures supply initial mint/account state; Clock is advanced only for local testing. This does not establish successful public devnet deployment or production readiness.

An upgradeable deployment has an additional trust boundary: its upgrade authority can replace the code. Mainnet authority ownership, multisig controls and any freeze policy must be reviewed separately. This development program ID is not a mainnet release.

## Reserve candidate (2026-11-03 correction)

Reserve mode locks **50% of purchased developer tokens**, rounded down; the developer retains the remainder. At a 2% supply buy this is 1% of supply each. This is not a fee or an additional purchase. Standard fair/creator launches keep their existing behavior.

`initialize_reserve` creates a mint-specific reserve PDA and token vault, checks the source ATA balance against the declared purchase, enforces the 2% cap, and deposits half with a checked transfer. The launch builder appends it after token creation and the exact-token buy in the same transaction. A failed deposit rolls back the launch. The on-chain reserve instruction can also be called separately on an eligible existing holding; it does not by itself prove that a purchase occurred in that transaction.

`initialize_from_reserve` and `accept_from_reserve` require the reserve owner's signature and transfer directly into the existing round's constrained token vaults. There is no general-purpose withdraw instruction. Winner payouts and timeout refunds follow the original round rules; refunds return to the depositor wallet, not automatically into the reserve. Reserve owners still choose counterparties and the oracle: colluding owners/oracles can arrange wagers that return their stakes, so this is not a trustless permanent token lock. Upgrade authority remains a separate trust boundary.

The Round account layout and existing instructions remain compatible. The local executable suite covers reserve deposits, unauthorized spending, duplicate initialization, overspending, winner payouts, refunds and atomic rollback. Public devnet still needs the program upgrade and a `DEVNET_LAUNCH_MODE=reserve` rehearsal. Do not enable public execution based solely on these local tests.

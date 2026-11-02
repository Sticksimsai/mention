# Mentions escrow — development candidate

This is an on-chain two-token escrow candidate. It is not approved for mainnet and is not connected to the production funding buttons.

The creator signs fixed terms: two different mints and pools, both stake amounts, two beneficiaries, the oracle key, a rules hash, and a minute-aligned start time. Supported rounds last 10, 30 or 60 minutes. The first stake funds initialization; the named opponent must fund before the start. Both vaults are controlled by a round PDA.

After the round, the named oracle can attest USD volume totals and a nonzero evidence hash. Higher volume wins both token pots. Equal volume or incomplete evidence refunds each original depositor. This is an oracle attestation, not trustless on-chain measurement; an oracle could lie before the timeout. The program cannot detect wash trading. Both parties must see and accept that trust model before funding.

Anyone can trigger a refund when the opponent misses the start or the oracle misses the 15-minute settlement grace period. Claims are permissionless but destinations are bound to stored beneficiaries (or original depositors for refunds). Each vault pays once. There is no arbitrary admin withdrawal or authority-change instruction. This version retains the round accounts and vault rent; rent reclamation is not implemented.

Legacy SPL Token and Token-2022 mints are supported. Freeze authority is forbidden. Only metadata pointer and token metadata mint extensions are permitted; fees, hooks, permanent delegates and other extensions are rejected. Exact received amounts are checked. No escrow fee is charged by this candidate.

## What is not connected

The launch reserve is still NOT wired: automatic custody of 1% of purchased developer tokens and reserve-to-round funding require a separate, tested atomic launch integration. Do not describe the draft reserve shown by the site as deposited funds. Spectator wagering and probability/odds pricing are also separate work.

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

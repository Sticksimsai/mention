# Devnet testing status — 2026-11-02

## Completed

- Verified Solana devnet genesis `EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG`.
- Pump program is executable on devnet; global, fee configuration and quote-control accounts load through the actual SDK. `createV2Enabled=true`; holder rewards currently report `false`.
- Built `mention-escrow` for the actual `sbf-solana-solana` target with platform-tools v1.48 / Rust 1.84.1. Fixed an initialization stack-frame overflow before running tests; final build has no stack-overflow diagnostics.
- Executed 75 signed transaction assertions against the compiled program in LiteSVM, using legacy SPL Token and Token-2022 CPIs. Both winners, ties, incomplete evidence, unmatched expiry, oracle timeout, wrong signers, wrong recipients, wrong mints/vaults, duplicate funding/claims and unsupported token configuration checks passed.
- Executable SHA-256: `828507eecee2ef211fe82314fcd130a6579fdb619e8e9b3a0c4e62442be5afec`.

## Public devnet execution is not complete

No escrow deployment or token-launch transaction has been sent to public devnet.

The original test wallet `6qfiMQ6ET2aY3267s69WW5VCi5dEShPU2o3Ze7ekMYU6` received **5 devnet SOL**, verified on 2026-11-02 at slot 517938900. Its signing key and the original program key are absent from the restored workspace. Do not fund that address again. It cannot be used unless its original key is recovered.

## Resume with keys on your own computer

Follow [DEVNET-RUNBOOK.md](DEVNET-RUNBOOK.md). Scripts now require explicit local key paths and a persistent state directory outside the checkout. They never silently replace a missing payer or request an airdrop. `prepare.cjs` binds state to both payer and program identities and updates the development program ID in source; deployment always rebuilds and runs the executable tests first.

The user-controlled-key changes have syntax and local state validation tests; public devnet execution remains pending. The earlier 75 executable assertions apply to the previously built contract, not a newly deployed program.

The launch script reuses the production launch builder with a devnet connection, creates a devnet lookup table, signs with the isolated test wallet, records signatures before sending, and verifies actual supply/developer token balance. Its connection and deployment scripts reject other genesis hashes. Public metadata must be deployed before launch rehearsal. A recorded ambiguous signature must be reconciled before any rerun. The deployment script reruns the executable tests before uploading the program.

The public escrow rehearsal script creates test mints, funds a round, refunds a separate unmatched round, waits for real clock deadlines, and settles using explicitly synthetic volume totals. It records signatures before sending and checks final token balances. It refuses to restart when an evidence file already exists, requiring reconciliation first. The local clock-based tests do not replace this step.

## Before mainnet

Keep production execution gates closed. Complete the public-devnet signatures, integrate the 1%-of-dev-buy reserve atomically, connect and review the volume oracle, and review upgrade-authority ownership. Test the full signed-in site flow and reconcile a small reviewed mainnet launch, buy/sell and payout. The escrow candidate has no live volume ingestion, spectator pricing or production funding UI connection yet.

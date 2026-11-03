# Devnet testing status — 2026-11-03

## Completed

- Verified Solana devnet genesis `EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG`.
- Pump program is executable on devnet; global, fee configuration and quote-control accounts load through the actual SDK. `createV2Enabled=true`; holder rewards currently report `false`.
- Built `mention-escrow` for the actual `sbf-solana-solana` target with platform-tools v1.48 / Rust 1.84.1. Fixed an initialization stack-frame overflow before running tests; final build has no stack-overflow diagnostics.
- Executed 75 signed transaction assertions against the compiled program in LiteSVM, using legacy SPL Token and Token-2022 CPIs. Both winners, ties, incomplete evidence, unmatched expiry, oracle timeout, wrong signers, wrong recipients, wrong mints/vaults, duplicate funding/claims and unsupported token configuration checks passed.
- Executable SHA-256: `828507eecee2ef211fe82314fcd130a6579fdb619e8e9b3a0c4e62442be5afec`.

## Public devnet escrow results

The user-controlled deployment and public-devnet escrow tests completed on 2026-11-02. Both fair and creator launch rehearsals subsequently passed on 2026-11-03.

- Payer: `56j9ZB548AB9vCqCTazcWQvhM1tjR1mNFxaSGwyEK7CT`.
- Deployed program: `HvyUucswhe6NeAWeptTZCs86sVdZK4JJGzhVFQ4y3qFH`.
- User's build passed all 75 local transaction assertions; executable SHA-256: `4ebbf4809c5802f644e081c4837ceec072bedd0e3cc823f1af947d1b2eb79e54`.
- Deployment signature: `2P5CMf9bkXd4yf8w993qx956iK9cTW8z1ph2xhRTK9AyB1DvhMrRni4sK8UXSeDV8Dqcf84WLKLtBQUBacmAg3s1`. RPC independently confirmed finalized success and executable program state.
- Funded round `GnPQ24teNkjd7TZ2U48ssYGNrPt9C55ojDhDQz6EAQHW`: both deposits independently confirmed. After a public RPC rate limit, recovery output reported synthetic A-wins settlement and both claims completed at 18:52:34 UTC, status 1. This is synthetic volume, not a live oracle test.
- Separate unmatched round `5Rkf9YZDZRWUXMYGzxFrUPc8wNLBGbReXQKifPFbPuK9`: user-provided output reports status 3, A claimed, B unfunded, 100 raw units refunded and exact original balance 1,000,000 restored at 19:23:18 UTC. The initially planned unmatched round was never created; this separate test covers that path.
- Full transaction records remain in the user's persistent `escrow-evidence.json`. Do not delete this file or rerun the original escrow setup.

### Retired wallet

The original test wallet `6qfiMQ6ET2aY3267s69WW5VCi5dEShPU2o3Ze7ekMYU6` received **5 devnet SOL**, verified on 2026-11-02 at slot 517938900. Its signing key and the original program key are absent from the restored workspace. Do not fund that address again. It cannot be used unless its original key is recovered.

## Resume with keys on your own computer

Follow [DEVNET-RUNBOOK.md](DEVNET-RUNBOOK.md). Scripts now require explicit local key paths and a persistent state directory outside the checkout. They never silently replace a missing payer or request an airdrop. `prepare.cjs` binds state to both payer and program identities and updates the development program ID in source; deployment always rebuilds and runs the executable tests first.

The user-controlled-key changes have syntax and local state validation tests. The new program build also passed the 75 executable assertions as shown in the user's deployment output. Public devnet results above cover A-wins settlement and unmatched refunds; other settlement branches remain locally tested only.

The launch script reuses the production launch builder with a devnet connection, creates a devnet lookup table, signs with the isolated test wallet, records signatures before sending, and verifies actual supply/developer token balance. Its connection and deployment scripts reject other genesis hashes. Public metadata must be deployed before launch rehearsal. A recorded ambiguous signature must be reconciled before any rerun. The deployment script reruns the executable tests before uploading the program.

The public escrow rehearsal script creates test mints, funds a round, refunds a separate unmatched round, waits for real clock deadlines, and settles using explicitly synthetic volume totals. It records signatures before sending and checks final token balances. It refuses to restart when an evidence file already exists, requiring reconciliation first. The local clock-based tests do not replace this step.

## Public devnet fair launch

User-provided script output reports `fair-no-buy` passed at 2026-11-03 03:12:42 UTC, using the production launch builder on devnet.

- Signature: `3HmpAbUdx1zMUf3h1LWoQmA9nyb8ffUdiWdJWSHMg2xxBgnsciCFp4Pq3JMCXU3J8g5FYjuGHBc4zM9UJ75whJ39`.
- Mint: `H3tT5PXbXAkLt7zJF7MFB8meQhVe9pFv575fABfPDyzb`.
- Developer received: **0 raw token units**, as expected for fair launch.
- Supply: `1000000000000000` raw units.
- Lookup table: `4ghxHvWC6PFLCDomDW2TVfSryMbcut7hojrvNckXYeVX`.
- The optional native bigint binding fell back to JavaScript; the test still passed.

## Public devnet creator launch

User-provided script output reports `creator-2-percent` passed at 2026-11-03 03:19:06 UTC, using the production launch builder on devnet.

- Signature: `5NZCNpprYhyVoFkerRYJQAcE78VWVZwMnjgf2tZXaX5TiRfxUgj93pHUskUamuTJhoohatUbEcbNSo9riHGRh2Ay`.
- Mint: `CVgu8w2N5mXwmwnFJnQHgac4Fb6toxJtvqL5pW5Qfbmd`.
- Developer received: `20000000000000` raw units out of supply `1000000000000000`: exactly **2%**.
- Lookup table: `F3DnBmBRRFq2VhuvuqtDFAg6xMCFjJrXKqqHP3RaJdjq`.
- This verifies the requested developer allocation, not the separate reserve transfer. The user clarified the reserve on 2026-11-03: 50% of purchased tokens, so this purchase would reserve `10000000000000` raw units (1% of total supply), leaving the developer the same amount. The earlier creator test did not include this reserve.
- Do not repeat completed launches; retain `launch-evidence.json` and the corresponding local mint keys.

## Reserve integration candidate — 2026-11-03

The split is now 50% of purchased developer tokens. The contract candidate adds a reserve vault and owner-signed reserve-to-round funding; the launch builder appends the reserve deposit atomically in devnet rehearsal mode. The compiled executable passed 93 local transaction assertions. API/web type checks and launch-builder/reserve calculation tests passed. The read-only live volume collector returned a complete sample, but always emits `signable: false`.

The existing devnet program has NOT yet been upgraded with this reserve candidate. Follow [RESERVE-TESTING.md](RESERVE-TESTING.md) for the upgrade and reserve launch rehearsal. Ordinary creator/fair test results above remain valid for those paths; they do not prove the new reserve path.

## Before mainnet

Keep production execution gates closed. Complete remaining end-to-end checks, verify the atomic 50%-of-dev-buy reserve on public devnet and connect its website flow, connect and review the volume oracle, and review upgrade-authority ownership. Test the full signed-in site flow and reconcile a small reviewed mainnet launch, buy/sell and payout. The escrow candidate has no live volume ingestion, spectator pricing or production funding UI connection yet.

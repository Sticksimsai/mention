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

The reserve program upgrade is complete on devnet. RPC independently confirmed finalized success at slot `518089462` for signature `18BSp1GDzfzq6KvzG3HTWGe6UeU2W2DtaG1z9dNGfEGZdJVgynHHBqktJGAxajzCcXvDcJfAYfmFtVsw8wqZwgN`.

The user's local build passed all 93 assertions with binary SHA-256 `a27443dddd3ce417710f7b0228b719f9a4444841520c3aba8d60d48fd9dfed80`. Their CLI inspection reports program `HvyUucswhe6NeAWeptTZCs86sVdZK4JJGzhVFQ4y3qFH`, authority `56j9ZB548AB9vCqCTazcWQvhM1tjR1mNFxaSGwyEK7CT`, data length 375392 bytes and program-data balance 1.9078702 devnet SOL. These build details are user-reported; no independent byte-for-byte on-chain binary comparison has been performed.

### Atomic reserve launch passed

The user-provided `reserve-half-of-dev-buy` result passed at 2026-11-03 04:07:48 UTC. RPC independently confirmed the transaction finalized successfully at slot `518090255` and the reserve vault held `10000000000000` raw units (10,000,000 tokens, 6 decimals).

- Signature: `2qxN68JS26weyy6TGv7AcwygJCNWjhxq8sWtgwho3UaDxBFXq8ykgpzLmNhJm9HaFGrrsjauinurDyVrwre2LG3G`.
- Mint: `6N8bM2mfdwJ94B1WPvxJ6vLuTNi9PU1yETogLJF7Tn31`.
- Reserve: `Hadmj6xR8UZDFQRGxnFMZyJ8cCzqtY8NhtfBqm4Qpciw`.
- Reserve vault: `DeFFthRiGE4E6tZvZixBVukppKextXho5CXhJzLXkYPR`.
- Developer retained (script-verified): `10000000000000` raw units.
- Supply (script-verified): `1000000000000000` raw units.
- Lookup table: `DQrJLpSP6hVtHx4jNhPUHWsW6VP17zkCsbdTY7AKySLB`.

The developer bought 2% of supply, then the same transaction placed half of those tokens into reserve: 1% of total supply in reserve and 1% retained. Do not repeat the successful launch. Preserve the public evidence and private mint keys locally. Reserve-funded round execution is tested locally; the full website flow and live oracle signing remain unverified.

## Before mainnet

Keep production execution gates closed. Complete remaining end-to-end checks, connect the verified atomic 50%-of-dev-buy reserve to its website flow, connect and review the volume oracle, and review upgrade-authority ownership. Test the full signed-in site flow and reconcile a small reviewed mainnet launch, buy/sell and payout. The escrow candidate has no live volume ingestion, spectator pricing or production funding UI connection yet.

## Website connection — 2026-11-03

The devnet integration adds signed reserve ownership proofs, immutable round terms,
reserve funding and acceptance, and permissionless refund/claim reviews. Wallet
transactions are stored before broadcast; an unknown signature blocks replacement.
Production launch and mainnet wagering switches remain disabled.

A separately configured API worker samples fixed GeckoTerminal pools twice, at least
60 seconds apart after the window closes. Only identical, complete observations
can authorize a **devnet-only provider attestation** when settlement is enabled.
This is not consensus-finalized volume and does not exclude wash trading. Test
mints use explicitly disclosed mainnet community pools as proxy data. Missing or
revised data cannot select a winner; on-chain deadlines permit refunds.

Configuration on the API service only:
- `MARKETS_DEVNET_ENABLED=true`
- `MARKETS_DEVNET_TESTERS`: comma-separated internal user UUID allowlist
- `MARKETS_DEVNET_PROGRAM_ID`: deployed devnet program
- `MARKETS_DEVNET_RPC_URL`: devnet RPC, genesis checked before execution
- `MARKETS_DEVNET_ORACLE_SEED`: separate 32-byte base64 seed, secret in Render
- `MARKETS_DEVNET_SETTLEMENT_ENABLED=true`: explicit devnet worker signing switch

The oracle needs devnet SOL for fees and destination token account rent. It never
uses the production platform wallet. Rotating it will pause existing rounds with
the previous oracle; their deadline refunds remain available.

### Connect a local test reserve
Open the community's mentionmarkets section while signed in as its owner. Supply
the devnet mint, the fixed live pool containing the community CA, and reserve owner
address. Review the memo transaction. Embedded wallets sign explicitly on devnet.
For a reserve owned by a local test keypair, download the unsigned review and run:

```sh
cd ~/mention
git pull --ff-only
node scripts/devnet/sign-market.cjs ~/Downloads/mentions-devnet-review.json
```

`DEVNET_KEYPAIR` must point to the existing local test keypair. This helper checks
RPC genesis, reserve ownership, reconstructs allowed instructions, and requests
explicit approval before signing. It writes a `.signed.txt` file without sending
anything. Paste that signed transaction into the same website review. Never paste
private keys. Unsigned reviews expire with their blockhash; prepare again if needed.

Both independent community owners must connect reserves and accept a proposal.
Freeze the terms, then fund A followed by B before the fixed start. The UI shows
finalized escrow state, the oracle, sources, amounts and deadlines. Use Recover
once to expire an eligible open round, then again to claim returned tokens.
A successful reserve launch alone does not establish website end-to-end acceptance.

Validation for the website integration: API/web TypeScript checks, canonical escrow
instruction comparisons, reserve and round decoding, fixed recipient checks,
transaction persistence/ambiguity tests, draft-state regression tests, and volume
evidence tests passed. The local production Next build encountered the execution
environment's `uv_resident_set_memory` ENOENT; Render's build is the deployment gate.
Full signed-in, two-owner website acceptance remains outstanding. Funding stays
blocked while the devnet settlement switch is off; reserve proof can proceed.

# Reserve rehearsal: half of developer tokens

The user clarified the split on 2026-11-03: **50% of purchased dev-buy tokens**, not 1% of purchased tokens. At the maximum 2% buy, 1% of supply is reserved and 1% stays in the developer wallet. Odd raw amounts round down for the reserve; the remaining raw unit stays with the developer.

## Verified locally

- The real SBF executable passed **93 signed transaction assertions** in LiteSVM, including the existing 75 cases plus reserve deposits, owner permissions, overspending, duplicate initialization, round funding, payouts, refunds, 2% cap checks and multi-instruction rollback.
- Candidate binary SHA-256 (repository development program ID): `80579a8a6052b775ea87a8213d81f07e6aaac054583fbd84573193e4f88402e6`. A build using your own program ID will differ.
- Production launch builder tests verify the reserve instruction follows the exact-token buy in one transaction, reject incorrect simulated vault balances, check the 50/50 split and refuse mainnet reserve rehearsals.
- API and web type checks pass. Public launch/market execution gates remain closed.

## Upgrade your existing devnet program

Keep the same devnet payer, program key and persistent state directory. Do not create new keys or delete previous evidence. The program account grows, so the CLI may require additional test SOL for rent/buffer space. No mainnet funds are used.

Your local Rust declaration was customized by `prepare.cjs`. Save those two public source-file changes before pulling the contract update; `prepare.cjs` reapplies your existing program identity afterward. The stash remains available as a backup; do not pop the old contract source over the updated version.

```bash
cd ~/mention
git stash push -m "devnet program identity before reserve upgrade" -- contracts/mention-escrow/src/lib.rs contracts/mention-escrow/program-id.txt
git pull --ff-only && node scripts/devnet/prepare.cjs && bash scripts/devnet/deploy-escrow.sh
```

Run this in the Terminal where the `DEVNET_*` variables and `RUN_DEVNET_TESTS=true` are set. Deployment rebuilds and runs the full executable test suite before submitting. If an upgrade reports an error after a signature, reconcile the signature before retrying.

After successful deployment, run:

```bash
DEVNET_LAUNCH_MODE=reserve node scripts/devnet/launch.cjs
```

The new test must report `reserve-half-of-dev-buy`, `passed: true`, total purchased units `20000000000000` split into developer `receivedUnits: 10000000000000` and `reserveUnits: 10000000000000`, for supply `1000000000000000`. A separate mint is expected; the earlier creator launch is unchanged. Keep `launch-evidence.json` and share only public output, never local key files. If the script stops, reconcile before rerunning.

## Live volume observation

`node scripts/devnet/volume-shadow.cjs --discover` performs **read-only** mainnet market-data requests. It selects two distinct provider pools for a test window, verifies pool/token identities, collects all one-minute USD volume candles and saves a candidate result plus evidence hash in `qa/volume-shadow-<timestamp>.json`. You can instead specify `POOL_A`, `MINT_A`, `POOL_B`, `MINT_B` explicitly.

A live sample completed with full coverage and no provider errors. Unit tests cover incomplete windows, wrong identities, provider failures, decimal rounding and the two-minute sampling delay. Every output remains `signable: false`. A provider API is not consensus-finality proof; values can be revised and include wash trading. This is evidence collection, **not a connected live settlement oracle**. No signing key is loaded by this script.

Still required: public-devnet reserve launch evidence, the website's reviewed reserve funding/acceptance flow, an approved oracle evidence/finality policy and signing worker, then end-to-end mainnet readiness checks. Existing draft market routes explicitly report unavailable balances and disabled execution.

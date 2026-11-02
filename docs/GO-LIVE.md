# Mentions release acceptance

The social site is deployed. Launches, payouts and funded mentionmarkets are not certified ready by a successful build. Keep execution gates closed until the corresponding evidence is recorded in **Admin → Readiness**.

## Signed-in acceptance

Use two real test accounts. Verify login, refresh, logout, following and unfollowing, profile ownership, community joins, owner-only edits, replies/quotes with images/GIFs/stickers, and moderation rejection for a non-staff account. Check desktop and mobile. Delete test content after recording the result.

Reconnect X using the same X account as the Mentions identity. Post one uniquely identifiable opted-in text post and verify exactly one X post and one Mentions mirror. Disconnect and verify no new cross-post occurs. The worker now persists a send claim before calling X. An interrupted response is marked unconfirmed, never automatically resent. Check X directly before posting again. Media cross-posting to X is not implemented; the composer disables it for attachments.

## Launch and trade acceptance

1. Check API RPC, fee wallet, platform treasury public key and lookup table in Readiness. RPC credentials and signing keys belong in Render secrets, not this repository.
2. Review the launch transaction with a funded test wallet. Use the smallest intended test. A mainnet launch creates a real token and spends SOL. Do not enable public launches merely to perform the test; use a restricted rehearsal deployment or maintenance window.
3. Exercise fair, creator and holder modes separately; verify mint supply, decimals, metadata, image/banner, payer, creator and quote mint. Check 2% maximum developer buy on-chain, not only in the form. Battle launch remains unavailable.
4. Replay the same submit and confirm no second mint or charge. Interrupt confirmation and ensure recovery reconciles the same signature. Reject a modified signed transaction.
5. Test a small buy and sell. Inspect all venue instructions, token balance changes, slippage, network/venue fees and Mentions fee destination. In-app trading supports SOL pairs; other listed pairs use the external venue.
6. Record signatures and wallet changes in Readiness. Do not call simulated tests proof of mainnet execution.

## Creator earnings

Reconcile a finalized treasury receipt to its actual originating token and creator before allocating earnings. An aggregate SOL inflow is insufficient attribution. Verify the disclosed split, no duplicate allocation, positive per-payment/daily limits and adequate rent/fee balance. Review a small payout, submit once, wait for finalized confirmation, then compare the recipient balance and ledger. Check retry and unknown-signature paths without sending a replacement payment. Keep PAYOUTS_ENABLED=false until this passes.

## mentionmarkets — outstanding contract dependency

The selected rule is highest USD trading volume in a 10-, 30- or 60-minute window. Lock token mints, exact pools, oracle identity, minute-aligned start/end, pricing methodology and rules hash before either side funds. Both sides must fund before the clock starts. Empty evidence is not zero volume: all minute buckets must be explicitly present and finalized. Ties or incomplete data refund. Wash trading is not reliably excluded and this must remain visible.

`volume-settlement.ts` provides tested integer scoring only. It is not a deployed oracle or escrow program. A reviewed on-chain program must bind deposits, mints, beneficiaries, rule hash and deadline; prevent double claims; support unilateral refunds for unfunded/expired rounds; and constrain oracle settlement. Test those transitions on devnet, including wrong mint, wrong signer, duplicate funding/claim and oracle downtime. The launch reserve must be an atomic 1% of purchased dev-buy tokens, rounded down, with the other 99% going to the developer. Do not take an off-chain database row as proof of escrow.

Spectator positions and real odds require a defined, funded market mechanism. Community stake ratios are not probabilities. No fabricated odds or demo volume should be published.

## Backup and recovery

Render paid Postgres supports point-in-time recovery, but retention depends on workspace plan. Verify actual recovery status and recovery window in the database dashboard. Restore to a NEW isolated database, never overwrite production. Keep API/worker traffic on production during the drill.

After restore, compare migration versions, recent user/post rows, money-operation signatures and earnings totals to a recorded cutoff. Run read-only integrity checks; never run X workers, payouts or chain submissions against the restored copy. Record restore target, timestamp, duration, cutoff and discrepancies. Remove the isolated copy only after review. Logical exports supplement PITR; store them encrypted outside the live instance. This drill has not been executed by the code tests.

## Operations and rollback

Monitor `/health` for API/DB/Redis and `/health/worker` for a fresh worker heartbeat. The heartbeat proves process liveness, not successful provider calls; inspect retained failures and X-sync timestamps in Admin. Set external uptime alerts and Render deploy-failure notifications, then induce a harmless test notification to verify delivery. Retained worker failures are diagnostics, not an external alert channel.

Check API/worker CPU, memory, DB connections/storage and queue backlog under realistic load before increasing traffic. The currently observed database plan is small; choose capacity using measurements. Confirm media storage growth and backup costs. No capacity purchase is performed by this release.

Rollback application code through Render while keeping additive migrations. For a money incident, close launch/payout gates first, preserve operation records, and reconcile existing signatures. Never retry uncertain financial or X writes as new operations. After a migration, verify table existence before deploying the worker version that uses it.

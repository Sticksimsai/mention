# Wallet trading, launch recovery, and creator payouts

## Deployment and activation

The migration adds `money_operations`, `launch_images`, `creator_receipts`, and `creator_earnings`. Existing community/user data is preserved. Render's API pre-deploy migration must succeed before the new screens are used.

Trades use the user's Privy Solana wallet. The user reviews a simulated transaction, then explicitly approves signing in Privy. The API accepts only the exact reviewed message with valid required signatures. It stores signed bytes encrypted and the signature before submitting to RPC. Repeating submit broadcasts the same transaction, not a replacement. The client distinguishes submitted from confirmed.

Server-funded launches and payout execution default OFF. Before enabling either, set explicit limits on the API service:

| Variable | Default | Purpose |
| --- | --- | --- |
| `LAUNCH_ENABLED` | `false` | Allows launch preparation and explicit launch submission |
| `LAUNCH_MAX_COST_SOL` | `0` | Maximum simulated platform cost for one launch |
| `LAUNCH_DAILY_BUDGET_SOL` | `0` | Daily reservation and execution budget, UTC |
| `PAYOUTS_ENABLED` | `false` | Enables the API's 15-second executor for approved payouts |
| `PAYOUT_MAX_SOL` | `0` | Maximum creator amount in one payout |
| `PAYOUT_DAILY_BUDGET_SOL` | `0` | Daily payout budget, including network fees, UTC |
| `PUBLIC_ASSET_ORIGIN` | `https://mention-api.onrender.com` | Public origin of stored token images |

`PLATFORM_WALLET_SECRET` and `TOKEN_ENCRYPTION_KEY` must be configured. Never rotate the encryption key while there are unreconciled operations without migrating their encrypted signed transactions. Keep enough SOL for network costs, launch costs, and approved earnings. No platform-funded initial buys are allowed by the new launch API.

## Launch lifecycle

Upload a PNG/JPEG/WebP (maximum 2 MB), enter token details and the immutable fee recipient, and request a review. The request uses a unique operation ID and payload hash. Its mint address is reserved before any transaction can be sent. The server publishes metadata, builds and simulates the creation transaction, and saves the signed bytes encrypted. No chain transaction is sent during preparation.

An explicit **Confirm launch** submits the prepared transaction. Confirmed mints are verified and their community is created transactionally. Refresh/recovery only checks the same signature and repairs the same community. It never creates another mint. Duplicate names are reserved against pending launches. Interrupted preparation can be retired after ten minutes, because preparation never broadcasts. Prepared reviews expire when their blockhash expires.

## Creator earnings: verified receipt, reviewed attribution

The existing platform creator wallet can receive aggregate creator-fee collections. A treasury balance increase alone cannot identify which token earned those fees. Do NOT allocate based on estimated trading volume, market cap, or the treasury's total balance.

The admin panel accepts a finalized collection receipt, documented allocation evidence, and per-community gross lamports. The API verifies successful finality, a positive treasury inflow, total allocations not exceeding that inflow, and receipt uniqueness. **The administrator is responsible for verifying that this inflow is creator revenue and that the token attribution is supported by collection evidence.** The system does not automatically collect protocol fees or infer their token attribution.

Creator shares use integer arithmetic and the launch-time fee split. Recipients and original launcher IDs come from the durable launch, not the current transferable community owner. Legacy tokens lacking this attribution are rejected until separately reconciled; no guessed recipient is paid.

The creator's profile → Wallet & activity shows allocated earnings, amounts awaiting approval, payout state, and source/payout transaction links. It does not display estimated or uncollected fees as spendable money.

## Payout approval and execution

In Admin, select credits belonging to the same creator and wallet, review the exact amount/recipient, then approve. Approval atomically reserves those credits for one payout and records an audit event. It constructs and stores a signed SOL transfer. The opt-in executor submits approved payments, checks finality, and retries only identical signed bytes. It checks per-payment and daily execution limits again when claiming a prepared payment. Multiple API instances cannot claim different replacement payments for the same credits.

Prepared payouts that expire without submission release their credits during reconciliation. Submitted payouts with unknown status after expiry enter `needs_review`; they remain reserved. Failed on-chain payouts also remain reserved pending reconciliation. Never manually clear a reservation or issue a replacement until the original transaction is reconciled using finalized chain data.

For a failed or uncertain operation: record the operation ID/signature, inspect the finalized transaction and recipient balance changes, then reconcile with an audited database migration or future dedicated repair tooling. Do not fabricate success or assume an RPC timeout means failure.

## Validation

- `node tests/money-flow.cjs`: real offline Solana message/signature tests, exact-message protection, integer splits, write-before-send, same-byte retry, finality, and expiry states.
- `node tests/account-flow.cjs`: profile privacy and account/API regressions.
- Typecheck web, API, and database packages.
- Production testing must use explicit user-approved transactions with specified limits. No real trade, launch, collection, or payout was used as an automated test.

Still requires operator validation before enabling launch/payout execution: third-party transaction builder compatibility, finalized per-token allocation evidence, treasury funding and limits, and a supervised bounded mainnet acceptance transaction. On-chain fee-sharing configuration is not modified by this release.

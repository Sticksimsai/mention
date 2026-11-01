# Wallet trading, launch recovery, and creator payouts

## Deployment and activation

The migration adds `money_operations`, `launch_images`, `creator_receipts`, and `creator_earnings`. Existing community/user data is preserved. Render's API pre-deploy migration must succeed before the new screens are used.

Trades use the user's Privy Solana wallet. The user reviews a simulated transaction, then explicitly approves signing in Privy. The API accepts only the exact reviewed message with valid required signatures. It stores signed bytes encrypted and the signature before submitting to RPC. Repeating submit broadcasts the same transaction, not a replacement. The client distinguishes submitted from confirmed.

Launch execution and payout execution default OFF. New launches are creator-funded and require a Privy signature; the platform never pays their developer buy. Legacy prepared launches retain the server funding limits below. Before activation, configure and validate the appropriate settings on the API service:

| Variable | Default | Purpose |
| --- | --- | --- |
| `LAUNCH_ENABLED` | `false` | Allows launch preparation and explicit launch submission |
| `PUMP_LOOKUP_TABLE` | empty | Existing active Solana address lookup table covering common Pump accounts; needed for combined create-and-buy transactions |
| `LAUNCH_MAX_COST_SOL` | `0` | Maximum simulated platform cost for one launch |
| `LAUNCH_DAILY_BUDGET_SOL` | `0` | Daily reservation and execution budget, UTC |
| `PAYOUTS_ENABLED` | `false` | Enables the API's 15-second executor for approved payouts |
| `PAYOUT_MAX_SOL` | `0` | Maximum creator amount in one payout |
| `PAYOUT_DAILY_BUDGET_SOL` | `0` | Daily payout budget, including network fees, UTC |
| `PUBLIC_ASSET_ORIGIN` | `https://mention-api.onrender.com` | Public origin of stored token images |

`PLATFORM_WALLET_SECRET` and `TOKEN_ENCRYPTION_KEY` must be configured. Never rotate the encryption key while there are unreconciled operations without migrating their encrypted signed transactions. Keep enough SOL for network costs, launch costs, and approved earnings. No platform-funded initial buys are allowed by the new launch API.

## Launch lifecycle

The Launchpad shows a live preview and preset Mentions image above the form. A user may replace it with PNG/JPEG/WebP (maximum 2 MB). The preset is uploaded through the same image endpoint when the review is requested.

New launch choices: fair start (SOL, zero initial buy), creator launch (SOL, 0–2% initial buy), and protocol holder rewards (SOL or one of the curated quote mints). The pair catalog uses exact addresses from https://pump.fun/docs/custom-pairs, checked 2026-11-01: SOL, USDC, SPCX, QQQx, SPYx, NVDAx, GLDx. The official Pump SDK 4.3.1 resolves the live on-chain whitelist, quote token program and decimals before building. Listing in the UI does not override protocol availability or issuer eligibility.

Non-SOL pairs currently require holder rewards. Pump distributes the protocol creator fees to eligible holders in the paired asset; this is permanent and subject to Pump eligibility, thresholds and distribution costs. These launches do not enter the SOL creator payout ledger. In-app trading remains SOL-only; the community trade tab links token pairs to Pump. This is an explicit limitation, not automatic SOL conversion.

The developer-buy limit is **200 basis points of live total supply**, rounded down in integer base units. It limits this launch transaction only, not subsequent market holdings. The official SDK builds an exact-token `buy_v2` atomically with `create_v2`; the token output is capped and the quote cost includes 1% slippage. Simulation verifies the minted supply and the payer's token-account output. The user pays rent, network costs and the buy, and sees maximum quote cost before signing. Native SDK launches have no PumpPortal creation surcharge. Future trades through the existing PumpPortal trade endpoint retain its provider costs.

Only the generated mint signs during preparation. The authenticated owner receives a partially signed transaction, signs with their Privy wallet, and submits the exact reviewed message. Recipient and pair settings cannot change after review. Successful submission is recorded before broadcasting; retries reuse identical signed bytes. No new keypair is generated during recovery.

`PUMP_LOOKUP_TABLE` must identify an active on-chain table covering enough shared accounts for combined create-and-buy transactions. No lookup table was created or funded by this implementation. Oversized transactions fail before requesting a wallet signature. Zero-buy creates fit without a table for tested instruction layouts. Do not enable developer buys until a real configured table and bounded acceptance transaction have been validated.

An explicit wallet approval submits the prepared transaction. Confirmed mints are verified and their community is created transactionally. Refresh/recovery checks the same signature and repairs the same community. Duplicate names are reserved against pending launches. Interrupted preparation can be retired after ten minutes because preparation never broadcasts. Prepared reviews expire with their blockhash.

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

- `node tests/launch-flow.cjs`: actual SDK instruction tests for curated pair addresses, exact 2% output limits, partial signing, transaction size with a mocked lookup table, and simulated oversupply rejection. RPC is mocked.
- `node tests/money-flow.cjs`: real offline Solana message/signature tests, exact-message protection, integer splits, write-before-send, same-byte retry, finality, and expiry states.
- `node tests/account-flow.cjs`: profile privacy and account/API regressions.
- Typecheck web, API, and database packages.
- Production testing must use explicit user-approved transactions with specified limits. No real trade, launch, collection, or payout was used as an automated test.

Still requires operator validation before enabling launch/payout execution: third-party transaction builder compatibility, finalized per-token allocation evidence, treasury funding and limits, and a supervised bounded mainnet acceptance transaction. On-chain fee-sharing configuration is not modified by this release.

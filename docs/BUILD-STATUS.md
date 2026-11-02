# Mentions build status — 2026-11-02

## This release

- Battles feed, coin search, Open / Live / Completed / My communities views, paginated proposals and detail pages.
- Owner-only challenge proposals for independently owned approved communities; 10-, 30- and 60-minute durations; explicit stakes denominated in each coin. Display amounts use six fractional decimal places for draft terms, not verified mint precision or balances.
- Durable draft records, idempotent creation/acceptance, pair-level creation lock, row-locked acceptance/cancellation, 24-hour proposal expiry, owner and approval checks, versioned acknowledgements.
- Acceptance is **Awaiting escrow**. No funded/live/settled records are created. Either participating owner can cancel before future escrow integration.
- Community reserve panel reports **not connected**, with unknown balances rather than invented zero balances.
- Battle Mode launch preview: planned allocation is floor(purchased token units / 100), with the remainder to the developer. Developer purchase maximum remains 2% of total supply. Both API preparation and builder reject Battle Mode launches until implementation is complete.
- Isolated interactive demo uses synthetic percentage price paths, selectable durations and a finish preview. No odds, real wagers or payouts.
- Desktop Battles navigation and mobile bottom navigation with access to the remaining sections through More.
- Public native/mirrored post detail and reply threads; authenticated replies, hidden-parent checks, profile links, engagement refresh/error feedback.
- Docs explain draft battle status and the remaining settlement work.

## Not live yet

1. **Battle custody and settlement:** escrow program, atomic reserve transfer on launch, mint precision/balance verification, stake value/eligibility constraints, price source and averaging rules, manipulation/staleness protections, tie/void/refund rules, settlement worker, proofs and tests. Existing draft proposals must not auto-start; obtain fresh consent to final terms. Personal spectator bets are outside this release.
2. **Launch execution:** existing global launch flag remains disabled. Developer-buy transactions need a configured active Pump address lookup table and reviewed end-to-end execution. No launch transaction was submitted during verification.
3. **Creator payouts:** durable workflow exists; live payout execution remains disabled pending operational activation and receipt reconciliation.
4. **X integration and operations:** verify production X OAuth/write-back callbacks, SocialData credentials/sync, initial admin setup, and required font licensing with the owner. Configuration was not changed in this release.

## Verification

Offline battle tests cover allocation math, stake validation, durations, permissions, expiry, rule versions, idempotency, cancellation, duplicate proposals and unfunded balances. Thread tests cover anonymous reads, authenticated writes and hidden parent protection. Existing account, transaction and launch SDK regression suites also run. TypeScript checks cover API and web. Additive migration only creates battle_challenges; prior schema snapshots are unchanged.

Live browser checks are read-only or use the isolated demo. No real orders, bets, launch submissions, payout requests or public posts are created as tests.

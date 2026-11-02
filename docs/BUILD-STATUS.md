# Mentions build status — 2026-11-02

## Current release: real activity only

- Removed fictional market cards, Layout demo and synthetic odds histories.
- Real challenge proposals, acceptances, cancellations and expiries appear chronologically alongside posts in the public home feed and relevant community/joined feeds. System updates are not attributed to a user and have no fake engagement controls. Only challenges between approved communities are eligible. Personal profile feeds remain posts-only.
- Existing eight-second home polling and five-second server caching refresh activity; this is not a websocket stream.
- Browser favicon uses the same pixel @ geometry as the rotating site logo.
- Live API checked 2026-11-02: launch enabled=false, battleExecutionEnabled=false, maxDevBuyBps=200. No flags changed, no on-chain transaction submitted.
- API/web typechecks plus offline market activity, battle state/permission and post-thread tests pass.

Older release notes below describe historical UI, including demos that have now been removed.

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

## Arena visual update — 2026-11-02

The public section is named Arena, at /arena; legacy /battles routes redirect. Navigation, community tabs, Launchpad copy and Docs use Arena. Compact market cards include two coin rows, native-token challenge details, bookmarks and duration filters. The separately labelled Layout demo contains six fictional pairings and a wide percentage-price-change chart view. Real unfunded challenges show unavailable performance rather than invented odds, volume or price history. Watchlists are stored on the current browser. Financial execution gates are unchanged.

## Arena palette and odds charts — 2026-11-02

Arena now uses the same surface, raised, line, foreground, muted and volt theme colors as the rest of Mentions. Cards include small odds-history charts and the detail view shows a 0–100% probability axis with pointer and keyboard history inspection. Demonstration odds are explicitly synthetic, sum to 100% at each sample, and are not inferred from token returns. Real challenge odds remain unavailable until market pricing is implemented. No pricing, escrow or settlement service is enabled by this visual change.

## 2026-11-02 — Launchpad presentation and mentionmarkets

Launchpad uses a wider, numbered setup layout, icon-led launch options, grouped pair assets with locally bundled official token artwork, and clear pair/mode selection feedback. Fee detail is collapsible; the live token preview stays at the top. Public Arena pages renamed to `/mentionmarkets`, with redirects for Arena and Battles URLs. Navigation places mentionmarkets below Launchpad. Transaction logic, launch execution flags, the 2% developer-buy cap and planned 1% purchased-token reserve are unchanged.

## X profile verification sync

Public profiles request a bounded SocialData single-user lookup through the existing metered worker. Badge results are bound to linked X identity, cached for 15 minutes, and never inferred from login, staff roles or Premium claims. Owners can refresh with a one-minute provider cooldown. Provider failures show unavailable. No database migration or new credentials required when the worker SocialData key is already configured.

## Site administration, following and continuous X discovery (2026-11-02)
- User-authorized migration 0003 grants the existing `tradementions` account UUID site admin; role assignment does not follow reassigned handles. Adds nullable community for official native updates, sitewide pin flags and an identity-checked official X flag.
- `/admin`: official composer, global native/X hide/restore and pin controls, community oversight, bans, staff, announcements, audit activity, existing payout controls, and X sync status. `/manage` and `/manage/:id`: owner/staff community dashboards, settings, cooldown, members, native post pins/hide/restore. Authorization is enforced in the API.
- Official native and mirrored X posts appear in both Home scopes; sitewide pins lead the first page without altering the chronological cursor. Community pins remain community-scoped. Hidden/unapproved posts are excluded. No demo content is created.
- Follow/unfollow is available on other profiles, with authenticated relationship state, immediate count refresh and paginated public connection lists. These counts are Mentions connections, not imported X follower counts.
- Approved community ticker/CA searches and member/official timeline polling run every 60 seconds. Search is public (membership not required), checks `$TICKER` boundaries and exact case-sensitive CA, and uses durable resumable cursors with bounded pages. Initial discovery covers the last hour; community searches overlap 2 minutes to catch delayed indexing. Provider availability/caps still apply; no guaranteed instant or exhaustive X coverage.
- Mentions-to-X remains explicitly opted-in and queued immediately; pending outbox recovery runs every 15 seconds. Queue IDs no longer contain invalid colons. Hidden native posts are not cross-posted; known native cross-posts are not mirrored as duplicate cards.
- Offline checks: API/web/worker TypeScript; management authorization/feed scope/pins/cursors; account following and connection lists; strict ticker/CA matching, public discovery and cursor recovery; thread, launch and market-activity regressions. No financial gates or payout settings changed; no public test posts or fund transfers performed.

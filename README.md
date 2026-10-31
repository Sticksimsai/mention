# Tribes v2

A Solana launchpad where every token mints its own community — an X-style feed,
fully mirrored with X in both directions.

- **X → site**: tweets mentioning a tribe's `$TICKER` or CA are pulled in via
  SocialData and appear in the tribe's feed.
- **Site → X**: posts made on Tribes are published to the author's real X
  account (official X API, user-granted `tweet.write`).
- **Launchpad**: tokens launch on pump.fun through the platform wallet, so
  creator fees on all trading volume accrue to the platform (split with the
  launcher). In-app trades add a platform fee on top.

## Why v2 exists (what changed from v1)

| v1 (Supabase) | v2 |
|---|---|
| 25 Deno edge functions, cold starts, CPU/time limits | One persistent Hono API + one worker service |
| One cron function loops over *all* users → timeouts | Per-user BullMQ jobs with retries, backoff, dormancy tiers |
| Every pageview hits Postgres directly | Redis cache on feeds, token stats, trending (serves stale on upstream failure) |
| Count updates raced across edge calls | Counts updated inside DB transactions |
| No site→X posting | Full OAuth2 write-back pipeline |

## Repo layout

```
apps/
  api/      Hono REST API (auth, communities, posts, feed, token stats,
            X OAuth write-back, launchpad, trading, admin)
  worker/   BullMQ workers + scheduler (tweet sync, X write-back,
            token stats warming, trending)
  web/      Next.js app (feed, tribe pages w/ live mcap + chart + trade,
            launch flow, settings, admin)
packages/
  db/       Drizzle schema + migrations (Postgres)
  shared/   Types, zod schemas, queue names
```

## Local development

```bash
docker compose up -d          # Postgres + Redis
cp .env.example .env          # fill in at least Privy + a TOKEN_ENCRYPTION_KEY
pnpm install
pnpm db:push                  # create tables (dev) — or db:migrate for SQL migrations
pnpm dev                      # api :3001, web :3000, worker
```

## Deploying on Railway

Create one Railway project with **five services**:

1. **Postgres** — Railway plugin. Copy `DATABASE_URL` .
2. **Redis** — Railway plugin. Copy `REDIS_URL`.
3. **api** — deploy from this repo, root Dockerfile path `apps/api/Dockerfile`.
   - Health check path: `/health` (gives zero-downtime deploys).
   - Scale: start with 2 replicas; it is stateless — scale horizontally at will.
4. **worker** — Dockerfile `apps/worker/Dockerfile`. 1 replica to start; add
   replicas for more sync throughput (BullMQ distributes jobs automatically).
5. **web** — Dockerfile `apps/web/Dockerfile`, build args
   `NEXT_PUBLIC_API_URL` + `NEXT_PUBLIC_PRIVY_APP_ID`.

Set the env vars from `.env.example` on api + worker (web only needs the two
`NEXT_PUBLIC_*` ones). Put Cloudflare in front of the web domain for CDN + DDoS
protection.

Run migrations once per schema change: `pnpm db:migrate` with the production
`DATABASE_URL` (or a Railway one-off command).

### Why this doesn't fall over

- **API**: persistent Node processes, no cold starts; hot paths (global feed,
  token stats, community lists) are Redis-cached with stale-on-error, so a
  DexScreener outage or a DB hiccup degrades to slightly stale data instead of
  5xx.
- **Workers**: every external call (SocialData, X API, RPC) happens in a queue
  job with concurrency caps + rate limiters + exponential backoff. Load spikes
  queue up instead of crashing anything.
- **Spend control**: SocialData usage is metered per job per day in
  `socialdata_usage` (visible in `/admin`), with a global daily cap
  (`SOCIALDATA_DAILY_CAP`) acting as a kill switch.

## Third-party setup

### Privy (sign in with X)
Create an app at dashboard.privy.io, enable Twitter login. Fill
`PRIVY_APP_ID`, `PRIVY_APP_SECRET`, `NEXT_PUBLIC_PRIVY_APP_ID`.

### SocialData (X → site mirroring)
Key from socialdata.tools → `SOCIALDATA_API_KEY`. ~$0.0002 per item returned;
the dormancy tiers mean inactive users cost almost nothing.

### X API (site → X posting)
Create an OAuth 2.0 app at developer.x.com with scopes
`tweet.read tweet.write users.read offline.access` and callback
`<API_PUBLIC_URL>/v1/x/callback`. Billing is pay-per-use (~$0.015 per post,
~$0.20 if the post contains a link) — budget accordingly; the write-back
worker's rate limiter (30/min) caps the burn rate. Generate
`TOKEN_ENCRYPTION_KEY` with `openssl rand -hex 32`.

### Launchpad (pump.fun via PumpPortal)
- `PUMPPORTAL_API_KEY` — Lightning wallet from pumpportal.fun. **This wallet
  is the on-chain creator of every token launched through Tribes**, which is
  what routes pump.fun creator fees to the platform. Keep it funded with a
  little SOL for creation fees + dev buys.
- `PLATFORM_FEE_WALLET` — receives in-app trade fees.
- `PLATFORM_TRADE_FEE_BPS` — in-app trade fee (100 = 1%).
- `PLATFORM_CREATOR_FEE_SHARE_BPS` — the platform's share of creator fees;
  the rest belongs to the launcher (their wallet is stored on the community
  row as `creator_wallet`).

**Paying out launcher shares**: pump.fun supports splitting creator fees
across up to 10 wallets (configured by the creator account). Configure the
split per launch from the platform account, or run a periodic payout from the
collected balance using the stored `creator_wallet` + `platform_fee_share_bps`.
This part is operational — the schema and launch flow already record
everything needed.

## First admin

After signing in once (so your user row exists):

```sql
INSERT INTO staff_roles (user_id, role)
SELECT id, 'admin' FROM users WHERE username = 'your_x_handle';
```

## Costs at a glance

| Thing | Cost |
|---|---|
| Railway (api ×2, worker, web, Postgres, Redis) | ~$20–50/mo to start |
| SocialData | ~$0.0002/item; capped daily |
| X API write-back | ~$0.015/post (pay-per-use) |
| Pump.fun creator fees | revenue, not cost |

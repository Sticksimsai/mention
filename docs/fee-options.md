# Fee structure options — pump.fun base vs PumpSwap base

Internal decision doc. Current facts (verify before launch, pump.fun changes these):

- **Bonding curve (pump.fun):** token creation free; **1% per trade** to pump.fun;
  graduation costs 6 SOL from the coin's liquidity.
- **PumpSwap (post-graduation AMM):** **0.25% per swap** → 0.20% to LPs + 0.05% to the
  pump.fun protocol; plus a coin-creator fee (~0.05%, dynamic/tiered by market cap since
  Dynamic Fees V1) paid to the token's creator account.
- **Creator fees** are claimable by the creator account and can be **split across up to
  10 wallets** (Jan 2026 update).
- **Third-party frontends may add their own fees** — pump.fun's docs explicitly allow it.

## Option A — pump.fun as base (what's built today)

Launch on the pump.fun bonding curve via the platform creator account.

Revenue:
1. Creator fees on **all volume, every venue** (curve + PumpSwap), at pump.fun's dynamic
   rate — split platform/launcher via the 10-wallet creator split.
2. **+1% platform fee** on trades made inside Mention (appended to the tx server-side).

| Pros | Cons |
|---|---|
| Zero on-chain dev, already shipped | pump.fun keeps the 1% curve fee and 0.05% AMM protocol fee |
| pump.fun launch meta + discoverability | Creator-fee rate is tiered and controlled by pump.fun (shrinks as mcap grows) |
| Creator fees accrue even when trading happens off-site | Our in-app 1% only hits trades made on Mention |

## Option B — PumpSwap as base (skip the bonding curve)

PumpSwap allows **manual pool creation for developers**. Launch = mint SPL token +
create a PumpSwap pool directly, with the platform (or launcher) seeding initial SOL
liquidity.

Revenue — this is the "better fee structure" angle:
1. **LP fees: 0.20% of ALL volume** on the pair if the platform seeds and holds the LP
   position — 4× what the protocol itself earns, on every trade anywhere, forever.
2. Coin-creator fee (~0.05% tier) to the platform creator account, split with launcher.
3. +1% in-app trade fee, same as Option A.

| Pros | Cons |
|---|---|
| LP fee stream dwarfs creator fees at equal volume | Needs real SOL liquidity per launch (capital at risk, impermanent loss) |
| Instant full-range trading, real chart from minute one | No bonding curve = no lottery-style launch meta, harder cold-start |
| No 1% curve tax on early traders | Still pays pump.fun the 0.05% protocol fee; pool-creation mechanics are developer-grade, less documented |

Works best as a **premium "instant liquidity" launch tier** (e.g. launcher deposits
5–10 SOL seed) rather than the default.

## Option C — own bonding curve → graduate into PumpSwap (hybrid, later)

Custom curve program with **any fee we want** (e.g. 2% vs pump.fun's 1%, all ours), then
migrate liquidity into a PumpSwap pool we own → keep the 0.20% LP stream for life, plus
creator fees.

- Max revenue per unit of volume, full control of the fee schedule.
- Cost: an audited Anchor program (weeks of work + audit), we own all exploit risk, and
  we lose pump.fun's launch distribution.

## Recommendation

1. **Ship Option A now** — it's built, costs nothing, and monetizes from day one.
2. **Add Option B as a second launch tier** once there's demand: "Curve launch (free)"
   vs "Instant pool launch (seed required)" — the LP fee stream makes high-volume
   launches dramatically more profitable for the platform.
3. **Revisit C** when platform volume justifies an audited contract; the schema already
   records `launched_via`, `creator_wallet` and fee splits, so none of this requires a
   migration.

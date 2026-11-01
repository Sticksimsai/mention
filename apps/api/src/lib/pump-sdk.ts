import { createRequire } from "node:module";

// Pump's ESM entry imports Anchor.BN through agent-payments-sdk; Anchor's Node
// package only exposes it via CommonJS. Use the SDK's published CJS entry.
const sdk = createRequire(import.meta.url)("@pump-fun/pump-sdk") as typeof import("@pump-fun/pump-sdk");
export const { OnlinePumpSdk, PUMP_SDK, getBuySolAmountFromTokenAmount, quoteAta } = sdk;

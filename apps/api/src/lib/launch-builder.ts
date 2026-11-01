import BN from "bn.js";
import { ComputeBudgetProgram, Keypair, PublicKey, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import { OnlinePumpSdk, PUMP_SDK, getBuySolAmountFromTokenAmount, quoteAta } from "@pump-fun/pump-sdk";
import { LAUNCH_PAIRS, devBuyUnits, launchOptionsSchema } from "@mention/shared";
import { connection } from "./money.js";
import { env } from "../env.js";
import type { z } from "zod";

const TOKEN_2022 = new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");
export async function buildLaunch(args: z.infer<typeof launchOptionsSchema> & {
  mint: Keypair; payer: PublicKey; creator: PublicKey; name: string; ticker: string; uri: string;
}) {
  const options = launchOptionsSchema.parse(args);
  const pair = LAUNCH_PAIRS.find(p => p.id === options.quoteAsset)!;
  const quoteMint = new PublicKey(pair.mint);
  const sdk = new OnlinePumpSdk(connection);
  const [global, feeConfig, quoteControl, resolved, transferFee] = await Promise.all([
    sdk.fetchGlobal(), sdk.fetchFeeConfig(), sdk.fetchQuoteControl(), sdk.resolveQuoteMint(quoteMint), sdk.fetchQuoteTransferFee(quoteMint),
  ]);
  if (!global.createV2Enabled) throw new Error("Pump token creation is temporarily unavailable");
  if (options.mode === "holders" && !global.isHolderRewardEnabled) throw new Error("Pump holder rewards are temporarily unavailable");
  const amount = new BN(devBuyUnits(BigInt(global.tokenTotalSupply.toString()), options.devBuyBps).toString());
  const quote = amount.isZero() ? new BN(0) : getBuySolAmountFromTokenAmount({
    global, feeConfig, mintSupply: global.tokenTotalSupply, bondingCurve: null, amount, quoteMint, quoteControl, quoteTransferFee: transferFee,
  });
  // The on-chain exact-token buy caps output at the selected share. Only input cost has 1% slippage.
  const maxQuote = quote.muln(101).addn(99).divn(100);
  const common = { mint: args.mint.publicKey, user: args.payer, creator: args.creator, name: args.name, symbol: args.ticker.toUpperCase(), uri: args.uri, mayhemMode: false, holderReward: options.mode === "holders", quoteMint, quoteTokenProgram: resolved.quoteTokenProgram };
  const instructions = amount.isZero()
    ? [await PUMP_SDK.createV2Instruction(common)]
    : await PUMP_SDK.createV2AndBuyV2Instructions({ ...common, global, amount, quoteAmount: maxQuote, slippage: 0 });
  const bh = await connection.getLatestBlockhash("confirmed");
  const tables = [];
  if (env.PUMP_LOOKUP_TABLE) {
    const table = (await connection.getAddressLookupTable(new PublicKey(env.PUMP_LOOKUP_TABLE))).value;
    if (!table || !table.isActive()) throw new Error("Launch lookup table is unavailable");
    tables.push(table);
  }
  const tx = new VersionedTransaction(new TransactionMessage({
    payerKey: args.payer, recentBlockhash: bh.blockhash,
    instructions: [ComputeBudgetProgram.setComputeUnitLimit({ units: 600_000 }), ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 10_000 }), ...instructions],
  }).compileToV0Message(tables));
  let size: number;
  try { size = tx.serialize().length; } catch { throw new Error("This launch needs a configured Pump address lookup table. No transaction was sent."); }
  if (size > 1232) throw new Error("This launch needs a configured Pump address lookup table. No transaction was sent.");
  const ata = quoteAta(args.payer, args.mint.publicKey, TOKEN_2022);
  const before = await connection.getBalance(args.payer);
  const sim = await connection.simulateTransaction(tx, { sigVerify: false, accounts: { encoding: "base64", addresses: [args.payer.toBase58(), args.mint.publicKey.toBase58(), ata.toBase58()] } });
  if (sim.value.err) throw new Error(`Launch simulation failed. Check your SOL for network/rent costs${amount.isZero() ? "" : ` and ${pair.symbol} for the developer buy`}.`);
  const accounts = sim.value.accounts;
  if (!accounts?.[0] || !accounts[1] || accounts[1].owner !== TOKEN_2022.toBase58()) throw new Error("Could not verify the new token supply");
  const mintData = Buffer.from(accounts[1].data[0], "base64");
  if (mintData.length < 82 || mintData[44] !== 6) throw new Error("Unexpected token mint");
  const supply = mintData.readBigUInt64LE(36);
  if (supply !== BigInt(global.tokenTotalSupply.toString())) throw new Error("Token supply changed; prepare a fresh review");
  const tokenData = accounts[2] ? Buffer.from(accounts[2].data[0], "base64") : null;
  if (tokenData && (accounts[2]?.owner !== TOKEN_2022.toBase58() || !tokenData.subarray(0,32).equals(args.mint.publicKey.toBuffer()) || !tokenData.subarray(32,64).equals(args.payer.toBuffer()))) throw new Error("Unexpected developer token account");
  const received = tokenData && tokenData.length >= 72 ? tokenData.readBigUInt64LE(64) : 0n;
  if (received !== BigInt(amount.toString()) || received > devBuyUnits(supply, 200)) throw new Error("Developer buy exceeds the 2% supply cap or does not match the review");
  const cost = before - accounts[0].lamports;
  if (!Number.isSafeInteger(cost) || cost < 0) throw new Error("Could not estimate launch cost");
  tx.sign([args.mint]); // Only the mint is signed here. The creator must approve the payer signature in Privy.
  return {
    transaction: Buffer.from(tx.serialize()).toString("base64"), lastValidBlockHeight: bh.lastValidBlockHeight,
    estimatedCostLamports: cost, devBuyTokenUnits: amount.toString(), totalSupplyUnits: supply.toString(),
    maxQuoteUnits: maxQuote.toString(), quoteDecimals: resolved.decimals, quoteMint: pair.mint, quoteSymbol: pair.symbol,
  };
}

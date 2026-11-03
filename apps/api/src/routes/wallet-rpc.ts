import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { bodyLimit } from "hono/body-limit";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { requireAuth, rateLimit } from "../auth/middleware.js";
import { env } from "../env.js";

// Private RPC URLs stay on the server. This endpoint cannot submit or sign transactions.
export const walletRpcRoute = new Hono();
const request = z.object({jsonrpc:z.literal("2.0"),id:z.union([z.string().max(100),z.number()]),method:z.enum(["getAccountInfo","getMultipleAccounts","getBalance","getFeeForMessage","getLatestBlockhash","getTransaction","getSignatureStatuses","getBlockHeight","simulateTransaction"]),params:z.array(z.unknown()).max(4).default([])});
walletRpcRoute.use("*",requireAuth,rateLimit("wallet-rpc",120,60),bodyLimit({maxSize:20000}));
walletRpcRoute.post("/:network",zValidator("json",request),async c=>{
 const network=c.req.param("network");if(network!=="mainnet"&&network!=="devnet")throw new HTTPException(400,{message:"Unsupported wallet network"});
 const body=c.req.valid("json");
 const url=network==="mainnet"?env.SOLANA_RPC_URL:(process.env.MARKETS_DEVNET_RPC_URL||"https://api.devnet.solana.com");
 let response:Response;
 try{response=await fetch(url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});}catch{throw new HTTPException(503,{message:"Wallet preview RPC is temporarily unavailable"});}
 if(!response.ok)throw new HTTPException(503,{message:"Wallet preview RPC is temporarily unavailable"});
 const text=await response.text();
 let parsed;try{parsed=JSON.parse(text);}catch{throw new HTTPException(502,{message:"Invalid wallet preview response"});}
 if(parsed.error){console.warn("wallet preview RPC error",{method:body.method,code:parsed.error.code});return c.json({jsonrpc:"2.0",id:body.id,error:{code:-32603,message:"Wallet preview RPC request failed. Retry the review."}});}
 // Preserve the raw JSON so Kit can decode 64-bit balances without precision loss.
 c.header("Content-Type","application/json");c.header("Cache-Control","no-store");return c.body(text);
});

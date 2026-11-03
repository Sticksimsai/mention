import { createDefaultRpcTransport, createSolanaRpcFromTransport, createSolanaRpcSubscriptions } from "@solana/kit";
import { API_URL, getApiAccessToken } from "./api";
function client(network: "mainnet" | "devnet") {
 const rpc=createSolanaRpcFromTransport(async options=>{
  const token=await getApiAccessToken();
  if(!token)throw new Error("Reconnect your wallet session before approving.");
  return createDefaultRpcTransport({url:`${API_URL}/v1/wallet-rpc/${network}`,headers:{Authorization:`Bearer ${token}`}})(options);
 });
 return {rpc,rpcSubscriptions:createSolanaRpcSubscriptions(network==="mainnet"?"wss://api.mainnet-beta.solana.com":"wss://api.devnet.solana.com")};
}
export const walletRpcs={"solana:mainnet":client("mainnet"),"solana:devnet":client("devnet")};

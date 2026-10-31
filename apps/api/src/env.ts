function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

export const env = {
  PORT: Number(process.env.PORT ?? 3001),
  DATABASE_URL: req("DATABASE_URL"),
  REDIS_URL: req("REDIS_URL"),
  WEB_ORIGIN: process.env.WEB_ORIGIN ?? "http://localhost:3000",
  API_PUBLIC_URL: process.env.API_PUBLIC_URL ?? "http://localhost:3001",

  PRIVY_APP_ID: req("PRIVY_APP_ID"),
  PRIVY_APP_SECRET: req("PRIVY_APP_SECRET"),

  X_CLIENT_ID: process.env.X_CLIENT_ID ?? "",
  X_CLIENT_SECRET: process.env.X_CLIENT_SECRET ?? "",
  X_REDIRECT_URI: process.env.X_REDIRECT_URI ?? "",
  TOKEN_ENCRYPTION_KEY: process.env.TOKEN_ENCRYPTION_KEY ?? "",

  SOLANA_RPC_URL: process.env.SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com",
  PLATFORM_FEE_WALLET: process.env.PLATFORM_FEE_WALLET ?? "",
  PLATFORM_TRADE_FEE_BPS: Number(process.env.PLATFORM_TRADE_FEE_BPS ?? 100),
  PLATFORM_CREATOR_FEE_SHARE_BPS: Number(process.env.PLATFORM_CREATOR_FEE_SHARE_BPS ?? 5000),
  PUMPPORTAL_API_KEY: process.env.PUMPPORTAL_API_KEY ?? "",
};

function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

export const env = {
  DATABASE_URL: req("DATABASE_URL"),
  REDIS_URL: req("REDIS_URL"),
  SOCIALDATA_API_KEY: process.env.SOCIALDATA_API_KEY ?? "",
  SOCIALDATA_DAILY_CAP: Number(process.env.SOCIALDATA_DAILY_CAP ?? 50_000),
  X_CLIENT_ID: process.env.X_CLIENT_ID ?? "",
  X_CLIENT_SECRET: process.env.X_CLIENT_SECRET ?? "",
  TOKEN_ENCRYPTION_KEY: process.env.TOKEN_ENCRYPTION_KEY ?? "",
};

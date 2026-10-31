"use client";

import { Shell } from "@/components/Shell";
import { TopTokensTable } from "@/components/TopTokens";

export default function TopPage() {
  return (
    <Shell>
      <div className="sticky top-0 z-10 border-b hairline bg-ink/85 px-5 py-4 backdrop-blur">
        <h1 className="font-display text-base font-medium">Leaderboard</h1>
        <p className="text-xs text-muted">Every community's token, ranked by live market cap. Updates every 15s.</p>
      </div>
      <TopTokensTable />
    </Shell>
  );
}

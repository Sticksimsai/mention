"use client";

// Docs — how Mention works, written for the person about to launch or trade.
import Link from "next/link";
import { Shell } from "@/components/Shell";

const sections = [
  { id: "overview", label: "Overview" },
  { id: "launch", label: "Launching" },
  { id: "mirroring", label: "X mirroring" },
  { id: "trading", label: "Trading" },
  { id: "fees", label: "Fees" },
  { id: "rules", label: "Rules & roles" },
];

export default function DocsPage() {
  return (
    <Shell>
      <div className="sticky top-0 z-10 border-b hairline bg-ink/85 backdrop-blur">
        <div className="px-5 pt-4">
          <h1 className="font-display text-base font-medium">Docs</h1>
        </div>
        <div className="flex gap-5 overflow-x-auto px-5 pt-2 text-sm [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {sections.map((s) => (
            <a key={s.id} href={`#${s.id}`} className="shrink-0 border-b-2 border-transparent pb-2.5 text-muted hover:text-fg">
              {s.label}
            </a>
          ))}
        </div>
      </div>

      <div className="space-y-10 px-5 py-8">
        <Doc id="overview" title="What is Mention?">
          <p>
            Mention is social trading on Solana. Every token launched here mints its own
            community — an X-style feed where the people holding, building and shilling a coin
            post in one place, with the chart live in the room.
          </p>
          <p>
            The feed is mirrored with X in both directions. Tweets that mention a community's
            <Mono> $TICKER</Mono> or contract address appear in its feed automatically, and
            posts you make on Mention can go out as real tweets from your account.
          </p>
        </Doc>

        <Doc id="launch" title="Launching a token">
          <p>
            Launching is the only way a community is created. Fill in the name, ticker, image
            and description on the <Link href="/launch" className="text-volt hover:underline">Launchpad</Link> —
            your token goes live on pump.fun's bonding curve immediately, and the community
            opens the moment the mint lands.
          </p>
          <Steps items={[
            "Sign in with X — your handle is your identity here.",
            "Fill in the token details and add your Solana wallet. That wallet receives your share of creator fees.",
            "Launch. The token is live on pump.fun; your community opens with the chart, CA and mirroring already wired in.",
            "Trade on the bonding curve from day one. When the token graduates, it migrates to PumpSwap automatically and the full chart appears.",
          ]} />
          <p>
            You own the community: edit its look, pin posts, set posting cooldowns, remove
            members, or transfer ownership. Communities can't be deleted — only transferred.
          </p>
        </Doc>

        <Doc id="mirroring" title="X mirroring, both ways">
          <p>
            <Strong>X → Mention.</Strong> We continuously watch the X accounts of every member.
            Any tweet that mentions a community's <Mono>$TICKER</Mono> or CA is pulled into
            that community's feed, with its likes, reposts and views. Active accounts are
            checked every couple of minutes; quiet ones less often.
          </p>
          <p>
            <Strong>Mention → X.</Strong> Connect posting in{" "}
            <Link href="/settings" className="text-volt hover:underline">Settings</Link> (one-time,
            revocable) and tick "Also post to my X" when composing. Your post goes out as a
            real tweet from your account and the two stay linked in the feed.
          </p>
        </Doc>

        <Doc id="trading" title="Trading">
          <p>
            Every community page has a Trade tab. Buys and sells are routed to wherever the
            token lives — the pump.fun bonding curve before graduation, PumpSwap after — and
            are signed in your own wallet. Mention never holds your funds.
          </p>
          <p>
            The Leaderboard ranks every community's token by live market cap, refreshed every
            few seconds from on-chain market data.
          </p>
        </Doc>

        <Doc id="fees" title="Fees">
          <Table
            head={["Action", "Fee", "Where it goes"]}
            rows={[
              ["Launching a token", "Free", "Network costs only"],
              ["Trading on pump.fun / PumpSwap directly", "Their standard fees", "pump.fun protocol + LPs"],
              ["Trading inside Mention", "1% of trade", "Platform"],
              ["Creator fees (all venues)", "pump.fun's dynamic rate", "Split between the launcher and the platform"],
            ]}
          />
          <p>
            Tokens launched through Mention are deployed by the platform's creator account, so
            pump.fun's creator-fee share on trading volume accrues to the platform and is
            split with you, the launcher — your share pays to the wallet you gave at launch.
            Trading anywhere still counts; you don't need to trade on Mention for the launcher
            share to accrue.
          </p>
        </Doc>

        <Doc id="rules" title="Rules & roles">
          <p>
            Community owners moderate their own house: pin posts, set cooldowns, remove posts
            and members. Site staff can remove any post and ban accounts site-wide. Banned
            accounts become read-only; their posts stay unless individually removed.
          </p>
        </Doc>
      </div>
    </Shell>
  );
}

function Doc({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-28">
      <h2 className="mb-3 font-display text-lg font-medium text-volt">{title}</h2>
      <div className="space-y-3 text-[13px] leading-relaxed text-fg/90">{children}</div>
    </section>
  );
}

const Mono = ({ children }: { children: React.ReactNode }) => (
  <span className="font-mono text-[13px] text-volt">{children}</span>
);
const Strong = ({ children }: { children: React.ReactNode }) => (
  <span className="font-semibold text-fg">{children}</span>
);

function Steps({ items }: { items: string[] }) {
  return (
    <ol className="space-y-2.5">
      {items.map((s, i) => (
        <li key={i} className="flex gap-3">
          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-volt/15 font-mono text-[11px] text-volt">
            {i + 1}
          </span>
          <span>{s}</span>
        </li>
      ))}
    </ol>
  );
}

function Table({ head, rows }: { head: string[]; rows: string[][] }) {
  return (
    <div className="overflow-hidden rounded-2xl border hairline">
      <table className="w-full text-sm">
        <thead className="bg-surface">
          <tr>{head.map((h) => <th key={h} className="px-4 py-2.5 text-left text-xs font-medium text-muted">{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t hairline">
              {r.map((cell, j) => <td key={j} className={`px-4 py-2.5 ${j === 1 ? "font-mono text-[13px]" : ""}`}>{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

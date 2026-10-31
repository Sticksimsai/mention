"use client";

// Home: the live "For you" stream — every community's posts and their matching
// tweets from X, merged into one timeline. "Joined" narrows it to your communities.
import { useState } from "react";
import { Shell } from "@/components/Shell";
import { Feed } from "@/components/Feed";
import { useMe } from "@/lib/hooks";

export default function Home() {
  const [tab, setTab] = useState<"foryou" | "joined">("foryou");
  const { authenticated, login } = useMe();

  return (
    <Shell>
      <div className="sticky top-0 z-10 border-b hairline bg-ink/85 backdrop-blur">
        <div className="flex items-center justify-between px-5 pt-4">
          <h1 className="font-display text-base font-medium">Home</h1>
          <span className="flex items-center gap-1.5 text-[11px] text-muted">
            <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-volt" /> live
          </span>
        </div>
        <div className="mt-2 flex gap-7 px-5 text-sm">
          <button
            onClick={() => setTab("foryou")}
            className={`border-b-2 pb-2.5 ${tab === "foryou" ? "border-volt font-semibold text-fg" : "border-transparent text-muted hover:text-fg"}`}
          >
            For you
          </button>
          <button
            onClick={() => (authenticated ? setTab("joined") : login())}
            className={`border-b-2 pb-2.5 ${tab === "joined" ? "border-volt font-semibold text-fg" : "border-transparent text-muted hover:text-fg"}`}
          >
            Joined
          </button>
        </div>
      </div>
      {tab === "foryou" ? <Feed /> : <Feed scope="joined" />}
    </Shell>
  );
}

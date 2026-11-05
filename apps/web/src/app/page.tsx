"use client";
import { Shell } from "@/components/Shell";
import { Composer } from "@/components/Composer";
import { Feed } from "@/components/Feed";

export default function Home() {
  return <Shell>
    <header className="border-b hairline px-5 py-5"><h1 className="font-display text-base">Feed</h1></header>
    <Composer />
    <Feed />
  </Shell>;
}

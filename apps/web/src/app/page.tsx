"use client";
import { Shell } from "@/components/Shell";
import { Composer } from "@/components/Composer";
import { Feed } from "@/components/Feed";
import { Hero } from "@/components/Hero";

export default function Home() {
  return <Shell>
    <Hero />
    <header className="border-b hairline px-5 py-5"><h2 className="font-display text-base">Feed</h2></header>
    <Composer />
    <Feed />
  </Shell>;
}

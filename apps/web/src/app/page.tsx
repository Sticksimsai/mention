"use client";
import { Shell } from "@/components/Shell";
import { Composer } from "@/components/Composer";
import { Feed } from "@/components/Feed";
import { Hero } from "@/components/Hero";

export default function Home() {
  return <Shell>
    <Hero />
    <header className="feed-header"><h2 className="font-display text-base">Feed</h2><span className="feed-live"><i className="pulse-dot" aria-hidden="true" />Newest first</span></header>
    <Composer />
    <Feed />
  </Shell>;
}

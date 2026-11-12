import type { Metadata } from "next";
import { Shell } from "@/components/Shell";
import { HowTo } from "@/components/howto/HowTo";

export const metadata: Metadata = {
  title: "How it works · memes",
  description: "Launch a coin from your wallet and it opens with its own community. The four steps, an example to try, and the lore.",
};

export default function HowItWorks() {
  return <Shell><HowTo /></Shell>;
}

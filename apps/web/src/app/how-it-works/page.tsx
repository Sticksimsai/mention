import Link from "next/link";
import { Shell } from "@/components/Shell";
import { FlameIcon, HomeIcon, RocketIcon, GearIcon } from "@/components/icons";

const guides = [
  {
    title: "Join a cult", Icon: FlameIcon, href: "/cult", action: "Browse cults",
    body: "Open a community card in Cult. Sign in with X and select Join on its page. You can then post in that cult and take part in its conversations.",
  },
  {
    title: "Create a post", Icon: HomeIcon, href: "/", action: "Open the feed",
    body: "Use + Create post to publish to the public feed. To post in a specific cult, open its page and use the composer there. Add text, an image, or a GIF.",
  },
  {
    title: "Share to X", Icon: GearIcon, href: "/settings", action: "Open settings",
    body: "Connect X for posting in Settings. When writing a post, select Also post to my X and check the preview. Your X copy ends with “posted from onlycults”.",
  },
  {
    title: "Launch a cult", Icon: RocketIcon, href: "/launch", action: "Create a token",
    body: "Choose a name and ticker, then add your art. Launches use a SOL pair and holder rewards. Review the cost and approve in your chosen Solana wallet. Once confirmed, your community appears in Cult.",
  },
];

export default function HowItWorks() {
  return <Shell>
    <header className="border-b hairline px-5 py-6"><h1 className="font-display text-base">How it works</h1></header>
    <div className="grid gap-4 p-5 sm:grid-cols-2">
      {guides.map(({title, Icon, href, action, body}) => (
        <article key={title} className="flex flex-col items-start rounded-2xl border hairline bg-surface p-5">
          <span aria-hidden="true" className="mb-4 rounded-lg border hairline p-2"><Icon /></span>
          <h2 className="ui-heading">{title}</h2>
          <p className="mb-5 mt-3 text-sm leading-6 text-muted">{body}</p>
          <Link href={href} className="mt-auto text-sm font-semibold underline underline-offset-4">{action} →</Link>
        </article>
      ))}
    </div>
  </Shell>;
}

"use client";
// The How it works page: an animated walkthrough, a hands-on example community,
// a little lore, the practical links and a few secrets.
import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { SecretsPanel, SecretsProvider, useSecrets } from "./secrets";

/** Animated asset with a still fallback for visitors who prefer reduced motion. */
function Loop({ name, alt = "", width, height, className }: { name: string; alt?: string; width: number; height: number; className?: string }) {
  return <picture>
    <source media="(prefers-reduced-motion: reduce)" srcSet={`/brand/howto/${name}-still.webp`} />
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src={`/brand/howto/${name}.webp`} alt={alt} width={width} height={height} loading="lazy" className={className} />
  </picture>;
}

/** Fades content up the first time it scrolls into view. Content is visible without JavaScript. */
function Reveal({ children, className = "" }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!element || !("IntersectionObserver" in window)) { setShown(true); return; }
    setArmed(true);
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { setShown(true); observer.disconnect(); }
    }, { rootMargin: "0px 0px -8% 0px" });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return <div ref={ref} className={`${armed ? "reveal" : ""} ${shown ? "is-in" : ""} ${className}`}>{children}</div>;
}

const STEPS = [
  { title: "Connect a wallet", body: "No account and no email. A free signature proves the wallet is yours. It is not a transaction and costs nothing." },
  { title: "Launch your coin", body: "Pick a name, a ticker and an image. Review the cost, then approve once in your wallet. It goes live on Pump.fun with a SOL pair and holder rewards." },
  { title: "It gets a community", body: "The moment the launch confirms, your coin has its own page: a feed, a live chart, a trade tab and a sticker pack." },
  { title: "Join in and talk", body: "Sign in with X, join the community, and you can post and reply. Sharing a post to your own X is optional and off until you turn it on." },
];

function Intro() {
  const { discover } = useSecrets();
  const taps = useRef({ count: 0, at: 0 });
  function tapCoin() {
    const now = Date.now();
    // Seven taps without a long pause.
    taps.current = { count: now - taps.current.at < 2500 ? taps.current.count + 1 : 1, at: now };
    if (taps.current.count >= 7) { taps.current.count = 0; discover("goldrush"); }
  }
  return <header className="howto-intro border-b hairline">
    <button type="button" onClick={tapCoin} className="howto-coin" aria-label="The memes coin">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/memes.webp" alt="" width={72} height={72} />
    </button>
    <div className="min-w-0">
      <h1 className="font-display text-base">How it works</h1>
      <p className="mt-2 max-w-[52ch] text-sm leading-relaxed text-muted">Launch a coin from your wallet and it opens with a community attached. Here is the whole thing in four steps, an example you can poke at, and some lore.</p>
    </div>
  </header>;
}

function Walkthrough() {
  const { discover } = useSecrets();
  const order = useRef<number[]>([]);
  function pressNumber(step: number) {
    order.current = [...order.current, step].slice(-4);
    if (order.current.join("") === "4321") { order.current = []; discover("parade"); }
  }
  return <section aria-labelledby="steps-title" className="howto-section">
    <h2 id="steps-title" className="ui-heading">The four steps</h2>
    <ol className="howto-steps">
      {STEPS.map((step, index) => <li key={step.title}>
        <Reveal className="howto-step">
          <div className="howto-step-media"><Loop name={`step-${index + 1}`} width={480} height={250} /></div>
          <div className="flex items-start gap-3 p-4">
            <button type="button" onClick={() => pressNumber(index + 1)} className="hero-step-number howto-step-button" aria-label={`Step ${index + 1}`}>{index + 1}</button>
            <div className="min-w-0"><h3 className="howto-step-title">{step.title}</h3><p className="mt-1.5 text-sm leading-relaxed text-muted">{step.body}</p></div>
          </div>
        </Reveal>
      </li>)}
    </ol>
  </section>;
}

interface ExamplePost { id: string; name: string; handle: string; avatar: "gold" | "cream" | "you"; text: string; meme?: boolean; tag?: string }
const SEED_POSTS: ExamplePost[] = [
  { id: "meme", name: "Blobfather", handle: "blobfather", avatar: "gold", text: "gm. we are so back.", meme: true },
  { id: "launch", name: "7xKq…9fPz", handle: "sol_7xkq9fpz", avatar: "cream", tag: "Launched this coin", text: "launched $BLOB straight from my wallet. no account, one signature, one transaction." },
  { id: "ask", name: "Latecomer", handle: "latecomer", avatar: "cream", text: "how do i post in here?" },
  { id: "answer", name: "Blobfather", handle: "blobfather", avatar: "gold", text: "@latecomer join first. then say gm. those are the rules." },
];

function Avatar({ kind }: { kind: ExamplePost["avatar"] }) {
  if (kind === "you") return <span className="howto-avatar howto-avatar-you" aria-hidden="true">you</span>;
  // eslint-disable-next-line @next/next/no-img-element
  return <span className="howto-avatar" aria-hidden="true"><img src={`/brand/howto/blob-${kind}-still.webp`} alt="" width={28} height={28} /></span>;
}

function ExampleCommunity() {
  const { discover } = useSecrets();
  const [joined, setJoined] = useState(false);
  const [draft, setDraft] = useState("");
  const [posts, setPosts] = useState(SEED_POSTS);
  const [posted, setPosted] = useState(false);
  function publish() {
    const text = draft.trim();
    if (!joined || !text) return;
    setPosts(current => [{ id: `you-${current.length}`, name: "You", handle: "you", avatar: "you", text }, ...current]);
    setDraft(""); setPosted(true);
    if (/^gm[.!\s]*$/i.test(text)) discover("gm");
  }
  return <section aria-labelledby="example-title" className="howto-section">
    <h2 id="example-title" className="ui-heading">Try it on an example</h2>
    <p className="mt-2 max-w-[60ch] text-sm leading-relaxed text-muted">This is what a coin&rsquo;s community looks like. Join it, then post. <span className="text-fg">$BLOB is made up</span>: it is not a real token and nothing you type here is saved or sent anywhere.</p>
    <Reveal className="howto-example">
      <div className="howto-example-banner" aria-hidden="true" />
      <div className="flex flex-wrap items-end justify-between gap-3 px-4 pb-4 pt-2">
        <div className="flex min-w-0 items-end gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/howto/blob-coin.webp" alt="" width={72} height={72} className="howto-example-pfp" />
          <div className="min-w-0 pb-1">
            <p className="flex flex-wrap items-baseline gap-2"><span className="user-display-name">Blob</span><span className="text-xs text-muted">$BLOB</span></p>
            <p className="mt-1 text-xs text-muted"><span className="text-fg">{joined ? 129 : 128}</span> members · example community</p>
          </div>
        </div>
        <button type="button" onClick={() => setJoined(value => !value)} aria-pressed={joined}
          className={`rounded-full px-5 py-2 text-sm font-semibold transition ${joined ? "border hairline text-fg" : "bg-volt text-ink hover:bg-volt-deep"}`}>{joined ? "Joined" : "Join"}</button>
      </div>
      <ol className="howto-progress" aria-label="Your progress in this example">
        <li className={joined ? "is-done" : "is-next"}><span aria-hidden="true">{joined ? "✓" : "1"}</span>Join the community</li>
        <li className={posted ? "is-done" : joined ? "is-next" : ""}><span aria-hidden="true">{posted ? "✓" : "2"}</span>Post something</li>
      </ol>
      <form className="howto-composer" onSubmit={event => { event.preventDefault(); publish(); }}>
        <label htmlFor="example-post" className="sr-only">Write an example post</label>
        <textarea id="example-post" rows={2} maxLength={280} disabled={!joined} value={draft} onChange={event => setDraft(event.target.value)}
          placeholder={joined ? "Say something to $BLOB…" : "Join $BLOB to post"} />
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted">{joined ? "On a real community you would also be signed in with X." : "Posting is for members. Join first."}</p>
          <button type="submit" disabled={!joined || !draft.trim()} className="rounded-full bg-volt px-5 py-2 text-sm font-semibold text-ink transition hover:bg-volt-deep disabled:opacity-40">Post</button>
        </div>
      </form>
      <ul className="divide-y divide-line border-t hairline">
        {posts.map(post => <li key={post.id} className="howto-post">
          <Avatar kind={post.avatar} />
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs"><span className="font-semibold text-fg">{post.name}</span><span className="text-muted">@{post.handle}</span>{post.tag && <span className="rounded border border-volt/30 px-1.5 py-0.5 text-[10px] text-volt">{post.tag}</span>}</p>
            <p className="mt-1 break-words text-sm leading-relaxed">{post.text}</p>
            {post.meme && <div className="howto-meme"><Loop name="blob-meme" alt="Pixel meme: a gold blob in sunglasses with a crowd of blobs behind it. Caption: You launched. They all came." width={480} height={480} /></div>}
          </div>
        </li>)}
      </ul>
    </Reveal>
  </section>;
}

const LORE = [
  { art: "coin", text: "In the beginning there was a coin. It had a ticker, a chart, and nobody to talk to." },
  { art: "one", text: "A blob wandered past and said gm. The coin said nothing back, because it was a coin." },
  { art: "many", text: "The blob came back with friends. They made jokes about the coin. The jokes became memes." },
  { art: "all", text: "The coin was still just a coin. But now it had people, and that turned out to be the point." },
] as const;

function LoreArt({ kind }: { kind: typeof LORE[number]["art"] }) {
  const blobs = kind === "one" ? 1 : kind === "many" ? 3 : kind === "all" ? 5 : 0;
  return <div className={`howto-lore-art howto-lore-${kind}`} aria-hidden="true">
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src="/brand/memes.webp" alt="" width={44} height={44} className="howto-lore-coin" />
    {Array.from({ length: blobs }, (_, i) => <Loop key={i} name={i % 2 ? "blob-gold" : "blob-cream"} width={30} height={30} className="howto-lore-blob" />)}
  </div>;
}

function Lore() {
  return <section aria-labelledby="lore-title" className="howto-section">
    <h2 id="lore-title" className="ui-heading">The lore</h2>
    <p className="mt-2 text-sm text-muted">As told by the blobs. Accuracy not guaranteed.</p>
    <ol className="howto-lore">
      {LORE.map((beat, index) => <li key={beat.art}>
        <Reveal className="howto-lore-beat">
          <LoreArt kind={beat.art} />
          <p className="text-sm leading-relaxed"><span className="mr-2 font-mono text-xs text-volt">{String(index + 1).padStart(2, "0")}</span>{beat.text}</p>
        </Reveal>
      </li>)}
    </ol>
    <p className="howto-moral">A coin is just a coin until someone shows up.</p>
  </section>;
}

const LINKS = [
  { href: "/launch", label: "Launch a coin", note: "Wallet only. No sign-in." },
  { href: "/cult", label: "Browse communities", note: "Find one and join it." },
  { href: "/", label: "Open the feed", note: "Everything, newest first." },
  { href: "/settings", label: "Connect X posting", note: "Optional. Off by default." },
];

const FAQ = [
  { q: "Do I need an account to launch?", a: "No. A Solana wallet is enough. You connect it, sign a free message to prove it is yours, and launch." },
  { q: "What does a launch cost?", a: "Your wallet pays the network rent and fees for creating the token. The exact amount is shown in the review before you approve. memes adds no launch surcharge." },
  { q: "Why do I have to join before I can post?", a: "A community belongs to the people in it. Joining takes one tap after signing in with X, and it is what lets you post and reply there." },
  { q: "I launched with just a wallet. How do I post in my own community?", a: "Sign in with X in the same browser, ideally straight after launching. Your community moves to your X account and you can post in and manage it." },
  { q: "Will memes post to my X account?", a: "Only if you ask it to. Signing in does not grant posting. You enable it in Settings and then choose it per post." },
];

export function HowTo() {
  return <SecretsProvider>
    <Intro />
    <Walkthrough />
    <ExampleCommunity />
    <Lore />
    <section aria-labelledby="real-title" className="howto-section">
      <h2 id="real-title" className="ui-heading">Now do it for real</h2>
      <ul className="howto-links">
        {LINKS.map(link => <li key={link.href}><Link href={link.href} className="howto-link"><span className="text-sm font-semibold">{link.label} <span aria-hidden="true">→</span></span><span className="mt-1 block text-xs text-muted">{link.note}</span></Link></li>)}
      </ul>
    </section>
    <section aria-labelledby="faq-title" className="howto-section">
      <h2 id="faq-title" className="ui-heading">Questions</h2>
      <div className="mt-4 space-y-2">
        {FAQ.map(item => <details key={item.q} className="howto-faq"><summary>{item.q}</summary><p>{item.a}</p></details>)}
      </div>
    </section>
    <div className="howto-section"><SecretsPanel /></div>
  </SecretsProvider>;
}

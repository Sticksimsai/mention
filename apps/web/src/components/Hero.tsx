"use client";
// Home hero: explains the product in one glance before the feed.
// The loop is decorative, so it stays muted, hidden from assistive tech,
// and holds on its poster frame when the visitor prefers reduced motion.
import { useEffect, useRef, useState } from "react";
import Link from "next/link";

const DISMISS_KEY = "memes:hero-hidden";

const steps = [
  { title: "Connect a wallet", body: "No account needed. Your wallet funds and signs the launch." },
  { title: "Launch your coin", body: "It goes live on Pump.fun in one reviewed transaction." },
  { title: "It gets a community", body: "Every coin opens with its own feed, chart and page." },
  { title: "Join in and talk", body: "Sign in with X and join a community to post and reply." },
];

export function Hero() {
  const video = useRef<HTMLVideoElement>(null);
  // Start visible so the server render and first paint match; hide after reading the saved choice.
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    try { setHidden(localStorage.getItem(DISMISS_KEY) === "1"); } catch { /* storage unavailable: keep showing */ }
  }, []);
  useEffect(() => {
    const element = video.current;
    if (!element || hidden) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => { if (reduce.matches) element.pause(); else void element.play().catch(() => { /* autoplay blocked: poster stays */ }); };
    sync();
    reduce.addEventListener("change", sync);
    return () => reduce.removeEventListener("change", sync);
  }, [hidden]);

  function hide() {
    setHidden(true);
    try { localStorage.setItem(DISMISS_KEY, "1"); } catch { /* hidden for this visit only */ }
  }
  function show() {
    setHidden(false);
    try { localStorage.removeItem(DISMISS_KEY); } catch { /* nothing stored */ }
  }

  if (hidden) {
    return <div className="flex items-center justify-between gap-3 border-b hairline px-5 py-3 text-xs text-muted">
      <h1 className="sr-only">Just Memes</h1>
      <span>Launch a coin from your wallet. Every coin gets a community.</span>
      <button type="button" onClick={show} className="shrink-0 text-volt hover:underline">How it works</button>
    </div>;
  }

  return <section aria-labelledby="hero-title" className="hero border-b hairline">
    <div className="hero-grid">
      <div className="min-w-0">
        <p className="hero-eyebrow">How Just Memes works</p>
        <h1 id="hero-title" className="hero-title">Every coin gets a <span className="text-volt">community</span>.</h1>
        <p className="hero-sub">Launch a coin straight from your wallet. It opens with its own feed, where holders join, post and bring it to life.</p>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Link href="/launch" className="rounded-full bg-volt px-6 py-2.5 text-sm font-semibold text-ink transition hover:bg-volt-deep">Launch a coin</Link>
          <Link href="/cult" className="rounded-full border hairline px-6 py-2.5 text-sm font-semibold text-fg transition hover:border-volt/60">Explore communities</Link>
        </div>
      </div>
      <div className="hero-media">
        <video ref={video} muted loop playsInline preload="metadata" aria-hidden="true" tabIndex={-1}
          poster="/brand/how-it-works-poster.webp" width={960} height={540}>
          <source src="/brand/how-it-works-loop.mp4" type="video/mp4" />
        </video>
      </div>
    </div>
    <ol className="hero-steps">
      {steps.map((step, index) => <li key={step.title}>
        <span className="hero-step-number" aria-hidden="true">{index + 1}</span>
        <div className="min-w-0"><p className="hero-step-title">{step.title}</p><p className="hero-step-body">{step.body}</p></div>
      </li>)}
    </ol>
    <div className="flex items-center justify-between gap-3 px-5 pb-4 text-xs text-muted sm:px-7">
      <Link href="/how-it-works" className="text-volt hover:underline">Read the full guide</Link>
      <button type="button" onClick={hide} className="hover:text-fg">Hide this</button>
    </div>
  </section>;
}

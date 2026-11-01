"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Shell } from "@/components/Shell";

const sections = ["Overview", "Launching", "X mirroring", "Trading", "Fees", "Rules & roles"];
const ids = ["overview", "launch", "mirroring", "trading", "fees", "rules"];
const journey = [
  { title: "Bring your identity", label: "Sign in", icon: "𝕏", detail: "Sign in with X. Your photo and handle become your identity on Mentions.", tag: "01 / YOUR ACCOUNT" },
  { title: "Find your people", label: "Join", icon: "@", detail: "Explore token communities. Join the conversations you want to follow.", tag: "02 / YOUR COMMUNITIES" },
  { title: "Keep the conversation moving", label: "Post", icon: "↗", detail: "Post in the community feed. Enable X posting separately to share a post on both platforms.", tag: "03 / YOUR VOICE" },
  { title: "Explore the token", label: "Trade", icon: "⇄", detail: "Open the community’s Trade tab, review the details, and approve the transaction in your wallet.", tag: "04 / YOUR WALLET" },
];

export default function DocsPage() {
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [active, setActive] = useState("overview");
  useEffect(() => {
    const motion = matchMedia("(prefers-reduced-motion: reduce)");
    setPlaying(!motion.matches);
    const update = () => setPlaying(!motion.matches);
    motion.addEventListener("change", update);
    return () => motion.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => setStep(s => (s+1)%journey.length), 5000);
    return () => clearInterval(timer);
  }, [playing]);
  useEffect(() => {
    const observer = new IntersectionObserver(entries => {
      const visible = entries.filter(e => e.isIntersecting).sort((a,b) => a.boundingClientRect.top-b.boundingClientRect.top);
      if (visible[0]) setActive(visible[0].target.id);
    }, { rootMargin: "-100px 0px -55% 0px" });
    ids.forEach(id => { const el=document.getElementById(id); if(el) observer.observe(el); });
    return () => observer.disconnect();
  }, []);
  return <Shell wide>
    <div className="border-b hairline px-5 py-5 sm:px-8"><span className="font-display text-sm">Docs</span><span className="ml-3 text-xs text-muted">The Mentions field guide</span></div>
    <div className="docs-layout">
      <nav aria-label="On this page" className="docs-toc">
        <p className="mb-3 hidden text-[10px] uppercase tracking-[.18em] text-muted xl:block">On this page</p>
        {sections.map((label,i)=><a key={ids[i]} href={`#${ids[i]}`} aria-current={active===ids[i]?"location":undefined} className={active===ids[i]?"is-active":""}><span className="font-mono text-[10px] opacity-50">0{i+1}</span>{label}</a>)}
      </nav>
      <div className="min-w-0 space-y-12 pb-12">
        <section id="overview" className="docs-section">
          <p className="mb-4 text-[10px] font-semibold uppercase tracking-[.2em] text-volt">A little context. A lot of possibility.</p>
          <h1 className="text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">Your community.<br/><span className="text-muted">In the conversation.</span></h1>
          <p className="mt-5 max-w-xl text-sm leading-7 text-muted">Mentions brings token communities, social feeds, and Solana trading into one place. Start with your X identity. Find your people. Build from there.</p>
          <div className="mt-6 flex flex-wrap gap-3"><Link className="rounded-lg bg-volt px-4 py-2.5 text-sm font-semibold text-ink hover:bg-volt-deep" href="/explore">Explore communities ↗</Link><Link className="rounded-lg border hairline px-4 py-2.5 text-sm hover:bg-surface" href="/launch">Launch a token</Link></div>
          <div className="docs-demo mt-8">
            <div className="flex items-center justify-between gap-3 border-b hairline px-5 py-3"><span className="text-xs text-muted">How it works</span><button onClick={()=>setPlaying(p=>!p)} aria-pressed={playing} className="text-xs text-volt">{playing?"Pause animation":"Play animation"}</button></div>
            <div className="grid grid-cols-4 border-b hairline" role="tablist" aria-label="Walkthrough steps">{journey.map((s,i)=><button role="tab" id={`step-${i}`} aria-selected={step===i} aria-controls="walkthrough" key={s.label} onKeyDown={e=>{ if(e.key==="ArrowRight" || e.key==="ArrowLeft") { e.preventDefault(); const next=(i+(e.key==="ArrowRight"?1:3))%4; setStep(next); setPlaying(false); document.getElementById(`step-${next}`)?.focus(); } }} onClick={()=>{setStep(i);setPlaying(false);}} className={`border-b-2 px-1 py-3 text-xs transition-colors ${step===i?"border-volt bg-volt/5 text-volt":"border-transparent text-muted hover:text-fg"}`}>{s.label}</button>)}</div>
            <div id="walkthrough" role="tabpanel" aria-labelledby={`step-${step}`} className="min-h-[250px] p-5 sm:p-7">
              <div key={step} className="docs-scene flex flex-col gap-6 sm:flex-row sm:items-center">
                <div aria-hidden="true" className="docs-orbit"><span className="docs-orbit-dot"/><span className="font-display text-4xl text-volt">{journey[step].icon}</span></div>
                <div className="flex-1"><p className="mb-3 font-mono text-[10px] tracking-widest text-volt">{journey[step].tag}</p><h2 className="text-xl font-semibold tracking-tight">{journey[step].title}</h2><p className="mt-3 text-sm leading-6 text-muted">{journey[step].detail}</p></div>
              </div>
            </div>
            <div className="flex gap-1 px-5 pb-4" aria-hidden="true">{journey.map((_,i)=><span key={i} className={`h-1 flex-1 rounded-full ${i===step?"bg-volt":"bg-line"}`}/>)}</div>
          </div>
        </section>
        <Doc id="launch" number="02" title="From an idea to a community" intro="Launching a token creates its community. You don’t need to set up a separate feed.">
          <div className="grid gap-3 sm:grid-cols-2">{[
            ["01", "Make it yours", "Add a name, ticker, image, and description in the Launchpad."],
            ["02", "Set your wallet", "Provide the Solana wallet that receives your launcher share of creator fees."],
            ["03", "Launch together", "The mint opens on pump.fun’s bonding curve and the community opens alongside it."],
            ["04", "Grow the room", "Share the community, pin a welcome post, and manage its appearance and posting rules."],
          ].map(([n,t,d])=><div key={n} className="docs-card"><span className="font-mono text-xs text-volt">{n}</span><h3 className="mb-2 mt-4 text-sm font-semibold">{t}</h3><p className="text-xs leading-6 text-muted">{d}</p></div>)}</div>
          <Note>Communities can be transferred to another owner, but cannot be deleted.</Note>
        </Doc>
        <Doc id="mirroring" number="03" title="One conversation. Two places." intro="Bring matching X posts into a community, and choose when to share your Mentions posts back to X.">
          <div className="docs-flow" aria-hidden="true"><span>𝕏</span><span className="docs-flow-track"><i style={{ animationPlayState: playing ? "running" : "paused" }}/></span><span className="font-display text-xs text-volt">mentions</span></div>
          <div className="grid gap-3 sm:grid-cols-2"><div className="docs-card"><p className="mb-3 text-xs font-semibold text-volt">X → Mentions</p><p className="text-sm leading-6 text-muted">Matching posts from monitored member accounts appear in the community feed when they include its $TICKER or contract address. Import timing varies with account activity.</p></div><div className="docs-card"><p className="mb-3 text-xs font-semibold text-volt">Mentions → X</p><p className="text-sm leading-6 text-muted">Enable X posting in Settings, then select “Also post to my X” when composing. You can revoke that connection.</p></div></div>
          <Note>Signing in with X and granting permission to post to X are separate steps.</Note>
        </Doc>
        <Doc id="trading" number="04" title="The market, next to the conversation" intro="Each community has a Trade tab. Review the token, amount, and transaction details before approving in your wallet.">
          <div className="flex flex-wrap items-center gap-3 rounded-xl border hairline bg-surface p-5 text-sm"><span className="rounded-lg bg-raised px-3 py-2">Bonding curve</span><span className="text-muted">→ Graduation →</span><span className="rounded-lg border border-volt/20 px-3 py-2 text-volt">PumpSwap</span></div>
          <p className="text-sm leading-7 text-muted">Trades route to pump.fun before graduation and PumpSwap afterward. Your profile also includes your personal Solana wallet, deposit address, and recent activity.</p>
          <Note>Token prices can move quickly. Network costs and applicable trading fees are separate from the amount you trade.</Note>
        </Doc>
        <Doc id="fees" number="05" title="Know what you’re paying" intro="A quick reference for platform fees. Review the transaction details for the actual costs before you approve.">
          <div className="overflow-x-auto rounded-xl border hairline"><table className="w-full min-w-[400px] text-left text-sm"><thead className="bg-surface text-xs text-muted"><tr><th className="p-4 font-medium">Action</th><th className="p-4 font-medium">Fee</th></tr></thead><tbody>{[["Launch a token","No platform launch fee; network costs apply"],["Trade inside Mentions","Configured platform fee, plus provider, venue, and network fees"],["Trade directly on pump.fun / PumpSwap","Venue’s standard fees"],["Creator fees","pump.fun’s dynamic rate; shared with the launcher"]].map(([a,b])=><tr key={a} className="border-t hairline"><th className="p-4 font-medium">{a}</th><td className="p-4 text-muted">{b}</td></tr>)}</tbody></table></div>
          <p className="text-sm leading-7 text-muted">For tokens launched through Mentions, creator fees accrue to the platform creator account and are split with the launcher. Collected fees are reconciled and allocated before payout approval. Approved payouts go to the wallet supplied at launch when payout execution is enabled.</p>
        </Doc>
        <Doc id="rules" number="06" title="A good room needs good rules" intro="Clear ownership and moderation keep communities useful.">
          <div className="space-y-3">{[["Community owners","Manage appearance, pin and remove posts, set posting cooldowns, remove members, and transfer ownership."],["Site staff","Moderate posts and ban accounts across the site."],["Members","Join conversations and follow community rules. Banned accounts are read-only; posts remain unless removed."]].map(([a,b])=><div key={a} className="docs-card"><h3 className="mb-2 text-sm font-semibold">{a}</h3><p className="text-sm leading-6 text-muted">{b}</p></div>)}</div>
        </Doc>
        <div className="rounded-2xl border border-volt/20 bg-volt/5 p-6"><p className="text-lg font-semibold">Find your next conversation.</p><Link href="/explore" className="mt-3 inline-block text-sm font-semibold text-volt">Explore Mentions ↗</Link></div>
      </div>
    </div>
  </Shell>;
}
function Doc({id,number,title,intro,children}:{id:string;number:string;title:string;intro:string;children:React.ReactNode}) {
  return <section id={id} className="docs-section border-t hairline pt-8"><div className="mb-5"><span className="font-mono text-xs text-volt">{number} /</span><h2 className="mb-3 mt-3 text-2xl font-semibold tracking-tight">{title}</h2><p className="text-sm leading-7 text-muted">{intro}</p></div><div className="space-y-5">{children}</div></section>;
}
function Note({children}:{children:React.ReactNode}) { return <p className="border-l-2 border-volt/40 pl-4 text-xs leading-6 text-muted">{children}</p>; }

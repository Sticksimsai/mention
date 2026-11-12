"use client";
// Hidden extras on the How it works page. Each secret has a keyboard trigger and a
// pointer trigger so it can be found on any device. Finding one never changes real data.
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

export type SecretId = "goldrush" | "gm" | "parade";

export const SECRETS: { id: SecretId; name: string; hint: string; how: string }[] = [
  { id: "goldrush", name: "Gold rush", hint: "The coin at the top likes attention.", how: "You tapped the coin seven times." },
  { id: "gm", name: "First words", hint: "Say good morning. Anywhere.", how: "You said gm." },
  { id: "parade", name: "The procession", hint: "Some steps only make sense backwards.", how: "You walked the steps in reverse." },
];

const STORAGE_KEY = "memes:secrets";
const KONAMI = ["ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown", "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight", "b", "a"];
const EFFECT_MS = 4200;

interface SecretsState { found: SecretId[]; discover: (id: SecretId) => void }
const SecretsContext = createContext<SecretsState>({ found: [], discover: () => {} });
export const useSecrets = () => useContext(SecretsContext);

const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));

export function SecretsProvider({ children }: { children: ReactNode }) {
  const [found, setFound] = useState<SecretId[]>([]);
  const [effect, setEffect] = useState<{ id: SecretId; run: number } | null>(null);
  const [notice, setNotice] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
      if (Array.isArray(saved)) setFound(SECRETS.map(s => s.id).filter(id => saved.includes(id)));
    } catch { /* storage unavailable: secrets reset each visit */ }
  }, []);

  const discover = useCallback((id: SecretId) => {
    const secret = SECRETS.find(s => s.id === id)!;
    setFound(current => {
      const next = current.includes(id) ? current : [...current, id];
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* not saved */ }
      setNotice(`${current.includes(id) ? "Again" : "Secret found"}: ${secret.name} (${next.length}/${SECRETS.length})`);
      return next;
    });
    setEffect(previous => ({ id, run: (previous?.run ?? 0) + 1 }));
    clearTimeout(timer.current);
    timer.current = setTimeout(() => { setEffect(null); setNotice(""); }, EFFECT_MS);
  }, []);
  useEffect(() => () => clearTimeout(timer.current), []);

  // Keyboard triggers: the classic code for the procession, and "gm" typed outside any field.
  useEffect(() => {
    let code = 0;
    let lastG = 0;
    function onKey(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey || isTyping(event.target)) return;
      const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
      code = key === KONAMI[code] ? code + 1 : key === KONAMI[0] ? 1 : 0;
      if (code === KONAMI.length) { code = 0; discover("parade"); }
      if (key === "g") lastG = Date.now();
      else if (key === "m" && Date.now() - lastG < 1500) { lastG = 0; discover("gm"); }
      else if (key.length === 1) lastG = 0;
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [discover]);

  return <SecretsContext.Provider value={{ found, discover }}>
    {children}
    <p role="status" aria-live="polite" className={`secret-toast ${notice ? "is-visible" : ""}`}>{notice}</p>
    {effect && <SecretEffect key={`${effect.id}-${effect.run}`} id={effect.id} />}
  </SecretsContext.Provider>;
}

/** Purely decorative: hidden from assistive tech, never intercepts clicks, removed when it ends. */
function SecretEffect({ id }: { id: SecretId }) {
  if (id === "goldrush") {
    return <div className="secret-layer" aria-hidden="true">
      {Array.from({ length: 26 }, (_, i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={i} src="/brand/memes.webp" alt="" className="secret-coin"
          style={{ left: `${(i * 37 + 5) % 96}%`, width: 22 + (i % 4) * 9, animationDelay: `${(i % 9) * 0.16}s`, animationDuration: `${1.9 + (i % 5) * 0.28}s` }} />
      ))}
    </div>;
  }
  if (id === "gm") {
    return <div className="secret-layer" aria-hidden="true">
      <div className="secret-gm">
        <span className="secret-bubble">gm</span>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/howto/blob-gold.webp" alt="" width={96} height={96} />
      </div>
    </div>;
  }
  return <div className="secret-layer" aria-hidden="true">
    <div className="secret-parade">
      {Array.from({ length: 8 }, (_, i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={i} src={`/brand/howto/${i % 3 === 1 ? "blob-gold" : "blob-cream"}.webp`} alt="" width={64} height={64}
          style={{ animationDelay: `${(i % 2) * 0.21}s` }} />
      ))}
    </div>
  </div>;
}

export function SecretsPanel() {
  const { found } = useSecrets();
  return <section aria-labelledby="secrets-title" className="howto-secrets">
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <h2 id="secrets-title" className="ui-heading">Secrets</h2>
      <p className="text-xs text-muted"><span className="text-volt">{found.length}</span> of {SECRETS.length} found</p>
    </div>
    <ul className="mt-4 grid gap-2 sm:grid-cols-3">
      {SECRETS.map(secret => {
        const done = found.includes(secret.id);
        return <li key={secret.id} className={`howto-secret ${done ? "is-found" : ""}`}>
          <p className="text-xs font-semibold">{done ? secret.name : "? ? ?"}</p>
          <p className="mt-1 text-xs leading-relaxed text-muted">{done ? secret.how : secret.hint}</p>
        </li>;
      })}
    </ul>
  </section>;
}

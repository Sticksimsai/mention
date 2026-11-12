import Link from "next/link";

export function BrandLogo({ compact = false }: { compact?: boolean }) {
  return <Link href="/" aria-label="memes home" className="flex w-fit items-center gap-2 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-volt">
    <picture><source media="(prefers-reduced-motion: reduce)" srcSet="/brand/memes.webp" /><img src="/brand/memes-turn.webp" width={32} height={32} alt="" className="h-8 w-8 shrink-0 object-contain" /></picture>
    <span className={`font-display font-normal lowercase leading-none text-volt ${compact ? "text-xs" : "text-xs"}`}>memes</span>
  </Link>;
}

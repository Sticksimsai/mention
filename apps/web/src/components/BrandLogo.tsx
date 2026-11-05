import Link from "next/link";

export function BrandLogo({ compact = false }: { compact?: boolean }) {
  return <Link href="/" aria-label="onlycults home" className="flex w-fit items-center gap-3 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-volt">
    <img src="/brand/onlycults.webp" width={32} height={32} alt="" className="h-8 w-8 shrink-0 object-contain" />
    <span className={`font-display font-normal lowercase leading-none text-white ${compact ? "text-xs" : "text-sm"}`}>onlycults</span>
  </Link>;
}

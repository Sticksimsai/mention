import Link from "next/link";
import { RotatingLogo } from "./RotatingLogo";

export function BrandLogo({ compact = false }: { compact?: boolean }) {
  return <Link href="/" aria-label="Mentions home" className="flex w-fit items-center gap-3 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-volt">
    <span className="relative flex h-10 w-5 shrink-0 items-center justify-center"><span className="absolute flex h-10 w-10 items-center justify-center [&>canvas]:h-10 [&>canvas]:w-10"><RotatingLogo compact /></span></span>
    <span className={`font-display font-normal lowercase leading-none text-white ${compact ? "text-xs" : "text-sm"}`}>mentions</span>
  </Link>;
}

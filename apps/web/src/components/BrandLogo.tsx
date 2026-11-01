import Link from "next/link";
import { RotatingLogo } from "./RotatingLogo";

export function BrandLogo({ compact = false }: { compact?: boolean }) {
  return (
    <Link
      href="/"
      aria-label="Mention home"
      className="mx-auto flex w-fit flex-col items-center rounded-xl px-4 pb-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-volt"
    >
      <RotatingLogo compact={compact} />
      <span className={`font-[Cocogoose] font-bold lowercase leading-none tracking-tight text-white ${compact ? "text-sm" : "text-lg"}`}>
        mention
      </span>
    </Link>
  );
}

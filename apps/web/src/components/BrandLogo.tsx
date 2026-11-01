import Link from "next/link";

export function BrandLogo({ compact = false }: { compact?: boolean }) {
  return (
    <Link
      href="/"
      aria-label="Mention home"
      className="mx-auto flex w-fit flex-col items-center rounded-xl px-4 pb-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-volt"
    >
      <picture>
        <source media="(prefers-reduced-motion: reduce)" srcSet="/brand/mention-still.webp" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/brand/mention-rotation.webp"
          alt=""
          width={512}
          height={512}
          className={compact ? "h-14 w-14 object-contain" : "h-20 w-20 object-contain"}
          decoding="async"
        />
      </picture>
      <span className={`font-body font-bold lowercase leading-none tracking-tight text-white ${compact ? "text-sm" : "text-lg"}`}>
        mention
      </span>
    </Link>
  );
}

import { Shell } from "@/components/Shell";
import { Feed } from "@/components/Feed";

export default function Home() {
  return (
    <Shell>
      <div className="sticky top-0 z-10 border-b hairline bg-ink/80 px-5 py-4 backdrop-blur">
        <h1 className="font-display text-base font-medium">Feed</h1>
        <p className="text-xs text-muted">Everything posted here and every matching tweet on X, in one stream.</p>
      </div>
      <Feed />
    </Shell>
  );
}

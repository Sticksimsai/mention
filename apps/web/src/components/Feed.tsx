"use client";

import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNowStrict } from "date-fns";
import Link from "next/link";
import type { PostView, FeedItem, MarketActivityView } from "@mention/shared";
import { api } from "@/lib/api";
import { useMe } from "@/lib/hooks";

interface FeedPage { items: FeedItem[]; nextCursor: string | null }

export function Feed({ communityId, author, scope }: {
  communityId?: string;
  author?: string;
  /** "joined" = only the viewer's communities (needs auth) */
  scope?: "joined";
}) {
  const { me } = useMe();
  const params = new URLSearchParams({ includeMarkets: "true" });
  if (communityId) params.set("communityId", communityId);
  if (author) params.set("author", author);
  if (me) params.set("viewerId", me.id);
  if (scope === "joined" && me) params.set("scope", "joined");

  const feed = useInfiniteQuery({
    queryKey: ["feed", communityId ?? "global", author ?? "", scope ?? "all", me?.id ?? ""],
    queryFn: ({ pageParam }) => {
      const p = new URLSearchParams(params);
      if (pageParam) p.set("cursor", pageParam);
      return api<FeedPage>(`/v1/feed?${p}`, { auth: false });
    },
    initialPageParam: "",
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    refetchInterval: communityId || author ? 20_000 : 8_000,
  });

  const allItems = feed.data?.pages.flatMap((p) => p.items) ?? [];
  const items = allItems.filter((p,i)=>allItems.findIndex(other=>other.id===p.id)===i);

  if (feed.isLoading) return <FeedSkeleton />;
  if (feed.isError) return <div className="px-6 py-12 text-center"><p className="text-sm text-muted">Could not load posts.</p><button onClick={() => feed.refetch()} className="mt-3 text-sm text-volt">Try again</button></div>;
  if (items.length === 0) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center px-6 py-20 text-center text-muted">
        <p className="mb-2 text-base font-semibold text-fg">
          {scope === "joined" ? "Your communities are quiet" : "Nothing here yet"}
        </p>
        <p className="text-sm leading-6">
          {scope === "joined"
            ? "Join a community and its posts — on-site and from X — show up here."
            : "Community posts, matching tweets and real mentionmarkets updates appear here."}
        </p>
        {!communityId && !author && (
          <Link href="/explore" className="mt-6 rounded-xl border hairline bg-surface px-4 py-2.5 text-sm font-medium text-fg transition-colors hover:border-volt/40 hover:text-volt">
            Explore communities
          </Link>
        )}
      </div>
    );
  }

  return (
    <div>
      {items.map((p) => p.source === "market" ? <MarketActivityCard key={p.id} activity={p} /> : <PostCard key={p.id} post={p} />)}
      {feed.hasNextPage && (
        <button
          onClick={() => feed.fetchNextPage()}
          disabled={feed.isFetchingNextPage}
          className="w-full border-t hairline py-4 text-sm text-volt hover:bg-surface disabled:opacity-50"
        >
          {feed.isFetchingNextPage ? "Loading…" : "Show more"}
        </button>
      )}
    </div>
  );
}

export function PostCard({ post }: { post: PostView }) {
  const { authenticated, login, me } = useMe();
  const qc = useQueryClient();

  const act = useMutation({
    mutationFn: ({ action }: { action: string }) =>
      api(`/v1/posts/${post.id}/${action}`, { method: "POST" }),
    onSettled: () => { qc.invalidateQueries({ queryKey: ["feed"] }); qc.invalidateQueries({ queryKey: ["post",post.id] }); },
  });

  function engage(liked: boolean | undefined, on: string, off: string) {
    if (!authenticated) return login();
    act.mutate({ action: liked ? off : on });
  }

  return (
    <article className="border-b hairline px-5 py-4 hover:bg-surface/40">
      <div className="flex gap-3">
        {post.author.pfpUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={post.author.pfpUrl} alt="" className="h-10 w-10 shrink-0 rounded-full" />
        ) : (
          <div className="h-10 w-10 shrink-0 rounded-full bg-raised" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
            <Link href={`/u/${post.author.username}`} className="font-semibold hover:underline">
              {post.author.name}
            </Link>
            <span className="text-muted">@{post.author.username}</span>
            <Link href={`/post/${encodeURIComponent(post.id)}`} className="text-muted hover:underline">· {formatDistanceToNowStrict(new Date(post.createdAt))}</Link>
            {post.communityName && (
              <Link href={`/t/${post.communityId}`} className="text-volt hover:underline">
                ${post.communityTicker}
              </Link>
            )}
            {post.source === "x" && post.tweetUrl && (
              <a href={post.tweetUrl} target="_blank" rel="noreferrer"
                 className="rounded-md bg-raised px-1.5 py-0.5 text-[11px] text-muted hover:text-fg"
                 title="Mirrored from X">
                from 𝕏
              </a>
            )}
            {post.source === "native" && post.author.id === me?.id && post.crosspostStatus === "pending" && <span className="text-[11px] text-muted">Queued for X</span>}
            {post.source === "native" && post.author.id === me?.id && post.crosspostStatus === "failed" && <span className="text-[11px] text-down">X cross-post failed</span>}
            {post.source === "native" && post.crosspostStatus === "posted" && post.tweetUrl && (
              <a href={post.tweetUrl} target="_blank" rel="noreferrer"
                 className="rounded-md bg-raised px-1.5 py-0.5 text-[11px] text-muted hover:text-fg"
                 title="Also posted to X">
                on 𝕏 ↗
              </a>
            )}
            {post.official && <span className="text-[11px] text-volt">Official Mentions</span>}
            {post.globalPinned && <span className="text-[11px] text-volt">Pinned sitewide</span>}
            {me?.role && <Link href="/admin" className="text-[11px] text-muted hover:text-volt">Moderate</Link>}
            {post.pinned && <span className="text-[11px] text-volt">pinned</span>}
          </div>

          <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed">{post.content}</p>

          {post.mediaUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={post.mediaUrl} alt="" className="mt-3 max-h-[480px] rounded-xl border hairline object-cover" />
          )}

          {act.error && <p role="alert" className="mt-2 text-xs text-down">{act.error.message}</p>}
          <div className="mt-3 flex items-center gap-8 text-sm text-muted">
            <button
              disabled={act.isPending}
              onClick={() => engage(post.likedByMe, "like", "unlike")}
              className={`hover:text-volt ${post.likedByMe ? "text-volt" : ""}`}
            >
              ♥ {post.likes}
            </button>
            <button
              disabled={act.isPending}
              onClick={() => engage(post.repostedByMe, "repost", "unrepost")}
              className={`hover:text-up ${post.repostedByMe ? "text-up" : ""}`}
            >
              ⇄ {post.reposts}
            </button>
            <Link href={`/post/${encodeURIComponent(post.id)}`} aria-label={`View replies (${post.replies})`} className="hover:text-volt">◌ {post.replies}</Link>
            {me?.role && (
              <button
                onClick={() => api(`/v1/posts/${post.id}`, { method: "DELETE" }).then(() => qc.invalidateQueries({ queryKey: ["feed"] }))}
                className="ml-auto text-xs hover:text-down"
              >
                remove
              </button>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

function FeedSkeleton() {
  return (
    <div>
      {[...Array(5)].map((_, i) => (
        <div key={i} className="flex gap-3 border-b hairline px-5 py-4">
          <div className="h-10 w-10 rounded-full bg-surface" />
          <div className="flex-1 space-y-2 py-1">
            <div className="h-3 w-40 rounded bg-surface" />
            <div className="h-3 w-full rounded bg-surface" />
            <div className="h-3 w-2/3 rounded bg-surface" />
          </div>
        </div>
      ))}
    </div>
  );
}

function MarketActivityCard({ activity }: { activity: MarketActivityView }) {
  const b = activity.battle;
  const labels = { proposed: "Challenge proposed", accepted: "Challenge accepted · awaiting escrow", cancelled: "Challenge cancelled", expired: "Proposal expired" };
  return <article className="border-b hairline px-5 py-5">
    <div className="flex items-center gap-2 text-xs text-muted"><img src="/brand/favicon.svg" alt="" className="h-7 w-7"/><Link href="/mentionmarkets" className="font-semibold text-fg hover:text-volt">mentionmarkets</Link><span>·</span><time dateTime={activity.createdAt}>{formatDistanceToNowStrict(new Date(activity.createdAt), { addSuffix: true })}</time></div>
    <p className="mt-3 text-xs font-medium text-volt">{labels[activity.event]}</p>
    <Link href={`/mentionmarkets/${b.id}`} className="mt-3 block rounded-xl border hairline bg-surface p-4 transition hover:border-volt/40">
      <div className="flex flex-wrap items-center gap-3">{[b.challenger,b.opponent].map((coin,i)=><span key={coin.id} className="inline-flex items-center gap-2">{i===1&&<span className="mr-1 text-xs text-muted">vs</span>}{coin.pfpUrl?<img src={coin.pfpUrl} alt="" className="h-8 w-8 rounded-full object-cover"/>:<span className="flex h-8 w-8 items-center justify-center rounded-full bg-raised text-xs text-volt">{coin.ticker.slice(0,2)}</span>}<strong className="text-sm">${coin.ticker}</strong></span>)}</div>
      <p className="mt-3 text-xs leading-5 text-muted">{b.durationSecs/60}-minute proposed round · {({open:"Open proposal",accepted:"Awaiting escrow",cancelled:"Cancelled",expired:"Expired"})[b.status]}</p><span className="mt-3 block text-xs text-volt">View challenge →</span>
    </Link>
    <p className="mt-2 text-[11px] leading-5 text-muted">Draft challenge activity. No funds locked; no live wagering.</p>
  </article>;
}

"use client";

import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNowStrict } from "date-fns";
import Link from "next/link";
import type { PostView } from "@mention/shared";
import { api } from "@/lib/api";
import { useMe } from "@/lib/hooks";

interface FeedPage { items: PostView[]; nextCursor: string | null }

export function Feed({ communityId, author, scope }: {
  communityId?: string;
  author?: string;
  /** "joined" = only the viewer's communities (needs auth) */
  scope?: "joined";
}) {
  const { me } = useMe();
  const params = new URLSearchParams();
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

  const items = feed.data?.pages.flatMap((p) => p.items) ?? [];

  if (feed.isLoading) return <FeedSkeleton />;
  if (items.length === 0) {
    return (
      <div className="px-6 py-16 text-center text-muted">
        <p className="mb-1 font-medium text-fg">
          {scope === "joined" ? "Your communities are quiet" : "Nothing here yet"}
        </p>
        <p className="text-sm">
          {scope === "joined"
            ? "Join a community and its posts — on-site and from X — show up here."
            : "Posts made here and matching tweets from X both land in this feed."}
        </p>
      </div>
    );
  }

  return (
    <div>
      {items.map((p) => <PostCard key={p.id} post={p} />)}
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
    onSettled: () => qc.invalidateQueries({ queryKey: ["feed"] }),
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
            <span className="text-muted">· {formatDistanceToNowStrict(new Date(post.createdAt))}</span>
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
            {post.source === "native" && post.crosspostStatus === "posted" && post.tweetUrl && (
              <a href={post.tweetUrl} target="_blank" rel="noreferrer"
                 className="rounded-md bg-raised px-1.5 py-0.5 text-[11px] text-muted hover:text-fg"
                 title="Also posted to X">
                on 𝕏 ↗
              </a>
            )}
            {post.pinned && <span className="text-[11px] text-volt">pinned</span>}
          </div>

          <p className="mt-1 whitespace-pre-wrap break-words text-[13px] leading-relaxed">{post.content}</p>

          {post.mediaUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={post.mediaUrl} alt="" className="mt-3 max-h-[480px] rounded-xl border hairline object-cover" />
          )}

          <div className="mt-3 flex items-center gap-8 text-sm text-muted">
            <button
              onClick={() => engage(post.likedByMe, "like", "unlike")}
              className={`hover:text-volt ${post.likedByMe ? "text-volt" : ""}`}
            >
              ♥ {post.likes}
            </button>
            <button
              onClick={() => engage(post.repostedByMe, "repost", "unrepost")}
              className={`hover:text-up ${post.repostedByMe ? "text-up" : ""}`}
            >
              ⇄ {post.reposts}
            </button>
            <span>◌ {post.replies}</span>
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

"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useMe } from "@/lib/hooks";

export function Composer({ communityId }: { communityId: string }) {
  const { authenticated, login, me } = useMe();
  const [content, setContent] = useState("");
  const [toX, setToX] = useState(true);
  const qc = useQueryClient();

  const post = useMutation({
    mutationFn: () =>
      api<{ id: string; crosspostStatus: string }>("/v1/posts", {
        method: "POST",
        body: { communityId, content, crosspostToX: toX && (me?.xWriteConnected ?? false) },
      }),
    onSuccess: () => {
      setContent("");
      qc.invalidateQueries({ queryKey: ["feed"] });
    },
  });

  if (!authenticated) {
    return (
      <div className="border-b hairline px-5 py-4">
        <button onClick={login} className="text-sm text-volt hover:underline">
          Sign in with X to post
        </button>
      </div>
    );
  }

  return (
    <div className="border-b hairline px-5 py-4">
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Say it here, it lands on X too"
        rows={2}
        maxLength={280}
        className="w-full resize-none bg-transparent text-[15px] outline-none placeholder:text-muted"
      />
      <div className="mt-2 flex items-center justify-between">
        <label className="flex items-center gap-2 text-xs text-muted">
          <input
            type="checkbox"
            checked={toX && (me?.xWriteConnected ?? false)}
            disabled={!me?.xWriteConnected}
            onChange={(e) => setToX(e.target.checked)}
            className="accent-volt"
          />
          {me?.xWriteConnected ? "Also post to my X" : "Connect X in settings to cross-post"}
        </label>
        <div className="flex items-center gap-3">
          <span className="font-mono text-xs text-muted">{content.length}/280</span>
          <button
            onClick={() => post.mutate()}
            disabled={!content.trim() || post.isPending}
            className="rounded-full bg-volt px-4 py-1.5 text-sm font-semibold text-ink hover:bg-volt-deep disabled:opacity-40"
          >
            Post
          </button>
        </div>
      </div>
      {post.isError && <p className="mt-2 text-xs text-down">{(post.error as Error).message}</p>}
    </div>
  );
}

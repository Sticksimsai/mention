"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/components/AuthProvider";
import { api } from "./api";

export interface Me {
  id: string;
  username: string;
  displayName: string;
  pfpUrl: string;
  role: "admin" | "moderator" | null;
  banned: boolean;
  xWriteConnected: boolean;
  xWriteEnabled: boolean;
}

/** Resolve the current X profile with an explicit token and account-scoped cache. */
export function useMe() {
  const { ready, authenticated, getAccessToken, login, logout, userId, available } = useAuth();
  const qc = useQueryClient();

  const me = useQuery({
    queryKey: ["me", userId],
    queryFn: async () => {
      const token = await getAccessToken();
      if (!token) throw new Error("Your session is not ready. Please retry.");
      return api<Me>("/v1/users/me", { token });
    },
    enabled: ready && authenticated && Boolean(userId),
    staleTime: 30_000,
  });

  return {
    ready, authenticated, available, login,
    logout: async () => { await logout(); qc.clear(); },
    me: authenticated ? me.data ?? null : null,
    isLoading: authenticated && me.isPending,
    error: authenticated ? me.error : null,
    retry: me.refetch,
  };
}

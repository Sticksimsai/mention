"use client";

import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/components/AuthProvider";
import { api, registerTokenGetter } from "./api";

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

/** Wires Privy's access token into the api client and loads /users/me. */
export function useMe() {
  const { ready, authenticated, getAccessToken, login, logout } = useAuth();
  const qc = useQueryClient();

  useEffect(() => {
    registerTokenGetter(async () => (authenticated ? getAccessToken() : null));
  }, [authenticated, getAccessToken]);

  const me = useQuery({
    queryKey: ["me"],
    queryFn: () => api<Me>("/v1/users/me"),
    enabled: ready && authenticated,
    staleTime: 30_000,
  });

  return {
    ready, authenticated, login,
    logout: async () => { await logout(); qc.clear(); },
    me: me.data ?? null,
  };
}

"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Shell } from "@/components/Shell";
import { api } from "@/lib/api";
import { useMe } from "@/lib/hooks";

export default function SettingsPage() {
  const { authenticated, login, me } = useMe();
  const qc = useQueryClient();

  const connect = useMutation({
    mutationFn: () => api<{ url: string }>("/v1/x/connect"),
    onSuccess: (d) => { window.location.href = d.url; },
  });
  const toggle = useMutation({
    mutationFn: (enabled: boolean) => api("/v1/x/toggle", { method: "POST", body: { enabled } }),
    onSettled: () => qc.invalidateQueries({ queryKey: ["me"] }),
  });
  const disconnect = useMutation({
    mutationFn: () => api("/v1/x", { method: "DELETE" }),
    onSettled: () => qc.invalidateQueries({ queryKey: ["me"] }),
  });

  return (
    <Shell>
      <div className="border-b hairline px-5 py-4">
        <h1 className="font-display text-base font-medium">Settings</h1>
      </div>

      {!authenticated ? (
        <div className="px-5 py-12 text-center">
          <button onClick={login} className="rounded-full bg-volt px-6 py-2.5 font-semibold text-ink">Sign in with X</button>
        </div>
      ) : (
        <div className="space-y-6 px-5 py-6">
          <section className="rounded-2xl bg-surface p-5">
            <h2 className="font-medium">Post to X</h2>
            <p className="mt-1 text-sm leading-relaxed text-muted">
              Mirror your Tribes posts to your X account. Signing in proves who you are;
              this separate step grants posting permission, and you can turn it off any time.
            </p>
            {!me?.xWriteConnected ? (
              <button
                onClick={() => connect.mutate()}
                disabled={connect.isPending}
                className="mt-4 rounded-full bg-volt px-5 py-2 text-sm font-semibold text-ink hover:bg-volt-deep"
              >
                Connect X for posting
              </button>
            ) : (
              <div className="mt-4 flex items-center gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={me.xWriteEnabled}
                    onChange={(e) => toggle.mutate(e.target.checked)}
                    className="accent-volt"
                  />
                  Mirror my posts to X
                </label>
                <button onClick={() => disconnect.mutate()} className="text-sm text-muted hover:text-down">
                  Disconnect
                </button>
              </div>
            )}
            {connect.isError && <p className="mt-2 text-xs text-down">{(connect.error as Error).message}</p>}
          </section>

          <section className="rounded-2xl bg-surface p-5">
            <h2 className="font-medium">Profile</h2>
            <p className="mt-1 text-sm text-muted">
              Your name, handle and avatar follow your X profile automatically.
            </p>
          </section>
        </div>
      )}
    </Shell>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";

export interface Account { signedIn: boolean; email: string | null; userName: string | null; family: { id: string; name: string } | null; googleConfigured: boolean; youtubeImport?: boolean }
const signedOut: Account = { signedIn: false, email: null, userName: null, family: null, googleConfigured: false };

export const signInUrl = () => `/api/auth/google?return=${encodeURIComponent(window.location.pathname + window.location.search)}`;

export default function useAccount() {
  const [account, setAccount] = useState<Account>(signedOut);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  useEffect(() => {
    let alive = true;
    fetch("/api/auth/session", { cache: "no-store", signal: AbortSignal.timeout(10_000) })
      .then(response => response.ok ? response.json() : Promise.reject())
      .then((value: Account) => { if (alive) setAccount(value); })
      .catch(() => { if (alive) setError(true); })
      .finally(() => { if (alive) setLoaded(true); });
    return () => { alive = false; };
  }, []);
  const signOut = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST", cache: "no-store" }).catch(() => undefined);
    // Cached children belong to the family that just signed out.
    try { localStorage.removeItem("mira-luke-profiles-v1"); } catch { /* Private mode: nothing cached. */ }
    window.location.assign("/");
  }, []);
  return { account, loaded, error, signOut };
}

"use client";

import { useEffect, useState } from "react";
import { accountService, AUTH_CHANGED_EVENT, type AccountUser } from "@/services/account";

export function useOwnerStatus(): { user: AccountUser | null; isOwner: boolean; loading: boolean } {
  const [user, setUser] = useState<AccountUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    void accountService.me()
      .then((account) => { if (active) setUser(account); })
      .catch(() => { if (active) setUser(null); })
      .finally(() => { if (active) setLoading(false); });

    const onAuthChanged = (event: Event) => {
      setUser((event as CustomEvent<AccountUser | null>).detail);
      setLoading(false);
    };
    window.addEventListener(AUTH_CHANGED_EVENT, onAuthChanged);
    return () => {
      active = false;
      window.removeEventListener(AUTH_CHANGED_EVENT, onAuthChanged);
    };
  }, []);

  return { user, isOwner: Boolean(user?.is_owner), loading };
}

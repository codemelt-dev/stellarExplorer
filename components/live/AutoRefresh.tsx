"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { LIST_REFRESH_MS } from "./cadence";

// re-runs the server page on an interval so list pages stay live.
// Skips while the tab is hidden
export function AutoRefresh({ everyMs = LIST_REFRESH_MS }: { everyMs?: number }) {
  const router = useRouter();

  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, everyMs);
    return () => clearInterval(id);
  }, [router, everyMs]);

  return null;
}

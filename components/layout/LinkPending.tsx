"use client";

import { useLinkStatus } from "next/link";

// put inside a Link: while its page loads this marks the DOM with data-pending,
// so an ancestor can dim, show a spinner or block more clicks with has-[[data-pending]]
export function LinkPending() {
  const { pending } = useLinkStatus();
  return <span hidden data-pending={pending ? "" : undefined} />;
}

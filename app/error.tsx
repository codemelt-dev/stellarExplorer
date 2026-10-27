"use client";

import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

// Anything a page didn't catch itself lands here, under the header. The
// digest matches the server log line for the same error
export default function PageError({ error, retry }: { error: unknown; retry: () => void }) {
  const digest = (error as { digest?: string } | null)?.digest;
  return (
    <div
      className="mx-auto flex w-full max-w-lg flex-col items-center gap-4 py-20 text-center sm:py-28"
      role="alert"
    >
      <span className="flex size-11 items-center justify-center rounded-xl border border-border bg-surface">
        <AlertTriangle className="size-5 text-fail" aria-hidden="true" />
      </span>
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">This page didn&apos;t load</h1>
      <p className="max-w-sm text-sm text-dim">
        Something failed while building it. Retrying usually fixes it; if not, one of our data
        sources may be down for a moment.
      </p>
      <Button variant="outline" onClick={retry}>
        Retry
      </Button>
      {digest && <p className="font-mono text-xs text-dim">Reference {digest}</p>}
      <Link href="/" className="rounded-sm text-sm text-gold underline-offset-4 hover:underline">
        Back to the live network
      </Link>
    </div>
  );
}

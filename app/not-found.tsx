import Link from "next/link";
import { Compass } from "lucide-react";
import { SearchBox } from "@/components/layout/SearchBox";

export default function NotFound() {
  return (
    <div className="mx-auto flex w-full max-w-lg flex-col items-center gap-4 py-20 text-center sm:py-28">
      <span className="flex size-11 items-center justify-center rounded-xl border border-border bg-surface">
        <Compass className="size-5 text-gold" aria-hidden="true" />
      </span>
      <p className="text-xs font-medium uppercase tracking-wider text-dim">404</p>
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Off the chart</h1>
      <p className="max-w-sm text-sm text-dim">
        This page doesn&apos;t exist. If you were looking for an account, transaction or
        contract, search for it below.
      </p>
      <SearchBox className="w-full" />
      <Link href="/" className="rounded-sm text-sm text-gold underline-offset-4 hover:underline">
        Back to the live network
      </Link>
    </div>
  );
}

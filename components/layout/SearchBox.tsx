"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { resolveQuery, routeFor } from "@/lib/stellar/resolveQuery";
import { cn } from "@/lib/utils";

// universal search box, detection lives in resolveQuery.ts
export function SearchBox({
  className,
  large = false,
  autoFocus = false,
}: {
  className?: string;
  large?: boolean;
  autoFocus?: boolean;
}) {
  const router = useRouter();
  const [value, setValue] = useState("");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const q = value.trim();
    if (!q) return;
    const route = routeFor(resolveQuery(q));
    router.push(route ?? `/search?q=${encodeURIComponent(q)}`);
    setValue("");
  }

  return (
    <form onSubmit={submit} className={cn("relative", className)} role="search">
      <Search
        className={cn(
          "pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-dim",
          large ? "size-4.5" : "size-4",
        )}
        aria-hidden="true"
      />
      <Input
        type="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        autoFocus={autoFocus}
        placeholder="Search accounts, contracts, transactions, ledgers, assets…"
        aria-label="Search the Stellar network"
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        className={cn(
          "bg-surface font-mono placeholder:font-sans placeholder:text-dim",
          large ? "h-12 pl-10 text-base" : "h-9 pl-9 text-sm",
        )}
      />
    </form>
  );
}

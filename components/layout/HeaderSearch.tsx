"use client";

import { usePathname } from "next/navigation";
import { SearchBox } from "./SearchBox";

// home has its own big search, so the header one steps aside there
export function HeaderSearch({ className }: { className?: string }) {
  if (usePathname() === "/") return null;
  return <SearchBox className={className} />;
}

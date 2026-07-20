"use client";

import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

// row-as-link, but inner links/buttons and text selection still win
export function ClickableRow({
  href,
  className,
  children,
  as = "tr",
}: {
  href: string;
  className?: string;
  children: React.ReactNode;
  as?: "tr" | "div";
}) {
  const router = useRouter();

  function onClick(e: React.MouseEvent) {
    const target = e.target as HTMLElement;
    if (target.closest("a,button")) return; // inner controls win
    if (window.getSelection()?.toString()) return; // don't hijack text selection
    router.push(href);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && e.target === e.currentTarget) {
      router.push(href);
    }
  }

  const Tag = as;
  return (
    <Tag
      onClick={onClick}
      onKeyDown={onKeyDown}
      tabIndex={0}
      role="link"
      aria-label="Open transaction"
      className={cn(
        "cursor-pointer transition-colors duration-150 hover:bg-surface-2/40 active:bg-surface-2/70",
        className,
      )}
    >
      {children}
    </Tag>
  );
}

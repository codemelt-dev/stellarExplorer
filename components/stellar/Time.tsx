"use client";

import { useEffect, useState } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

function relative(iso: string, now: number): string {
  const then = new Date(iso).getTime();
  const s = Math.round((now - then) / 1000);
  if (s < 0) return "just now";
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(mo / 12)}y ago`;
}

function absoluteUtc(iso: string): string {
  return new Date(iso).toISOString().replace("T", " ").replace(/\.\d+Z$/, " UTC");
}

function exactUtc(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getUTCDate())}-${pad(d.getUTCMonth() + 1)}-${d.getUTCFullYear()} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

// "25-06-2026 12:15:22 (1mo ago)", for tables where the precise moment matters
export function TimeExact({ iso, className }: { iso: string; className?: string }) {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  return (
    <time
      dateTime={iso}
      className={cn("font-mono text-xs text-dim whitespace-nowrap", className)}
    >
      {exactUtc(iso)}
      {now !== null && (
        <span className="text-dim/70"> ({relative(iso, now)})</span>
      )}
    </time>
  );
}

/** Relative by default ("2 min ago"), absolute UTC on hover. */
export function Time({ iso, className }: { iso: string; className?: string }) {
  // Render absolute on the server, swap to relative after mount (avoids
  // hydration mismatch and keeps fresh rows ticking).
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 10_000);
    return () => clearInterval(id);
  }, []);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <time
          dateTime={iso}
          className={cn("cursor-help text-sm text-dim whitespace-nowrap", className)}
        >
          {now === null ? absoluteUtc(iso) : relative(iso, now)}
        </time>
      </TooltipTrigger>
      <TooltipContent>
        <span className="font-mono text-xs">{absoluteUtc(iso)}</span>
      </TooltipContent>
    </Tooltip>
  );
}

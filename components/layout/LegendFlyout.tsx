"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import { Identicon } from "@/components/stellar/Identicon";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

const SAMPLE_ACCOUNT = "GA5XW2R4ALW4FLZK74Z6Z3MOBLOI2LFQ3RBZKOV2NVWCVCBNRMSJWQXH";
const SAMPLE_CONTRACT = "CBDKSXMVAX72JC45Q7QW2CA7YXCEL5KGUWCPA5ZKOYAKUIZ3BBRZMS6G";

// legend tab docked to the left edge. Expands on hover, tap toggles on touch
export function LegendFlyout() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function onPointerDown(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  return (
    <div
      ref={rootRef}
      className="fixed left-0 top-1/2 z-50 flex -translate-y-1/2 items-center"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <div
        className={cn(
          "overflow-hidden transition-[max-width,opacity] duration-200 ease-out",
          open ? "max-w-96 opacity-100" : "max-w-0 opacity-0",
        )}
        aria-hidden={!open}
      >
        <div className="w-80 rounded-r-lg border border-l-0 border-border bg-surface/85 p-4 backdrop-blur-md">
          <h3 className="mb-3 text-xs font-medium uppercase tracking-wider text-dim">
            Reading this explorer
          </h3>
          <div className="flex flex-col gap-2.5 text-sm">
            <LegendRow
              symbol={
                <span className="inline-flex items-center gap-1.5">
                  <Identicon
                    address={SAMPLE_ACCOUNT}
                    size={16}
                    className="rounded-[3px]"
                  />
                  <span className="font-mono text-xs">GA5X…WQXH</span>
                </span>
              }
            >
              <strong className="font-medium">Account</strong>: starts with G.
              The pattern is unique per address: same address, same pattern,
              everywhere.
            </LegendRow>
            <LegendRow
              symbol={
                <span className="inline-flex items-center gap-1.5">
                  <Identicon
                    address={SAMPLE_CONTRACT}
                    size={16}
                    className="rounded-[3px]"
                  />
                  <span className="font-mono text-xs text-contract">
                    CBDK…MS6G
                  </span>
                </span>
              }
            >
              <strong className="font-medium text-contract">
                Smart contract
              </strong>
              : starts with C, always violet. Contract activity is violet in
              every list.
            </LegendRow>
            <LegendRow symbol={<span className="font-mono text-xs">M…</span>}>
              <strong className="font-medium">Muxed account</strong>: a virtual
              id on top of a G account.
            </LegendRow>
            <Separator className="my-1" />
            <LegendRow
              symbol={
                <span className="inline-flex items-center gap-1">
                  <CheckCircle2
                    className="size-3.5 text-ok"
                    aria-hidden="true"
                  />
                  <XCircle className="size-3.5 text-fail" aria-hidden="true" />
                </span>
              }
            >
              Green = succeeded, red = failed. Rows without a mark succeeded.
            </LegendRow>
            <LegendRow symbol={<span className="h-1 w-8 rounded-full bg-gold" />}>
              Gold = live. The bar tracks the current ledger closing (~5s);
              gold text links to ledgers.
            </LegendRow>
            <Separator className="my-1" />
            <LegendRow
              symbol={
                <span className="flex h-1 w-8 overflow-hidden rounded-full bg-surface-2">
                  <span className="h-full w-2/3 rounded-full bg-dim/50" />
                </span>
              }
            >
              Activity bar: that ledger&apos;s transactions vs the busiest
              ledger in view.
            </LegendRow>
            <LegendRow
              symbol={<span className="font-mono text-xs text-dim">rows</span>}
            >
              Any row in a feed or history opens its transaction. Addresses
              open their account or contract.
            </LegendRow>
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="Legend: what the colors and icons mean"
        className={cn(
          "cursor-pointer rounded-r-lg border border-l-0 border-border bg-surface px-1.5 py-4",
          "text-[11px] font-medium uppercase tracking-[0.2em] text-dim",
          "transition-colors duration-150 hover:text-foreground",
          "[writing-mode:vertical-rl] [text-orientation:upright]",
          open && "text-foreground",
        )}
      >
        Legend
      </button>
    </div>
  );
}

function LegendRow({
  symbol,
  children,
}: {
  symbol: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[7rem_1fr] items-start gap-2">
      <span className="flex min-h-5 items-center">{symbol}</span>
      <span className="text-xs leading-5 text-dim">{children}</span>
    </div>
  );
}

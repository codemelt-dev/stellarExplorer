"use client";

import { useId, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronDown, Layers, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Amount } from "@/components/stellar/Amount";
import { Identicon } from "@/components/stellar/Identicon";
import { StellarMark } from "@/components/stellar/StellarMark";
import { Segmented } from "@/components/layout/Segmented";
import { EmptyState } from "@/components/states/EmptyState";
import { formatUsdValue } from "@/lib/format";
import { assetHref } from "@/lib/stellar/assetId";
import {
  arrangeHoldings,
  holdingTotals,
  matchesHolding,
  sortHoldings,
  type Holding,
  type HoldingSort,
} from "@/lib/stellar/holdings";
import { truncateKey } from "@/lib/stellar/strkey";
import { cn } from "@/lib/utils";

// rows under XLM before a long list folds behind "Show all"
const TOP = 5;

const SORTS = [
  { id: "value", label: "Value" },
  { id: "name", label: "Name" },
];

const count = (n: number, word: string) => `${n.toLocaleString("en-US")} ${word}${n === 1 ? "" : "s"}`;

// XLM first, then the rest by value. A long list shows its top rows and opens
// in place with a filter and sort; on wide screens it scrolls inside the card
// so the history stays close, on phones it just grows
export function BalancesCard({ holdings }: { holdings: Holding[] }) {
  const [expanded, setExpanded] = useState(false);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<HoldingSort>("value");
  const listId = useId();

  const native = holdings.find((h) => h.kind === "native");
  const rest = useMemo(() => holdings.filter((h) => h.kind !== "native"), [holdings]);
  const entries = useMemo(() => arrangeHoldings(rest, sort), [rest, sort]);
  const totals = useMemo(() => holdingTotals(holdings), [holdings]);
  const long = entries.length > TOP + 1;
  const filtering = expanded && query.trim() !== "";
  const matches = useMemo(
    () => (filtering ? sortHoldings(holdings, sort).filter((h) => matchesHolding(h, query)) : []),
    [filtering, holdings, sort, query],
  );
  const shown = expanded || !long ? entries : entries.slice(0, TOP);

  return (
    <Card className="gap-4 p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-base font-semibold">Balances</h2>
        {holdings.length > 0 && <span className="text-xs text-dim">{count(holdings.length, "asset")}</span>}
      </div>

      {holdings.length === 0 ? (
        <EmptyState message="No balances. This account holds no assets." />
      ) : (
        <>
          {totals.usd !== null && (
            <div className="-mt-2 flex flex-col gap-0.5">
              <span className="text-2xl font-semibold tracking-tight tabular-nums">
                {formatUsdValue(totals.usd)}
              </span>
              <span className="text-xs text-dim">
                Estimated from our own pools
                {totals.unpriced > 0 && `, ${count(totals.unpriced, "asset")} without a price`}
              </span>
            </div>
          )}

          {expanded && (
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-40 flex-1">
                <Search
                  className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-dim"
                  aria-hidden="true"
                />
                <Input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Filter by code or issuer"
                  aria-label="Filter assets by code or issuer"
                  className="pl-8"
                />
              </div>
              {totals.usd !== null && (
                <Segmented label="Sort assets" options={SORTS} value={sort} onChange={(id) => setSort(id as HoldingSort)} />
              )}
            </div>
          )}

          <div
            id={listId}
            className={cn(expanded && "md:max-h-[28rem] md:overflow-y-auto md:overscroll-contain md:pr-2")}
          >
            {filtering ? (
              matches.length > 0 ? (
                <ul className="divide-y divide-border">
                  {matches.map((h) => (
                    <HoldingRow key={h.key} holding={h} />
                  ))}
                </ul>
              ) : (
                <p className="py-6 text-center text-sm text-dim">
                  No asset matches <span className="font-mono text-foreground">{query.trim()}</span>.{" "}
                  <button
                    type="button"
                    onClick={() => setQuery("")}
                    className="text-gold underline-offset-4 hover:underline"
                  >
                    Clear the filter
                  </button>
                </p>
              )
            ) : (
              <ul className="divide-y divide-border">
                {native && <HoldingRow holding={native} />}
                {shown.map((e) =>
                  e.kind === "holding" ? (
                    <HoldingRow key={e.holding.key} holding={e.holding} />
                  ) : (
                    <IssuerGroup key={e.issuer} issuer={e.issuer} holdings={e.holdings} />
                  ),
                )}
              </ul>
            )}
          </div>

          {long && (
            <Button
              variant="ghost"
              aria-expanded={expanded}
              aria-controls={listId}
              onClick={() => {
                setExpanded(!expanded);
                setQuery("");
              }}
              className="-mb-1 h-10 w-full text-dim"
            >
              {expanded ? "Show fewer" : `Show all ${count(holdings.length, "asset")}`}
              <ChevronDown
                className={cn("size-4 motion-safe:transition-transform", expanded && "rotate-180")}
                aria-hidden="true"
              />
            </Button>
          )}
        </>
      )}
    </Card>
  );
}

// an issuer's unpriced pile, nearly always an airdrop, as one row that opens
function IssuerGroup({ issuer, holdings }: { issuer: string; holdings: Holding[] }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const named = holdings.slice(0, 3).map((h) => h.code).join(", ");
  const more = holdings.length - 3;

  return (
    <li>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(!open)}
        className="-mx-2 flex w-[calc(100%+1rem)] items-center justify-between gap-3 rounded-md px-2 py-2.5 text-left hover:bg-surface-2 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        <span className="flex min-w-0 items-center gap-2.5">
          <Identicon address={issuer} size={20} className="shrink-0 rounded-full" />
          <span className="min-w-0">
            <span className="block text-sm">
              {count(holdings.length, "asset")} from <span className="font-mono">{truncateKey(issuer)}</span>
            </span>
            <span className="block truncate text-xs text-dim">
              {named}
              {more > 0 && ` and ${more} more`}, none with a price
            </span>
          </span>
        </span>
        <ChevronDown
          className={cn("size-4 shrink-0 text-dim motion-safe:transition-transform", open && "rotate-180")}
          aria-hidden="true"
        />
      </button>
      {open && (
        <ul id={id} className="mb-1 ml-2.5 divide-y divide-border border-l border-border pl-4">
          {holdings.map((h) => (
            <HoldingRow key={h.key} holding={h} />
          ))}
        </ul>
      )}
    </li>
  );
}

function HoldingRow({ holding }: { holding: Holding }) {
  const empty = !/[1-9]/.test(holding.amount);
  return (
    <li className={cn("flex items-center justify-between gap-3 py-2.5", empty && "opacity-60")}>
      <div className="flex min-w-0 items-center gap-2.5">
        <HoldingIcon holding={holding} />
        <div className="min-w-0">
          <Link
            href={hrefOf(holding)}
            className="block truncate font-mono text-sm underline-offset-4 hover:text-gold hover:underline"
          >
            {holding.code}
          </Link>
          <div className="truncate text-xs text-dim" title={holding.issuer ?? undefined}>
            {holding.kind === "native" ? (
              "native"
            ) : (
              <>
                {holding.kind === "pool" ? "pool " : "issued by "}
                <span className="font-mono">{truncateKey(holding.issuer ?? holding.key)}</span>
              </>
            )}
          </div>
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-0.5">
        <Amount amount={holding.amount} assetCode="" assetIssuer={holding.issuer ?? undefined} />
        {holding.usd !== null && !empty && (
          <span className="text-xs text-dim tabular-nums">{formatUsdValue(holding.usd)}</span>
        )}
      </div>
    </li>
  );
}

function HoldingIcon({ holding }: { holding: Holding }) {
  if (holding.kind === "issued") {
    return <Identicon address={holding.issuer!} size={20} className="shrink-0 rounded-full" />;
  }
  return (
    <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-surface-2">
      {holding.kind === "native" ? (
        <StellarMark className="size-3" />
      ) : (
        <Layers className="size-3 text-dim" aria-hidden="true" />
      )}
    </span>
  );
}

function hrefOf(holding: Holding): string {
  if (holding.kind === "pool") return `/pool/${holding.key}`;
  return holding.kind === "native"
    ? assetHref({ kind: "native", code: "XLM" })
    : assetHref({ kind: "issued", code: holding.code, issuer: holding.issuer! });
}

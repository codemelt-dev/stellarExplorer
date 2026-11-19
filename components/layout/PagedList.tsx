"use client";

import { Children, useEffect, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { pageWindow } from "@/lib/paging";
import { cn } from "@/lib/utils";

const SIZES = [10, 20, 50];
const DEFAULT_SIZE = 20;

const pageButton =
  "inline-flex h-8 min-w-8 items-center justify-center rounded-md border border-border px-2 font-mono text-xs transition-colors duration-150";

function Pages({
  page,
  pages,
  range,
  onPick,
}: {
  page: number;
  pages: number;
  range: string;
  onPick: (page: number) => void;
}) {
  return (
    <nav className="flex flex-wrap items-center gap-1" aria-label="Pages">
      <span className="mr-2 font-mono text-xs text-dim tabular-nums">{range}</span>
      <button
        type="button"
        onClick={() => onPick(page - 1)}
        disabled={page === 1}
        aria-label="Previous page"
        className={cn(pageButton, "text-dim hover:bg-surface-2 hover:text-foreground disabled:pointer-events-none disabled:opacity-40")}
      >
        <ChevronLeft className="size-3.5" aria-hidden="true" />
      </button>
      {pageWindow(page, pages).map((p, i) =>
        p === "gap" ? (
          <span key={`gap-${i}`} className="px-1 text-xs text-dim select-none" aria-hidden="true">
            ...
          </span>
        ) : (
          <button
            key={p}
            type="button"
            onClick={() => onPick(p)}
            aria-current={p === page ? "page" : undefined}
            className={cn(
              pageButton,
              p === page
                ? "border-gold/50 bg-surface-2 text-foreground"
                : "text-dim hover:bg-surface-2 hover:text-foreground",
            )}
          >
            {p}
          </button>
        ),
      )}
      <button
        type="button"
        onClick={() => onPick(page + 1)}
        disabled={page === pages}
        aria-label="Next page"
        className={cn(pageButton, "text-dim hover:bg-surface-2 hover:text-foreground disabled:pointer-events-none disabled:opacity-40")}
      >
        <ChevronRight className="size-3.5" aria-hidden="true" />
      </button>
    </nav>
  );
}

/**
 * Pages through rows that are already on the page: 10, 20 or 50 at a time.
 * With `anchorPrefix`, row N carries id `<prefix>N`; all rows stay mounted
 * (hidden ones too) so a link or jump to that id finds it, opens its page and
 * the row still gets :target. Without it only the visible rows render.
 * With `hasMore`, the rows are a first batch: showing the last page calls
 * `onLastPage` so the caller can append the next one.
 */
export function PagedList({
  children,
  anchorPrefix,
  topId,
  className,
  hasMore = false,
  onLastPage,
  header,
}: {
  children: ReactNode;
  /** Column headings, shown above the rows and below the page controls. */
  header?: ReactNode;
  anchorPrefix?: string;
  /** Scrolled back to when a page is picked from the bottom bar. */
  topId?: string;
  className?: string;
  /** More rows exist than are loaded. */
  hasMore?: boolean;
  onLastPage?: () => void;
}) {
  const rows = Children.toArray(children);
  const count = rows.length;
  const [view, setView] = useState({ page: 1, size: DEFAULT_SIZE });

  const pages = Math.max(1, Math.ceil(count / view.size));
  const page = Math.min(view.page, pages);
  const start = (page - 1) * view.size;
  const end = Math.min(start + view.size, count);

  useEffect(() => {
    if (!anchorPrefix) return;
    const sync = () => {
      const id = window.location.hash.slice(1);
      if (!id.startsWith(anchorPrefix)) return;
      const n = Number(id.slice(anchorPrefix.length));
      if (!Number.isInteger(n) || n < 1 || n > count) return;
      setView((v) => ({ ...v, page: Math.ceil(n / v.size) }));
      // the row is only visible once that page has rendered
      requestAnimationFrame(() =>
        requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView()),
      );
    };
    const frame = requestAnimationFrame(sync);
    window.addEventListener("hashchange", sync);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("hashchange", sync);
    };
  }, [anchorPrefix, count]);

  useEffect(() => {
    if (hasMore && page === pages) onLastPage?.();
  }, [hasMore, page, pages, onLastPage]);

  const pick = (next: number, fromBottom: boolean) => {
    setView((v) => ({ ...v, page: next }));
    if (fromBottom && topId) document.getElementById(topId)?.scrollIntoView();
  };
  // keep the first row on screen where it is when the page size changes
  const resize = (size: number) => setView({ size, page: Math.floor(start / size) + 1 });

  const paged = count > SIZES[0];
  const range = `${start + 1}-${end} of ${count}${hasMore ? "+" : ""}`;

  return (
    <>
      {paged && (
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <div className="flex items-center gap-2 text-xs text-dim">
            <span>Show</span>
            <div
              role="group"
              aria-label="Rows per page"
              className="flex gap-0.5 rounded-lg border border-border/60 bg-surface p-0.5"
            >
              {SIZES.map((size) => (
                <button
                  key={size}
                  type="button"
                  onClick={() => resize(size)}
                  aria-pressed={size === view.size}
                  className={cn(
                    "rounded-md px-2.5 py-1 font-mono text-xs transition-colors duration-150",
                    size === view.size
                      ? "bg-surface-2 text-foreground"
                      : "text-dim hover:text-foreground",
                  )}
                >
                  {size}
                </button>
              ))}
            </div>
          </div>
          {pages > 1 && (
            <Pages page={page} pages={pages} range={range} onPick={(p) => pick(p, false)} />
          )}
        </div>
      )}
      <div className={className}>
        {header}
        {anchorPrefix
          ? rows.map((row, i) => (
              <div key={i} hidden={i < start || i >= end}>
                {row}
              </div>
            ))
          : rows.slice(start, end)}
      </div>
      {paged && pages > 1 && (
        <div className="flex justify-end">
          <Pages page={page} pages={pages} range={range} onPick={(p) => pick(p, true)} />
        </div>
      )}
    </>
  );
}

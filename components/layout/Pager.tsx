import Link from "next/link";
import { ChevronRight, ChevronsLeft } from "lucide-react";

// newest-first paging: back to latest, or on to older rows
export function Pager({
  basePath,
  olderCursor,
  isFirstPage,
}: {
  basePath: string;
  olderCursor: string | null;
  isFirstPage: boolean;
}) {
  const btn =
    "inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-sm transition-colors duration-150 hover:bg-surface-2";
  return (
    <nav className="flex items-center justify-end gap-2" aria-label="Pages">
      {!isFirstPage && (
        <Link href={basePath} className={btn}>
          <ChevronsLeft className="size-3.5" aria-hidden="true" />
          Latest
        </Link>
      )}
      {olderCursor && (
        <Link href={`${basePath}?cursor=${olderCursor}`} className={btn}>
          Older
          <ChevronRight className="size-3.5" aria-hidden="true" />
        </Link>
      )}
    </nav>
  );
}

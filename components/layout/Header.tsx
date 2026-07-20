import Link from "next/link";
import { SearchBox } from "./SearchBox";
import { NetworkSwitcher } from "./NetworkSwitcher";
import { ThemeToggle } from "./ThemeToggle";
import { WalletButton } from "./WalletButton";
import { HeaderPulse } from "@/components/live/LedgerPulse";

export function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur">
      <div className="mx-auto flex w-full max-w-300 flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 sm:px-6">
        <Link
          href="/"
          className="flex shrink-0 items-center gap-2 rounded-sm"
          aria-label="Stellar Explorer home"
        >
          <span className="relative flex size-2.5">
            <span className="absolute inline-flex size-full rounded-full bg-gold" />
          </span>
          <span className="text-base font-semibold tracking-tight">
            stellar<span className="text-dim">.pulse</span>
          </span>
        </Link>

        <SearchBox className="order-last w-full sm:order-none sm:w-auto sm:flex-1 sm:max-w-xl" />

        <span className="ml-auto flex shrink-0 items-center gap-2.5">
          <HeaderPulse />
          <NetworkSwitcher />
          <WalletButton />
          <ThemeToggle />
        </span>
      </div>
    </header>
  );
}

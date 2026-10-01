import Link from "next/link";
import { HeaderSearch } from "./HeaderSearch";
import { WalletButton } from "./WalletButton";
import { MainNav } from "./MainNav";

export function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/50 bg-background/90 backdrop-blur">
      <div className="mx-auto flex w-full max-w-300 flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 sm:px-6">
        <Link
          href="/"
          className="flex shrink-0 items-center gap-2 rounded-sm"
          aria-label="Astrolabe home"
        >
          <span className="relative flex size-2.5">
            <span className="absolute inline-flex size-full rounded-full bg-gold" />
          </span>
          <span className="text-base font-bold tracking-tight">
            Astro
            <span className="text-gold">labe</span>
          </span>
        </Link>

        <MainNav className="-ml-2 hidden lg:flex" />

        <span className="ml-auto flex min-w-0 items-center gap-2.5">
          <HeaderSearch className="hidden w-64 sm:block xl:w-80" />
          <WalletButton />
        </span>

        <MainNav className="order-last -mx-2.5 w-full overflow-x-auto lg:hidden" />
        <HeaderSearch className="order-last w-full sm:hidden" />
      </div>
    </header>
  );
}
